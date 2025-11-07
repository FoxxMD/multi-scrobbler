import { getRoot } from "../../../ioc.js";
import { AbstractApiOptions } from "../../infrastructure/Atomic.js";
import { ListRecord, ScrobbleRecord, TealClientData } from "../../infrastructure/config/client/tealfm.js";
import AbstractApiClient from "../AbstractApiClient.js";
import { Agent } from "@atproto/api";
import { MSCache } from "../../Cache.js";


export abstract class AbstractBlueSkyApiClient extends AbstractApiClient {

    declare config: TealClientData;

    agent!: Agent;

    cache: MSCache;

    constructor(name: any, config: TealClientData, options: AbstractApiOptions) {
        super('blueSky', name, config, options);

        this.cache = getRoot().items.cache();
    }

    abstract initClient(): void;

    abstract restoreSession(): Promise<boolean>;

    async createScrobbleRecord(record: ScrobbleRecord): Promise<void> {
        try {
            await this.agent.com.atproto.repo.createRecord({
                repo: this.agent.sessionManager.did,
                collection: "fm.teal.alpha.feed.play",
                record
            });
        } catch (e) {
            throw new Error(`Failed to create record`, { cause: e });
        }
    }

    async listScrobbleRecord(limit: number = 20): Promise<ListRecord<ScrobbleRecord>[]> {
        try {
            const response = await this.agent.com.atproto.repo.listRecords({
                repo: this.agent.sessionManager.did,
                collection: "fm.teal.alpha.feed.play",
                limit
            });
            return response.data.records as unknown as ListRecord<ScrobbleRecord>[];
        } catch (e) {
            throw new Error(`Failed to create record`, { cause: e });
        }
    }
}