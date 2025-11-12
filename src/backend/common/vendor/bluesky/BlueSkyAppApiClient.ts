import { AbstractApiOptions } from "../../infrastructure/Atomic.js";
import { TealClientData } from "../../infrastructure/config/client/tealfm.js";
import { Agent, CredentialSession, AtpSessionEvent, AtpSessionData } from "@atproto/api";
import { AbstractBlueSkyApiClient } from "./AbstractBlueSkyApiClient.js";
import { isPortReachableConnect, normalizeWebAddress } from "../../../utils/NetworkUtils.js";
import { URLData } from "../../../../core/Atomic.js";
import { isNodeNetworkException } from "../../errors/NodeErrors.js";
import {
  CompositeDidDocumentResolver,
  CompositeHandleResolver,
  DohJsonHandleResolver,
  PlcDidDocumentResolver,
  WebDidDocumentResolver,
  WellKnownHandleResolver,
} from "@atcute/identity-resolver";
import { AtprotoDid, DidDocument } from "@atproto/oauth-client-node";
import { identifierToAtProtoHandle } from "./bsUtils.js";

interface HandleData {
    did: string
    pds: string
}

export class BlueSkyAppApiClient extends AbstractBlueSkyApiClient {

    declare config: TealClientData;
    appSession?: CredentialSession;
    appPwAuth: boolean


    constructor(name: any, config: TealClientData, options: AbstractApiOptions) {
        super(name, config, options);
        this.logger.verbose(`Using App Password auth for session`);
        this.config.identifier = identifierToAtProtoHandle(this.config.identifier, {logger: this.logger, defaultDomain: 'bsky.social'});
    }

    async initClient(): Promise<void> {
        const hd = await this.getATProtoIdentifier();
        this.logger.verbose(`Using ${hd.did} on PDS ${hd.pds}`);
        this.appSession = new CredentialSession(new URL(hd.pds), undefined, (evt: AtpSessionEvent, sess?: AtpSessionData) => {
            this.cache.cacheAuth.set(`appPwSession-${this.name}-${hd.did}`, sess, '1000h');
        });
        this.agent = new Agent(this.appSession);
    }

    protected async getATProtoIdentifier(): Promise<HandleData> {

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

        let did: AtprotoDid;
        try {
            did = await handleResolver.resolve(this.config.identifier as `${string}.${string}`);
            this.logger.debug(`Resolved ${did}`);
        } catch (e) {
            throw new Error('Unable to resolve handle', { cause: e });
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

    restoreSession = async (): Promise<boolean> => {
        const hd = await this.getATProtoIdentifier();
        const savedSession = await this.cache.cacheAuth.get<AtpSessionData>(`appPwSession-${this.name}-${hd.did}`);
        if (savedSession !== undefined) {
            try {
                this.logger.debug('Found existing session, trying to resume...');
                await this.appSession.resumeSession(savedSession);
                this.logger.debug('Resumed session!');
                return true;
            } catch (e) {
                this.logger.warn(new Error('Could not resume app password session from data', { cause: e }));
                return false;
            }
        }
        this.logger.debug('No app password session data to restore');
    }

    appLogin = async (): Promise<boolean> => {
        try {

            const f = await this.appSession.login({
                identifier: this.config.identifier,
                password: this.config.appPassword
            });
            if (!f.success) {
                this.logger.error('Login was not successful with app password');
                return false;
            }
            this.logger.debug('Logged in.');
            return true;
        } catch (e) {
            this.logger.error(new Error('Could not login using app password', { cause: e }));
            return false;
        }
    }

    async checkPds(): Promise<true> {
        let hd: HandleData;
        try {
            hd = await this.getATProtoIdentifier();
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

}