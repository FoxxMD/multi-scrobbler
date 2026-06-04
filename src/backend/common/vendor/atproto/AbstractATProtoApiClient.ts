import { getRoot } from "../../../ioc.js";
import { AbstractApiOptions } from "../../infrastructure/Atomic.js";
import AbstractApiClient from "../AbstractApiClient.js";
import { MSCache } from "../../Cache.js";
import { UpstreamError } from "../../errors/UpstreamError.js";
import { streamBodyProgress } from "../../../utils/NetworkUtils.js";
import { ATProtoUserIdentifierData, HandleData } from "../../infrastructure/config/client/atproto.js";
import { checkPds, isDID, identifierToAtProtoHandle } from "./atUtils.js";
import { Client, isXRPCErrorPayload } from '@atcute/client';
import { ComAtprotoSyncGetRepo } from '@atcute/atproto';
import { AtprotoDid } from "@atcute/lexicons/syntax";

export abstract class AbstractATProtoApiClient extends AbstractApiClient {

    declare config: ATProtoUserIdentifierData;

    declare client: Client;

    userData!: HandleData

    cache: MSCache;

    constructor(name: any, config: ATProtoUserIdentifierData, options: AbstractApiOptions) {
        super('atproto', name, config, options);
        this.cache = getRoot().items.cache();

        const cleanIdentifier = this.config.identifier;
        if(isDID(cleanIdentifier)) {
            this.logger.debug(`Identifier ${cleanIdentifier} looks like a DID, skipping parsing as a handle.`);
            this.config.did = cleanIdentifier;
        } else {
            this.config.identifier = identifierToAtProtoHandle(this.config.identifier, {logger: this.logger, defaultDomain: 'bsky.social'});
        }
    }

    abstract initClient(): Promise<void>;

    async checkPds(data: ATProtoUserIdentifierData): Promise<true> {
        return await checkPds(data, {logger: this.logger, cache: this.cache.cacheAuth});
    }

    async getCAR(did: AtprotoDid) {
        const resp = await this.client.call(ComAtprotoSyncGetRepo, {
            params: {
                did
            },
            as: 'stream'
        });
        if(!resp.ok) {
            let text: string;
            if(isXRPCErrorPayload(resp.data)) {
                text = resp.data.error;
            }
            throw new UpstreamError(`Failed to fetch repo CAR file. Response was ${resp.status} with response ${text}`, {responseBody: text});
        }

        resp.headers
        return await streamBodyProgress(resp.data, {
            logger: this.logger,
            chunkDefaultSize: 1024 * 1024 * 5, // report progress every 5 MB
            fileHint: 'repo CAR'
        });
    }
}
