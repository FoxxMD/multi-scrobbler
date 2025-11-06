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
import { Agent } from "@atproto/api";
import { MSCache } from "../../Cache.js";
import { truncateStringToLength } from "../../../../core/StringUtils.js";


export class BlueSkyApiClient extends AbstractApiClient {

    declare config: TealClientData;

    oauthClient!: NodeOAuthClient;
    oauthSession: OAuthSession;
    agent?: Agent;

    cache: MSCache;

    constructor(name: any, config: TealClientData, options: AbstractApiOptions) {
        super('blueSky', name, config, options);
        // const { configDir } = config;
        // this.workingCredsPath = `${configDir}/currentCreds-lastfm-${name}.json`;

        this.cache = getRoot().items.cache();


    }

    initClient = () => {
        const sessionStore: NodeSavedSessionStore = {
            set: (k: string, state) => this.cache.cacheAuth.set(`session-${name}-${k}`, state).then(() => null),
            get: (k: string) => this.cache.cacheAuth.get(`session-${name}-${k}`),
            del: (k: string) => this.cache.cacheAuth.delete(`session-${name}-${k}`).then(() => null)
        }

        const stateStore: NodeSavedStateStore = {
            set: (k: string, state) => this.cache.cacheAuth.set(`state-${name}-${k}`, state).then(() => null),
            get: (k: string) => this.cache.cacheAuth.get(`state-${name}-${k}`),
            del: (k: string) => this.cache.cacheAuth.delete(`state-${name}-${k}`).then(() => null)
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

    restoreSession = async (): Promise<boolean> => {
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