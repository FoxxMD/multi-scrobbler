import dayjs, { type Dayjs } from "dayjs";
import { sortByNewestDate } from "../../core/PlayUtils.ts";
import AbstractScrobbleClient from "./AbstractScrobbleClient.ts";
import type {ComponentMigrationSelect} from "../common/database/drizzle/drizzleTypes.ts";
import type {ErrorIsh} from "../../core/ErrorUtils.ts";
import { DrizzlePlayHistoricalRepository, playToRepositoryCreatePlayHistoricalOpts, type RepositoryCreatePlayHistoricalOpts } from "../common/database/drizzle/repositories/PlayHistoricalRepository.ts";
import { spawn, isAbortError } from 'abort-controller-x';
import { generateLoggableAbortReason } from "../common/errors/MSErrors.ts";
import type {Logger} from "@foxxmd/logging";
import { buildTrackString } from "../../core/MusicMetadata.ts";
import type { PlayObject } from "../../core/PlaySchema.ts";
import { todayAwareFormat } from "../../core/TimeUtils.ts";
import type { ComponentClientApiJson } from "../../core/Api.ts";
import fsPromise from 'node:fs/promises';
import path from 'node:path';
import { AsyncTask, SimpleIntervalJob } from "toad-scheduler";

/** How long a downloaded repo CAR is kept for reuse before it is deleted */
export const CAR_KEEP_MS = 60 * 60 * 1000;
const CAR_DELETE_JOB = 'carDelete';

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

    /** Stream the user's repo CAR into filename */
    protected abstract downloadCar(filename: string): Promise<void>;

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
            try {
                this.setStatus('Starting full mirror rebuild...');
                await this.doHydrateHistoricalScrobbles({signal, allowFailures});
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
        batch = batch.map(({input, ...x}) => ({...x, play: slimHistoricalPlay(x.play)}));
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

    async getSOTScrobblesForPlay(play: PlayObject): Promise<PlayObject[]> {
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
            return [recent, gapSynced];
        } catch (e) {
            this.logger.warn(new Error('Recent plays sync failed', {cause: e}));
            this.setStatus('Recent plays sync failed.');
        }
    }

    protected async postInitialize(): Promise<void> {
        await super.postInitialize();

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