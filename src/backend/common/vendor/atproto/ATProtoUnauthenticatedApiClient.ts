import { UpstreamError } from "../../errors/UpstreamError.ts";
import { type HandleData } from "../../infrastructure/config/client/atproto.ts";
import { AbstractATProtoApiClient } from "./AbstractATProtoApiClient.ts";
import { getATProtoIdentifier, checkPds } from "./atUtils.ts";
import { Client, simpleFetchHandler } from '@atcute/client';
import type {} from '@atcute/atproto';
import { type Nsid } from "@atcute/lexicons";

export class ATProtoUnauthenticatedApiClient extends AbstractATProtoApiClient {

    declare client: Client;

    async initClient(): Promise<void> {
        await this.hydrateHandleData();
        this.client = new Client({ handler: simpleFetchHandler({ service: this.userData.pds }) });
    }

    async listRecords(collection: string, options: {limit?: number, cursor?: string} = {}) {
        const {limit = 20, cursor} = options;
        try {
            // records are returned newest to oldest
            const response = await this.client.get('com.atproto.repo.listRecords', {
                params: {
                    repo: this.userData.did,
                    collection: collection as Nsid,
                    limit,
                    cursor
                }
            });
            return response;
        } catch (e) {
            throw new UpstreamError(`Failed to list scrobble record`, { cause: e, response: 'response' in e ? e.response : undefined });
        }
    }
}