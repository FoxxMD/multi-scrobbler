import { getRoot } from "../../../ioc.js";
import { AbstractApiOptions } from "../../infrastructure/Atomic.js";
import { TealClientData } from "../../infrastructure/config/client/tealfm.js";
import AbstractApiClient from "../AbstractApiClient.js";
import {
    NodeOAuthClient,
    NodeSavedStateStore,
    NodeSavedSessionStore,
    type OAuthClientMetadataInput,
    OAuthSession,
} from "@atproto/oauth-client-node";
import { Agent, CredentialSession, AtpSessionEvent, AtpSessionData } from "@atproto/api";
import { MSCache } from "../../Cache.js";


export class BlueSkyApiClient extends AbstractApiClient {

    declare config: TealClientData;

    oauthClient?: NodeOAuthClient;
    oauthSession: OAuthSession;
    agent?: Agent;

    appSession?: CredentialSession;
    appPwAuth: boolean

    cache: MSCache;

    constructor(name: any, config: TealClientData, options: AbstractApiOptions) {
        super('blueSky', name, config, options);

        this.cache = getRoot().items.cache();

        if (config.appPassword !== undefined) {
            this.logger.verbose('Found app password, Will use App Password auth for session');
            this.appPwAuth = true;
        } else if (config.baseUri !== undefined) {
            this.logger.verbose('Found baseUri, will use oauth for session');
            this.appPwAuth = false;
        }
    }

    protected initClientApp() {
        this.appSession = new CredentialSession(new URL('https://bsky.social'), undefined, (evt: AtpSessionEvent, sess?: AtpSessionData) => {
            this.cache.cacheAuth.set(`appPwSession-${this.name}`, sess);
        });
        this.agent = new Agent(this.appSession);
    }

    protected initClientOauth() {
        const sessionStore: NodeSavedSessionStore = {
            set: (k: string, state) => this.cache.cacheAuth.set(`session-${this.name}-${k}`, state).then(() => null),
            get: (k: string) => this.cache.cacheAuth.get(`session-${this.name}-${k}`),
            del: (k: string) => this.cache.cacheAuth.delete(`session-${this.name}-${k}`).then(() => null)
        }

        const stateStore: NodeSavedStateStore = {
            set: (k: string, state) => this.cache.cacheAuth.set(`state-${this.name}-${k}`, state).then(() => null),
            get: (k: string) => this.cache.cacheAuth.get(`state-${this.name}-${k}`),
            del: (k: string) => this.cache.cacheAuth.delete(`state-${this.name}-${k}`).then(() => null)
        }

        try {
            this.oauthClient = new NodeOAuthClient({
                clientMetadata: this.getMetadata(),
                stateStore,
                sessionStore
            });
        } catch (e) {
            throw new Error('Could not build oauth client', { cause: e });
        }
    }

    initClient = () => {
        if (this.appPwAuth) {
            this.initClientApp();
        } else {
            this.initClientOauth();
        }
    }

    protected async restoreSessionApp(): Promise<boolean> {
        const savedSession = await this.cache.cacheAuth.get<AtpSessionData>(`appPwSession-${this.name}`);
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

    protected async restoreOauthApp(): Promise<boolean> {
        const did = await this.cache.cacheAuth.get<string>(`did-${this.name}`);
        if (did === undefined) {
            this.logger.debug('No did has been stored yet');
            return false;
        }
        try {
            this.oauthSession = await this.oauthClient.restore(did);
            return true;
        } catch (e) {
            this.logger.warn(new Error('Could not restore oauth session', { cause: e }));
            return false;
        }
    }

    restoreSession = async (): Promise<boolean> => {
        if (this.appSession) {
            return await this.restoreSessionApp();
        } else {
            return await this.restoreOauthApp();
        }
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
            //this.cache.cacheAuth.set(`appPwSession-${this.name}`, f.data);
            return true;
        } catch (e) {
            this.logger.error('Could not login using app password', { cause: e });
            return false;
        }
    }


    createAuthorizeUrl = async (handle: string) => {
        const url = await this.oauthClient.authorize(handle.replace('@', ''));
        return url.toString();
    }

    handleCallback = async (params: URLSearchParams): Promise<boolean> => {
        const { session } = await this.oauthClient.callback(params);
        this.oauthSession = session;
        this.agent = new Agent(session);
        await this.cache.cacheAuth.set(`did-${this.name}`, session.did);
        return true;
    }

    getMetadata() {
        return generateMetadata(this.name, this.config.baseUri);
    }

}

export const generateMetadata = (name, baseUrl): OAuthClientMetadataInput => {
    return {
        client_name: name,
        client_id: `${baseUrl}/client-metadata.json`,
        client_uri: `${baseUrl}`,
        redirect_uris: [`${baseUrl}/oauth/callback`],
        policy_uri: `${baseUrl}/policy`,
        tos_uri: `${baseUrl}/tos`,
        scope: "atproto transition:generic",
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        application_type: "web",
        token_endpoint_auth_method: "none",
        dpop_bound_access_tokens: true,
    };
}