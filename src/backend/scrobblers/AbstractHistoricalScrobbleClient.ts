import dayjs, { Dayjs } from "dayjs";
import { sortByNewestDate } from "../../core/PlayUtils.js";
import AbstractScrobbleClient from "./AbstractScrobbleClient.js";
import { ComponentMigrationSelect } from "../common/database/drizzle/drizzleTypes.js";
import { ErrorIsh } from "../../core/ErrorUtils.js";
import { DrizzlePlayHistoricalRepository, playToRepositoryCreatePlayHistoricalOpts, RepositoryCreatePlayHistoricalOpts } from "../common/database/drizzle/repositories/PlayHistoricalRepository.js";
import { spawn, isAbortError } from 'abort-controller-x';
import { generateLoggableAbortReason } from "../common/errors/MSErrors.js";
import { Logger } from "@foxxmd/logging";
import { buildTrackString } from "../../core/StringUtils.js";
import { PlayObject } from "../../core/Atomic.js";

export default abstract class AbstractHistoricalScrobbleClient extends AbstractScrobbleClient {

    protected importAbortController: AbortController | undefined;
    protected importPromise: Promise<void> | undefined;
    protected playsHistoricalRepo!: DrizzlePlayHistoricalRepository;
    lastImport?: Dayjs;
    lastImportSuccess?: Dayjs;
    synced: boolean;
    syncedReason?: string;
    syncError?: ErrorIsh;
    override preloadScrobbles: boolean = false;

    protected abstract doHydrateHistoricalScrobbles(opts: {allowFailures?: boolean, signal?: AbortSignal }): Promise<void>;

    hydrateHistoricalScrobbles(allowFailures: boolean = false): void {
        if(this.importAbortController !== undefined) {
            throw new Error('Cannot start a new import while one is already running');
        }
        this.importAbortController = new AbortController();
        this.importPromise = spawn(this.importAbortController.signal, async (signal, {defer, fork}) => {

            defer(async () => {
                this.importAbortController = undefined;
                this.importPromise = undefined;
            });
        
            const newImport: ComponentMigrationSelect = await this.migrationRepo.create({name: 'historicalImport', componentId: this.dbComponent.id}) as ComponentMigrationSelect;
            try {
                await this.doHydrateHistoricalScrobbles({signal, allowFailures});
                await this.migrationRepo.updateById(newImport.id, {success: true});
                this.synced = true;
                this.lastImportSuccess = dayjs();
            } catch (e) {
                await this.migrationRepo.updateById(newImport.id, {success: false, error: e});
                this.syncError = e;
                this.synced = false;
            } finally {
                this.lastImport = dayjs();
            }
            this.dbComponent.migrations.push(newImport);
        }).catch((e) => {
            if (isAbortError(e)) {
                const err = generateLoggableAbortReason('Import processing stopped', this.importAbortController.signal);
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
            return [false, 'No historical imports exist'];
        }
        imports.sort((a, b) => sortByNewestDate(a.attemptedAt, b.attemptedAt));
        if(!imports[0].success) {
            return [false, 'Last attempted import failed'];
        }

        // vibing this duration for now...
        if(this.dbComponent.lastActiveAt.diff(dayjs(), 'minutes') > 60 && imports[0].attemptedAt.isBefore(this.dbComponent.lastActiveAt)) {
            return [false, 'Component was inactive for more than an hour and last import was before last activity. There may be missed plays during the period of inactivity.'];
        }

        return [true];
    }

    protected async createHistoricalPlays(batch: RepositoryCreatePlayHistoricalOpts[], opts: {allowFailures?: boolean, logger?: Logger, signal?: AbortSignal} = {}): Promise<[boolean, number]> {
        const {
            allowFailures = false,
            logger = this.logger,
            signal
        } = opts;
        try {
            await this.playsHistoricalRepo.createPlays(batch);
            return [true, batch.length];
        } catch (e) {
            logger.warn(`Failed to persist batch of ${batch} plays, trying individually...`);
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

    async getSOTScrobblesForPlay(play: PlayObject): Promise<PlayObject[]> {
        const closeTemporalPlays = await this.playsHistoricalRepo.getTemporallyClosePlays(play);
        return closeTemporalPlays.map(x => x.play);
    }

    protected abstract syncRecentHistoricalScrobbles(): Promise<PlayObject[]>;

    protected async postInitialize(): Promise<void> {
        await super.postInitialize();

        if(this.lastImport === undefined && this.syncError === undefined) {
            // have not run an initial import so automatically do it now
            this.logger.info('No historical imports have run! Automatically running an initial import now.');
            this.hydrateHistoricalScrobbles();
        } else {
            // pull latest plays into database
            this.logger.info('Pulling latest scrobbles to sync up historical database...');
            const recent = await this.syncRecentHistoricalScrobbles();
            if(recent.length > 0) {
                await this.createHistoricalPlays(recent.map((x) => playToRepositoryCreatePlayHistoricalOpts({play: x})));
                this.logger.verbose(`Added ${recent.length} upstream plays to historical plays`);
            } else {
                this.logger.verbose('Most recent plays are already in sync with historical database!');
            }
        }
    }

    protected async postDatabase(): Promise<void> {
        await super.postDatabase();
        this.playsHistoricalRepo = new DrizzlePlayHistoricalRepository(this.db, {componentId: this.dbComponent.id, logger: this.logger});
        const imports = this.dbComponent.migrations.filter(x => x.name === 'historicalImport');
        const [synced, reason] = await this.getHistoricalScrobblesAreSynced();
        this.synced = synced;
        this.syncedReason = reason;
        if(imports.length > 0) {
            imports.sort((a, b) => sortByNewestDate(a.attemptedAt, b.attemptedAt));
            this.lastImport = imports[0].attemptedAt;
            if(!this.synced) {
                this.syncError = imports[0].error;
            }
            const success = imports.find(x => x.success);
            if(success) {
                this.lastImportSuccess = success.attemptedAt;
            }
        }
    }
}