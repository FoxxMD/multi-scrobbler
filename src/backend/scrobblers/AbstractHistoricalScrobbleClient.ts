import dayjs, { Dayjs } from "dayjs";
import { sortByNewestDate } from "../../core/PlayUtils.js";
import AbstractScrobbleClient from "./AbstractScrobbleClient.js";
import { ComponentMigrationSelect } from "../common/database/drizzle/drizzleTypes.js";
import { ErrorIsh } from "../../core/ErrorUtils.js";
import { DrizzlePlayHistoricalRepository } from "../common/database/drizzle/repositories/PlayHistoricalRepository.js";
import { spawn, isAbortError } from 'abort-controller-x';
import { generateLoggableAbortReason } from "../common/errors/MSErrors.js";

export default abstract class AbstractHistoricalScrobbleClient extends AbstractScrobbleClient {

    protected importAbortController: AbortController | undefined;
    protected importPromise: Promise<void> | undefined;
    protected playsHistoricalRepo!: DrizzlePlayHistoricalRepository;
    lastImport?: Dayjs;
    lastImportSuccess?: Dayjs;
    synced: boolean;
    syncedReason?: string;
    syncError?: ErrorIsh;

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