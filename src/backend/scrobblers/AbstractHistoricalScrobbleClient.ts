import dayjs, { type Dayjs } from "dayjs";
import { sortByNewestDate } from "../../core/PlayUtils.ts";
import AbstractScrobbleClient from "./AbstractScrobbleClient.ts";
import type {ComponentMigrationSelect} from "../common/database/drizzle/drizzleTypes.ts";
import type {ErrorIsh} from "../../core/ErrorUtils.ts";
import { DrizzlePlayHistoricalRepository, playToRepositoryCreatePlayHistoricalOpts, type RepositoryCreatePlayHistoricalOpts } from "../common/database/drizzle/repositories/PlayHistoricalRepository.ts";
import { spawn, isAbortError, abortable } from 'abort-controller-x';
import { generateLoggableAbortReason, PlayParkedError } from "../common/errors/MSErrors.ts";
import type {Logger} from "@foxxmd/logging";
import { buildTrackString } from "../../core/MusicMetadata.ts";
import type { PlayObject } from "../../core/PlaySchema.ts";
import { todayAwareFormat } from "../../core/TimeUtils.ts";
import type { ComponentClientApiJson } from "../../core/Api.ts";
import fsPromise from 'node:fs/promises';
import path from 'node:path';
import { AsyncTask, SimpleIntervalJob } from "toad-scheduler";
import { addRange, subtractRanges, type TimeRange } from "../utils/RangeUtils.ts";
import { HISTORICAL_BUCKET_AFTER, HISTORICAL_BUCKET_DURATION, HISTORICAL_BUCKET_PADDING } from "../utils/ListenFetchUtils.ts";
import { DEAD_QUEUE, INGRESS_QUEUE } from "../../core/Atomic.ts";
import { setTimeout as sleep } from 'node:timers/promises';
import { MirrorRepository, type CoverageTag } from "../common/database/drizzle/repositories/MirrorRepository.ts";

/** How long a downloaded repo CAR is kept for reuse before it is deleted */
export const CAR_KEEP_MS = 60 * 60 * 1000;
const CAR_DELETE_JOB = 'carDelete';

/** Coverage origin of ranges an ensure pass mirrored. Not a sync, so it never extends coverage to now */
export const COVERAGE_ORIGIN_DUPE_CHECK = 'dupe-check';

export interface ParseCarOpts {
    allowFailures?: boolean
    logger?: Logger
    signal?: AbortSignal
    /** only store plays played in these inclusive ms ranges */
    ranges?: TimeRange[]
}

export const inRanges = (ts: number | undefined, ranges: TimeRange[]): boolean => ts !== undefined && ranges.some(([from, to]) => ts >= from && ts <= to);

/** Coverage a play's dupe check needs: its 6 hour bucket (the same one getSOTScrobblesForPlay caches by), extended by its duration */
export const coverageForPlay = (play: PlayObject): TimeRange | undefined => {
    const {playDate} = play.data;
    if(playDate === undefined) {
        return undefined;
    }
    const width = HISTORICAL_BUCKET_DURATION.asMilliseconds();
    const padding = HISTORICAL_BUCKET_PADDING.asMilliseconds();
    const start = Math.floor(playDate.valueOf() / width) * width;
    return [start - padding, start + width + padding + (play.data.duration ?? 0) * 1000];
}

/**
 * Remove what a historical play doesn't need to store: raw upstream data, the record URL and the user (both derivable from the DID and rkey).
 * Keeps `meta.url.origin`, which is real record data. Migration 009 does the same to existing rows.
 * */
export const slimHistoricalPlay = (play: PlayObject): PlayObject => {
    const {original, ...rest} = play;
    const {user, url: {web, ...url} = {}, ...meta} = rest.meta;
    return {...rest, meta: Object.keys(url).length > 0 ? {...meta, url} : meta};
}

export default abstract class AbstractHistoricalScrobbleClient extends AbstractScrobbleClient {

    protected importAbortController: AbortController | undefined;
    protected importPromise: Promise<void> | undefined;
    protected playsHistoricalRepo!: DrizzlePlayHistoricalRepository;
    lastImport?: Dayjs;
    lastImportSuccess?: Dayjs;
    synced!: boolean;
    syncedReason?: string;
    syncError?: ErrorIsh;
    override preloadScrobbles: boolean = false;
    protected addScrobbleToHistorical: boolean = true;

    protected abstract dataDir: string;

    /** The locked mirror (service + account DID) that holds this client's historical plays. Set in postInitialize */
    protected mirrorId?: number;

    /** The account DID that identifies this client's locked mirror. undefined while it is not resolved */
    protected abstract getMirrorAccount(): string | undefined;

    protected get mirrorRepo(): MirrorRepository {
        return new MirrorRepository(this.db, {logger: this.logger});
    }

    protected get coverageTag(): CoverageTag {
        return {origin: this.type, jobId: null};
    }

    /**
     * Find or create the locked mirror for this client's account and move its historical plays into it.
     * Plays this client stored for another account (the configured account changed) are deleted, they would give wrong dupe checks.
     * */
    /**
     * Parts of ranges the mirror does not cover. Everything after the last range a sync covered counts as covered:
     * the recent sync and this client's own scrobbles keep it. Without a successful sync, plays of the last day count as covered
     * (like before mirrors: checked against what is stored) so live plays are never parked.
     * Nothing is uncovered without a mirror.
     * */
    async uncoveredRanges(ranges: TimeRange[]): Promise<TimeRange[]> {
        if(this.mirrorId === undefined) {
            return [];
        }
        const {coverage, segments} = await this.mirrorRepo.getById(this.mirrorId) ?? {coverage: [], segments: []};
        const tail = this.syncedTail(segments) ?? Date.now() - HISTORICAL_BUCKET_AFTER.asMilliseconds();
        return ranges.flatMap(([from, to]) => from > tail ? [] : subtractRanges([from, Math.min(to, tail)], coverage));
    }

    /**
     * Resolve once the mirror covers ranges. Uncovered ranges wait for an ensure pass: one CAR pass that stores the plays of every range requested before it started.
     * Rejects if the pass fails. signal stops waiting, not the pass.
     * */
    /** End of the last range a sync covered */
    protected syncedTail(segments: {range: TimeRange, origin: string}[]): number | undefined {
        const synced = segments.filter(x => x.origin === this.coverageTag.origin);
        return synced.length === 0 ? undefined : Math.max(...synced.map(x => x.range[1]));
    }

    async ensureCoverage(ranges: TimeRange[], signal?: AbortSignal): Promise<void> {
        while(true) {
            const missing = await this.uncoveredRanges(ranges);
            if(missing.length === 0) {
                return;
            }
            for(const r of missing) {
                this.pendingCoverage = addRange(this.pendingCoverage, r);
            }
            if(this.coveragePass === undefined) {
                const pass = this.runCoveragePass().finally(() => {
                    this.coveragePass = undefined;
                });
                // waiters get the error, this keeps it handled when every waiter stopped waiting
                pass.catch(() => undefined);
                this.coveragePass = pass;
            }
            await (signal !== undefined ? abortable(signal, this.coveragePass) : this.coveragePass);
        }
    }

    /** Run fn after any other work on the repo CAR finished */
    protected async withCarLock<T>(fn: () => Promise<T>): Promise<T> {
        const previous = this.carWork;
        let release!: () => void;
        this.carWork = new Promise(r => {
            release = r;
        });
        await previous;
        try {
            return await fn();
        } finally {
            release();
        }
    }

    protected async runCoveragePass(): Promise<void> {
        const wait = this.coverageFailure === undefined ? 0 : this.coverageFailure.at + this.coverageFailureBackoffMs - Date.now();
        if(wait > 0) {
            this.logger.verbose(`Waiting ${Math.round(wait / 1000)}s after the last failed pass before the next pass over the repo CAR`);
            await sleep(wait, undefined, {ref: false});
        }
        // after a running full sync, which may cover them
        await this.withCarLock(() => this.doCoveragePass());
    }

    protected async doCoveragePass(): Promise<void> {
        const ranges = await this.uncoveredRanges(this.pendingCoverage);
        this.pendingCoverage = [];
        if(ranges.length === 0 || this.mirrorId === undefined) {
            return;
        }
        const summary = ranges.map(([from, to]) => `${todayAwareFormat(dayjs(from))} - ${todayAwareFormat(dayjs(to))}`).join(', ');
        this.logger.info(`Mirroring scrobbles from the repo CAR for dupe checks of older plays: ${summary}`);
        this.setStatus(`Mirroring scrobbles for ${ranges.length} older time ranges...`);
        try {
            await this.parseScrobblesFromCar(await this.getCarFile(), 100, {ranges, allowFailures: true});
            for(const r of ranges) {
                await this.mirrorRepo.addCoverage(this.mirrorId, r, {origin: COVERAGE_ORIGIN_DUPE_CHECK, jobId: null});
            }
            this.coverageFailure = undefined;
            this.setStatus(`Mirrored scrobbles for ${ranges.length} older time ranges`);
        } catch (e) {
            this.setStatus('Mirroring older scrobbles failed');
            const error = new Error('Could not mirror scrobbles for older plays', {cause: e});
            this.coverageFailure = {error, at: Date.now()};
            throw error;
        }
    }

    protected async useLockedMirror() {
        const account = this.getMirrorAccount();
        const userId = this.dbComponent.userId;
        if(account === undefined || userId === null) {
            this.logger.warn(`Historical plays are not kept in a mirror because ${account === undefined ? 'the account DID is not resolved' : 'the component has no owner'}`);
            return;
        }
        const mirror = await this.mirrorRepo.findOrCreate({userId, service: this.type, account, name: `${this.type} ${this.name}`});
        this.mirrorId = mirror.id;
        const stale = await this.playsHistoricalRepo.deleteComponentOutsideMirror(this.dbComponent.id, mirror.id);
        if(stale > 0) {
            this.logger.info(`Deleted ${stale} historical plays of an account this client used before`);
        }
        const moved = await this.playsHistoricalRepo.assignComponentToMirror(this.dbComponent.id, mirror.id, this.type);
        if(moved > 0) {
            this.logger.info(`Moved ${moved} historical plays into mirror '${mirror.name}'`);
        }
        if(mirror.coverage.length === 0 && this.synced && this.lastImportSuccess !== undefined) {
            // the last full sync mirrored everything before it started
            await this.mirrorRepo.addCoverage(mirror.id, [0, this.lastImportSuccess.valueOf()], this.coverageTag);
        }
    }

    /** Stream the user's repo CAR into filename */
    protected abstract downloadCar(filename: string): Promise<void>;

    abstract parseScrobblesFromCar(filename: string, batchSize: number, opts?: ParseCarOpts): Promise<void>;

    /** ms after a failed ensure pass before another can start. Downloads are already limited by reusing the CAR for CAR_KEEP_MS */
    protected coverageFailureBackoffMs = 15 * 60 * 1000;
    protected pendingCoverage: TimeRange[] = [];
    protected coveragePass?: Promise<void>;
    protected coverageFailure?: {error: Error, at: number};
    /** serializes work on the repo CAR: full syncs and ensure passes */
    protected carWork: Promise<void> = Promise.resolve();
    protected carFileTask?: Promise<string>;

    protected abstract doHydrateHistoricalScrobbles(opts: {allowFailures?: boolean, signal?: AbortSignal }): Promise<void>;

    public getApiData(): ComponentClientApiJson {
        return {
            ...super.getApiData(),
            synced: this.synced,
            syncedReason: this.syncedReason,
            syncError: this.syncError,
            lastImport: this.lastImport !== undefined ? this.lastImport.toISOString() : undefined,
            lastImportSuccess: this.lastImportSuccess !== undefined ? this.lastImportSuccess.toISOString() : undefined
        }
    }

    hydrateHistoricalScrobbles(allowFailures: boolean = false, cleanup: boolean = true): void {
        if(this.importAbortController !== undefined) {
            throw new Error('Cannot start a new import while one is already running');
        }
        // keep local reference since cleanup unsets importAbortController before catch runs
        const importAbortController = new AbortController();
        this.importAbortController = importAbortController;
        this.importPromise = spawn(importAbortController.signal, async (signal, {defer, fork}) => {

            defer(async () => {
                if(cleanup) {
                    this.importAbortController = undefined;
                    this.importPromise = undefined;
                }
            });
        
            const newImport: ComponentMigrationSelect = await this.migrationRepo.create({name: 'historicalImport', componentId: this.dbComponent.id}) as ComponentMigrationSelect;
            const startedAt = Date.now();
            try {
                this.setStatus('Starting full mirror rebuild...');
                // coverage inside the lock, so a waiting pass sees what this sync covered
                await this.withCarLock(async () => {
                    await this.doHydrateHistoricalScrobbles({signal, allowFailures});
                    if(this.mirrorId !== undefined) {
                        await this.mirrorRepo.addCoverage(this.mirrorId, [0, startedAt], this.coverageTag);
                    }
                });
                await this.migrationRepo.updateById(newImport.id, {success: true});
                this.logger.info('Sync complete');
                this.setStatus('Full mirror rebuild complete');
                this.synced = true;
                this.lastImportSuccess = dayjs();
            } catch (e: any) {
                await this.migrationRepo.updateById(newImport.id, {success: false, error: e});
                this.logger.warn(new Error('Failed to hydrate historical scrobbles', {cause: e}));
                this.syncError = e;
                this.syncedReason = 'last attempted import failed';
                this.synced = false;
                this.setStatus('Full mirror rebuild failed.');
            } finally {
                this.lastImport = dayjs();
                this.emitComponentUpdate<Partial<ComponentClientApiJson>>({
                    synced: this.synced,
                    lastImportSuccess: this.lastImportSuccess?.toISOString(),
                    lastImport: this.lastImport.toISOString(),
                    syncedReason: this.syncedReason ?? null,
                    syncError: this.syncError ?? null
                });
            }
            this.dbComponent.migrations.push(newImport);
        }).catch((e) => {
            if (isAbortError(e)) {
                const err = generateLoggableAbortReason('Import processing stopped', importAbortController.signal);
                this.logger.info(err);
                this.logger.trace(e)
            } else {
                this.logger.warn(new Error('Uncaught error during import processing', { cause: e }));
            }
        });
    }

    async getHistoricalScrobblesAreSynced(): Promise<[boolean, string?]> {
        const imports = this.dbComponent.migrations.filter(x => x.name === 'historicalImport');
        if(imports.length === 0) {
            return [false, 'no historical imports exist'];
        }
        imports.sort((a, b) => sortByNewestDate(a.attemptedAt, b.attemptedAt));
        if(!imports[0].success) {
            return [false, 'last attempted import failed'];
        }

        // vibing this duration for now...
        const {lastActiveAt} = this.dbComponent;
        if(lastActiveAt !== null && lastActiveAt.diff(dayjs(), 'minutes') > 60 && imports[0].attemptedAt.isBefore(lastActiveAt)) {
            return [true, 'component was inactive for more than an hour and last import was before last activity. There may be missed plays during the period of inactivity.'];
        }

        return [true];
    }

    protected async createHistoricalPlays(batch: RepositoryCreatePlayHistoricalOpts[], opts: {allowFailures?: boolean, logger?: Logger, signal?: AbortSignal} = {}): Promise<[boolean, number]> {
        const {
            allowFailures = false,
            logger = this.logger,
            signal
        } = opts;
        // no historical_play_inputs rows, the raw record stays in the PDS
        batch = batch.map(({input, ...x}) => ({...x, mirrorId: this.mirrorId, origin: this.type, play: slimHistoricalPlay(x.play)}));
        try {
            await this.playsHistoricalRepo.createPlays(batch);
            return [true, batch.length];
        } catch (e) {
            logger.warn(`Failed to persist batch of ${batch.length} plays, trying individually...`);
        }
        signal?.throwIfAborted();

        let valid = 0;
        for(const p of batch) {
            try {
                await this.playsHistoricalRepo.createPlays([p]);
                valid++;
            } catch (e) {
                if(allowFailures) {
                    logger.warn(p.play,`Failed to persist play from record with rKey ${p.play.meta.playId} => ${buildTrackString(p.play)}`);
                    logger.warn(e);
                } else {
                    logger.error(p.play,`Failed to persist play from record with rKey ${p.play.meta.playId} => ${buildTrackString(p.play)}`);
                    throw e;
                }
            }
            signal?.throwIfAborted();
        }

        return [false, valid];
    }

    protected get carPath(): string {
        return path.resolve(this.dataDir, `historical-${this.dbComponent.id}.car`);
    }

    /**
     * The repo CAR file. Reuses one downloaded less than CAR_KEEP_MS ago, else downloads it and schedules its deletion.
     * Downloads to a .part file first so an interrupted download is never reused.
     * */
    protected async getCarFile(): Promise<string> {
        // a full sync and an ensure pass can ask at once, download once
        if(this.carFileTask === undefined) {
            this.carFileTask = this.loadCarFile().finally(() => {
                this.carFileTask = undefined;
            });
        }
        return this.carFileTask;
    }

    protected async loadCarFile(): Promise<string> {
        const file = this.carPath;
        const stat = await fsPromise.stat(file).catch(() => undefined);
        const age = stat === undefined ? undefined : Date.now() - stat.mtimeMs;
        if(age !== undefined && age < CAR_KEEP_MS) {
            this.logger.verbose(`Reusing repo CAR downloaded ${Math.round(age / 60000)} minutes ago`);
            if(!this.scheduler.existsById(CAR_DELETE_JOB)) {
                this.scheduleCarDelete(CAR_KEEP_MS - age);
            }
            return file;
        }
        const part = `${file}.part`;
        try {
            await this.downloadCar(part);
        } catch (e) {
            await fsPromise.rm(part, {force: true});
            throw e;
        }
        await fsPromise.rename(part, file);
        this.scheduleCarDelete(CAR_KEEP_MS);
        return file;
    }

    /** One-off job: delete the repo CAR after ms */
    protected scheduleCarDelete(ms: number) {
        if(this.scheduler.existsById(CAR_DELETE_JOB)) {
            this.scheduler.removeById(CAR_DELETE_JOB);
        }
        this.scheduler.addSimpleIntervalJob(new SimpleIntervalJob({milliseconds: ms}, new AsyncTask('Delete repo CAR', async () => {
            this.scheduler.removeById(CAR_DELETE_JOB);
            await this.deleteCarFiles();
            this.logger.verbose('Deleted repo CAR');
        }, (err) => this.logger.warn(new Error('Failed to delete repo CAR', {cause: err}))), {id: CAR_DELETE_JOB}));
    }

    protected async deleteCarFiles() {
        for(const f of [this.carPath, `${this.carPath}.part`]) {
            await fsPromise.rm(f, {force: true});
        }
    }

    /**
     * Mirrored scrobbles close to play. When the mirror does not cover its time yet this starts a pass in the background
     * and throws PlayParkedError, so the queue processes other plays meanwhile. After a failed pass the next one waits for the backoff,
     * the play stays parked instead of failing (which would use up its retries).
     * */
    async getSOTScrobblesForPlay(play: PlayObject, opts?: {useCache?: boolean}): Promise<PlayObject[]> {
        const needed = coverageForPlay(play);
        if(needed !== undefined && (await this.uncoveredRanges([needed])).length > 0) {
            // one pass for this play and every other queued play that needs one
            const queued = [...await this.playRepo.getQueuedScrobbleRange(INGRESS_QUEUE, {limit: 1000}), ...await this.playRepo.getQueuedScrobbleRange(DEAD_QUEUE, {retries: 3, limit: 1000})];
            const pass = this.ensureCoverage([needed, ...queued.flatMap(x => { const r = coverageForPlay(x); return r === undefined ? [] : [r]; })]);
            // the parked play's queue handles the result
            pass.catch(() => undefined);
            throw new PlayParkedError(`Waiting for scrobbles around ${todayAwareFormat(play.data.playDate!)} to be mirrored from the repo CAR for the dupe check`, pass);
        }
        return this.getMirroredScrobblesForPlay(play);
    }

    protected async getMirroredScrobblesForPlay(play: PlayObject): Promise<PlayObject[]> {
        const closeTemporalPlays = await this.playsHistoricalRepo.getTemporallyClosePlays(play);
        return closeTemporalPlays.map(x => x.play);
    }

    protected abstract doSyncRecentHistoricalScrobbles(): Promise<[PlayObject[], boolean]>;

    async syncRecentHistoricalScrobbles(): Promise<Awaited<ReturnType<AbstractHistoricalScrobbleClient['doSyncRecentHistoricalScrobbles']>> | undefined> {
        try {
            this.logger.info('Pulling latest scrobbles into mirror...');
            this.setStatus('Pulling latest scrobbles into mirror...');
            const [recent, gapSynced] = await this.doSyncRecentHistoricalScrobbles();
            if(recent.length > 0) {
                await this.createHistoricalPlays(recent.map((x) => playToRepositoryCreatePlayHistoricalOpts({play: x})));
                this.logger.verbose(`Added ${recent.length} upstream plays to mirror`);
                this.setStatus(`Added ${recent.length} upstream plays to mirror`);
            } else {
                this.logger.verbose('Most recent upstream plays were alerady mirrored.');
                this.setStatus('Most recent upstream plays were alerady mirrored.');
            }
            if(gapSynced && this.mirrorId !== undefined) {
                // the recent plays overlap what was mirrored, so everything up to now is mirrored
                const tail = this.syncedTail((await this.mirrorRepo.getById(this.mirrorId))?.segments ?? []);
                if(tail !== undefined) {
                    await this.mirrorRepo.addCoverage(this.mirrorId, [tail, Date.now()], this.coverageTag);
                }
            }
            return [recent, gapSynced];
        } catch (e) {
            this.logger.warn(new Error('Recent plays sync failed', {cause: e}));
            this.setStatus('Recent plays sync failed.');
        }
    }

    protected async postInitialize(): Promise<void> {
        await super.postInitialize();

        try {
            await this.useLockedMirror();
        } catch (e) {
            this.logger.warn(new Error('Could not move historical plays into a mirror, continuing without one', {cause: e}));
        }

        spawn(new AbortController().signal, async (signal, {defer, fork}) => {

            let shouldSync = true;

            if(!this.synced) {
                this.logger[this.syncError !== undefined ? 'warn' : 'info'](`Running historical import automatically because ${this.syncedReason}`);
                this.hydrateHistoricalScrobbles();
                await this.importPromise;
                if(this.synced) {
                    shouldSync = false;
                } else {
                    this.logger.verbose('Since historical hydration did not complete successfully, will run recent scrobble sync instead.');
                }
            } else if(this.syncedReason !== undefined) {
                this.logger.warn(`Last historical sync run successfully but ${this.syncedReason}`);
            } 

            if(shouldSync){
                // pull latest plays into database
                const [_, gapSynced = false] = (await this.syncRecentHistoricalScrobbles()) ?? [];
                if(this.syncedReason !== undefined && this.syncedReason.includes('component was inactive')) {
                    if(gapSynced) {
                        this.syncedReason = undefined;
                        this.logger.verbose('Sync gap was verified filled by pulling latest scrobbles!');
                    } else {
                        this.logger.verbose('Pulling latest scrobbles did not fill inactivity period. You may want to run historical hydration again.');
                    }
                }
            }

        })
        .then(() => null)
        .catch((e) => this.logger.warn(new Error('Failed to complete post-init historical database sync but continuing anyway', {cause: e})));
    }

    protected async postDatabase(): Promise<void> {
        await super.postDatabase();
        this.playsHistoricalRepo = new DrizzlePlayHistoricalRepository(this.db, {componentId: this.dbComponent.id, logger: this.logger});
        // left by a previous run, its deletion job did not survive the restart
        await this.deleteCarFiles();
        const imports = this.dbComponent.migrations.filter(x => x.name === 'historicalImport');
        const [synced, reason] = await this.getHistoricalScrobblesAreSynced();
        this.synced = synced;
        this.syncedReason = reason;
        if(this.syncedReason !== undefined) {
            this.logger.info(`Sync status is abnormal: ${this.syncedReason}`);
        }
        if(imports.length > 0) {
            imports.sort((a, b) => sortByNewestDate(a.attemptedAt, b.attemptedAt));
            this.lastImport = imports[0].attemptedAt;
            if(!this.synced) {
                this.syncError = imports[0].error ?? undefined;
            }
            const success = imports.find(x => x.success);
            if(success) {
                this.lastImportSuccess = success.attemptedAt;
            }
        }
        if(this.synced) {
            this.logger.info(`Last full historical play sync was successful${this.lastImportSuccess !== undefined ? ` and imported on ${todayAwareFormat(this.lastImportSuccess)}` : ''}`);
        } else {
            this.logger.info(`Last full historical play sync as not successful (${reason})${this.lastImport !== undefined ? ` and attempted on ${todayAwareFormat(this.lastImport)}` :''}`);
        }
    }

    public async scrobble(playObj: PlayObject, opts?: { delay?: number | false, signal?: AbortSignal }): Promise<PlayObject> {
        const res = await super.scrobble(playObj, opts);
        if(this.addScrobbleToHistorical) {
            await this.createHistoricalPlays([playToRepositoryCreatePlayHistoricalOpts({play: res})]);
        }
        return res;
    }
}