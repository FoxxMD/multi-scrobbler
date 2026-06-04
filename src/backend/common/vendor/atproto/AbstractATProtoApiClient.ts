import { getRoot } from "../../../ioc.js";
import { AbstractApiOptions } from "../../infrastructure/Atomic.js";
import { TealClientData } from "../../infrastructure/config/client/tealfm.js";
import AbstractApiClient from "../AbstractApiClient.js";
import { Agent, ComAtprotoRepoListRecords } from "@atproto/api";
import { MSCache } from "../../Cache.js";
import { UpstreamError } from "../../errors/UpstreamError.js";
import { isPortReachableConnect, normalizeWebAddress, streamBodyProgress } from "../../../utils/NetworkUtils.js";
import {
  CompositeDidDocumentResolver,
  CompositeHandleResolver,
  DohJsonHandleResolver,
  PlcDidDocumentResolver,
  WebDidDocumentResolver,
  WellKnownHandleResolver,
} from "@atcute/identity-resolver";
import { AtprotoDid, DidDocument } from "@atproto/oauth-client-node";
import { isNodeNetworkException } from "../../errors/NodeErrors.js";
import { ATProtoUserIdentifierData } from "../../infrastructure/config/client/atproto.js";

interface HandleData {
    did: string
    pds: string
}

export abstract class AbstractATProtoApiClient extends AbstractApiClient {

    agent!: Agent;

    cache: MSCache;

    constructor(name: any, config: TealClientData, options: AbstractApiOptions) {
        super('atproto', name, config, options);

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

    protected async getATProtoIdentifier(data: ATProtoUserIdentifierData): Promise<HandleData> {

        let hd: HandleData;
        hd = await this.cache.cacheAuth.get<HandleData>(`${this.name}-handleData`);
        if (hd !== undefined) {
            this.logger.debug('Found cached handle data');
            return hd;
        } else {
            this.logger.debug('Handle data not cached, attempting to resolve...');
        }

        const handleResolver = new CompositeHandleResolver({
            strategy: "race",
            methods: {
                dns: new DohJsonHandleResolver({
                    dohUrl: "https://mozilla.cloudflare-dns.com/dns-query",
                }),
                http: new WellKnownHandleResolver(),
            },
        });

        const {
            did: givenDid,
            identifier
        } = data;

        let did: AtprotoDid = givenDid;
        if(did === undefined) {
            try {
                did = await handleResolver.resolve(identifier as `${string}.${string}`);
                this.logger.debug(`Resolved ${did}`);
            } catch (e) {
                throw new Error('Unable to resolve handle', { cause: e });
            }
        }

        const docResolver = new CompositeDidDocumentResolver({
            methods: {
                plc: new PlcDidDocumentResolver(),
                web: new WebDidDocumentResolver(),
            },
        });

        let doc: Awaited<ReturnType<typeof docResolver.resolve>>;
        try {
            doc = await docResolver.resolve(did);
        } catch (e) {
            throw new Error('Unable to resolve did document', { cause: e });
        }
        if (doc.service === undefined || doc.service.length === 0) {
            throw new Error('did document did not return a service');
        }

        if (typeof doc.service[0].serviceEndpoint !== 'string') {
            throw new Error(`Do not know how to handle this serviceEndpoint data structure!\n${JSON.stringify(doc.service[0].serviceEndpoint)}`);
        }
        hd = { did, pds: doc.service[0].serviceEndpoint };

        this.cache.cacheAuth.set(`${this.name}-handleData`, hd, '1d');
        return hd;
    }


    async checkPds(data: ATProtoUserIdentifierData): Promise<true> {
        let hd: HandleData;
        try {
            hd = await this.getATProtoIdentifier(data);
        } catch(e) {
            throw new Error('Unable to get handle data', {cause: e});
        }

        const normal = normalizeWebAddress(hd.pds);

        try {
            await isPortReachableConnect(normal.port, {host: normal.url.hostname});
            return true;
        } catch (e) {
            if(isNodeNetworkException(e)) {
                throw new Error('Could not communicate with PDS server', {cause: e});
            }
            throw new Error('Unexpected error when trying to communicate with PDS server', {cause: e});
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
