import { getRoot } from "../../../ioc.js";
import { AbstractApiOptions } from "../../infrastructure/Atomic.js";
import { TealClientData } from "../../infrastructure/config/client/tealfm.js";
import AbstractApiClient from "../AbstractApiClient.js";
import { Agent, ComAtprotoRepoListRecords } from "@atproto/api";
import { MSCache } from "../../Cache.js";
import { UpstreamError } from "../../errors/UpstreamError.js";
import { streamBodyProgress } from "../../../utils/NetworkUtils.js";

export abstract class AbstractATProtoApiClient extends AbstractApiClient {

    agent!: Agent;

    cache: MSCache;

    constructor(name: any, config: TealClientData, options: AbstractApiOptions) {
        super('blueSky', name, config, options);

        this.cache = getRoot().items.cache();
    }

    abstract initClient(): Promise<void>;

    abstract restoreSession(): Promise<boolean>;

    async listRecord(collection: string, options: {limit?: number, cursor?: string} = {}): Promise<ComAtprotoRepoListRecords.Response> {
        const {limit = 20, cursor} = options;
        try {
            // records are returned newest to oldest
            const response = await this.agent.com.atproto.repo.listRecords({
                repo: this.agent.sessionManager.did,
                collection,
                limit,
                cursor // cursor TID is EXCLUSIVE IE first record returned will be the first older than cursor
            });
            return response;
        } catch (e) {
            throw new UpstreamError(`Failed to list scrobble record`, { cause: e, response: 'response' in e ? e.response : undefined });
        }
    }

    async getCAR() {
        const resp = await this.agent.sessionManager.fetchHandler(`/xrpc/com.atproto.sync.getRepo?did=${encodeURIComponent(this.agent.sessionManager.did)}`, {
            method: 'GET',
            // @ts-expect-error
            duplex: 'half',
            redirect: 'follow',
            headers: {
                ...(Object.fromEntries(this.agent.headers.entries())),
                Accept: 'application/vnd.ipld.car',
            }
        });
        if(resp.status !== 200) {
            const text = await resp.text();
            throw new UpstreamError(`Failed to fetch repo CAR file. Response was ${resp.status} with response ${text}`, {responseBody: text});
        }
        return await streamBodyProgress(resp, {
            logger: this.logger,
            chunkDefaultSize: 1024 * 1024 * 5, // report progress every 5 MB
            fileHint: 'repo CAR'
        });
    }
}
