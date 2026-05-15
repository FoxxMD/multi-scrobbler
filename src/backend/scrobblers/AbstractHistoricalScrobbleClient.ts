import dayjs, { Dayjs } from "dayjs";
import { sortByNewestDate } from "../../core/PlayUtils.js";
import AbstractScrobbleClient from "./AbstractScrobbleClient.js";
import { ComponentMigrationSelect } from "../common/database/drizzle/drizzleTypes.js";
import { ErrorIsh } from "../../core/ErrorUtils.js";

export default abstract class AbstractHistoricalScrobbleClient extends AbstractScrobbleClient {

    protected importAbortController: AbortController | undefined;
    protected importPromise: Promise<void> | undefined;
    lastImport?: Dayjs;
    lastImportSuccess?: Dayjs;
    synced: boolean;
    syncedReason?: string;
    syncError?: ErrorIsh;

    protected abstract doHydrateHistoricalScrobbles(): Promise<void>;

    protected async hydrateHistoricalScrobbles(): Promise<void> {
        const newImport: ComponentMigrationSelect = await this.migrationRepo.create({name: 'historicalImport', componentId: this.dbComponent.id}) as ComponentMigrationSelect;
        try {
            await this.doHydrateHistoricalScrobbles();
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