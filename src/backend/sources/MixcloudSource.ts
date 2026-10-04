import dayjs from "dayjs";
import type EventEmitter from "events";
import request from 'superagent';
import { COMPONENT_AUTH_TYPE, PARSED_FROM, type PlayObject, type PlayObjectMinimal } from "../../core/Atomic.ts";
import type { ComponentAuthType } from "../../core/Atomic.ts";
import { artistNamesToCredits } from "../../core/StringUtils.ts";
import { AuthError, SimpleError } from "../common/errors/MSErrors.ts";
import type { FormatPlayObjectOptions, InternalConfig } from "../common/infrastructure/Atomic.ts";
import type { MixcloudListen, MixcloudSourceConfig } from "../common/infrastructure/config/source/mixcloud.ts";
import { writeFile } from "../utils/FSUtils.ts";
import { readJson } from "../utils/DataUtils.ts";
import { joinedUrl } from "../utils/NetworkUtils.ts";
import { sortByOldestPlayDate } from "../utils.ts";
import { baseFormatPlayObj } from "../utils/PlayTransformUtils.ts";
import AbstractSource, { type RecentlyPlayedOptions } from "./AbstractSource.ts";

export default class MixcloudSource extends AbstractSource {

    baseUrl = 'https://api.mixcloud.com';
    oauthBaseUrl = 'https://www.mixcloud.com/oauth';

    declare config: MixcloudSourceConfig;

    override authType: ComponentAuthType;
    override requiresAuth: boolean = false;
    override requiresAuthInteraction: boolean = false;

    /**
     * Access token received from the OAuth authorization flow, when the source is
     * configured with app credentials instead of a username
     * */
    accessToken?: string;
    /**
     * Username of the OAuth authorized user, resolved from /me/ — used for API
     * paths in place of a configured username
     * */
    authUsername?: string;
    redirectUri?: string;
    workingCredsPath?: string;

    constructor(name: any, config: MixcloudSourceConfig, internal: InternalConfig, emitter: EventEmitter) {
        const {
            data: {
                interval = 60,
                maxInterval = 300,
                ...restData
            } = {}
        } = config;
        super('mixcloud', name, {...config, data: {interval, maxInterval, ...restData}}, internal, emitter);
        this.canPoll = true;
        this.canBacklog = true;
        this.supportsUpstreamRecentlyPlayed = true;
        // https://www.mixcloud.com/developers/#pagination
        this.SCROBBLE_BACKLOG_COUNT = 50;

        // app credentials mean an OAuth flow against the authorized user's own
        // listens (/me/), which works for both public and pro accounts --
        // otherwise the public history of a configured username is monitored and no auth is needed
        const {clientId, clientSecret} = this.config.data ?? {};
        if (clientId !== undefined && clientSecret !== undefined) {
            this.authType = COMPONENT_AUTH_TYPE.interactive;
            this.requiresAuth = true;
            this.requiresAuthInteraction = true;
            this.workingCredsPath = `${this.configDir}/currentCreds-${name}.json`;
            const u = joinedUrl(this.localUrl, 'api/mixcloud/callback');
            u.searchParams.append('name', this.name);
            this.redirectUri = u.toString();
        } else {
            this.authType = COMPONENT_AUTH_TYPE.none;
        }
    }

    static formatPlayObj(obj: MixcloudListen, options: FormatPlayObjectOptions = {}): PlayObject {
        const {newFromSource = false} = options;
        const {
            key,
            url,
            name,
            audio_length,
            listen_time,
            user,
            hosts = [],
            pictures = {},
        } = obj;

        // Mixcloud does not expose tracklists through the public API so a listen is always an entire mix
        // prefer credited hosts (DJs) as artists and fall back to the account that uploaded the mix
        const artists = hosts.length > 0 ? hosts.map(x => x.name) : [user.name];

        const play: PlayObjectMinimal = {
            data: {
                artists: artistNamesToCredits(artists),
                track: name,
                duration: audio_length,
                playDate: dayjs(listen_time),
            },
            meta: {
                source: 'Mixcloud',
                musicService: 'Mixcloud',
                trackId: key,
                newFromSource,
                url: {
                    web: url
                },
                art: {
                    track: pictures.large ?? pictures.medium
                }
            }
        }
        return baseFormatPlayObj(obj, play);
    }

    protected async doBuildInitData(): Promise<true | string | undefined> {
        const {username, clientId, clientSecret} = this.config.data ?? {};
        if (clientId !== undefined || clientSecret !== undefined) {
            if (clientId === undefined || clientSecret === undefined) {
                throw new Error('clientId and clientSecret must both be defined');
            }
        } else if (username === undefined || username.trim() === '') {
            throw new Error('username must be defined when clientId/clientSecret are not');
        }

        if (this.workingCredsPath !== undefined) {
            const creds = await readJson(this.workingCredsPath, {throwOnNotFound: false, interpolateEnvs: false}) as any;
            this.accessToken = creds?.token;
            if (this.accessToken === undefined) {
                this.logger.info('No access token is present. User interaction for authentication is required.');
            }
            this.logger.info(`Redirect URL that will be used on auth callback: '${this.redirectUri}'`);
        }
        return true;
    }

    protected async doCheckConnection(): Promise<true | string | undefined> {
        if (this.accessToken !== undefined) {
            // also verifies the access token is accepted
            await this.callApi('/me/');
        } else {
            // also verifies the configured user exists (validated at init)
            await this.callApi(`/${encodeURIComponent(this.config.data.username!)}/`);
        }
        return true;
    }

    doAuthentication = async () => {
        try {
            if (this.accessToken === undefined) {
                throw new AuthError('Cannot use API until an access token has been received from the authorization flow.', {unrecoverable: false});
            }
            await this.resolveAuthUser();
            return true;
        } catch (e: any) {
            if(e instanceof AuthError) {
                throw e;
            }
            // callApi wraps superagent errors, where the status code lives
            const status: number | undefined = e?.cause?.status ?? e?.status;
            throw new AuthError('Failed to authenticate', {cause: e, unrecoverable: status !== undefined && [401, 403].includes(status)});
        }
    }

    createAuthUrl = () => {
        const u = new URL(`${this.oauthBaseUrl}/authorize`);
        u.searchParams.set('client_id', this.config.data.clientId!);
        u.searchParams.set('redirect_uri', this.redirectUri!);
        return u.toString();
    }

    handleAuthCodeCallback = async ({
        error,
        code
    }: any) => {
        try {
            if (error !== undefined) {
                this.logger.warn('Callback contained an error! User may have denied access?')
                this.logger.error(error);
                return error;
            }
            // https://www.mixcloud.com/developers/#authorization
            const resp = await request.get(`${this.oauthBaseUrl}/access_token`)
                .query({
                    client_id: this.config.data.clientId,
                    client_secret: this.config.data.clientSecret,
                    redirect_uri: this.redirectUri,
                    code
                });
            const token = resp.body?.access_token;
            if (typeof token !== 'string' || token === '') {
                throw new SimpleError('Access token response from Mixcloud did not include a token', {cause: new Error(`Unexpected response body: ${JSON.stringify(resp.body)}`)});
            }
            this.accessToken = token;
            await writeFile(this.workingCredsPath!, JSON.stringify({
                token
            }));
            this.logger.info('Got token from code grant authorization!');
            await this.resolveAuthUser();
            return true;
        } catch (e) {
            throw e;
        }
    }

    /**
     * Verify the current access token and remember the username it belongs to
     * */
    protected resolveAuthUser = async () => {
        const me = await this.callApi('/me/');
        const {username} = me ?? {};
        if (typeof username !== 'string' || username === '') {
            throw new AuthError('Authorized user response from Mixcloud did not include a username', {unrecoverable: false});
        }
        this.authUsername = username;
    }

    getUpstreamRecentlyPlayed = async (options: RecentlyPlayedOptions = {}): Promise<PlayObject[]> => this.getRecentlyPlayed(options)

    getRecentlyPlayed = async (options: RecentlyPlayedOptions = {}): Promise<PlayObject[]> => {
        const {limit = 20} = options;
        this.setStatus('Checking for new Plays');
        // /me/listens/ includes private (pro account) history while a username path only exposes public history
        // https://www.mixcloud.com/developers/#the-me-shortcut
        const path = this.accessToken !== undefined ? '/me/listens/' : `/${encodeURIComponent(this.config.data.username!)}/listens/`;
        const body = await this.callApi(path, {limit});
        const listens: MixcloudListen[] = body.data ?? [];
        return listens
            .filter(x => x.listen_time !== undefined)
            .map(x => {
                const play = MixcloudSource.formatPlayObj(x);
                play.meta.parsedFrom = PARSED_FROM.history;
                return play;
            })
            .sort(sortByOldestPlayDate);
    }

    protected getBackloggedPlays = async (options: RecentlyPlayedOptions = {}) => await this.getRecentlyPlayed({formatted: true, ...options})

    callApi = async (path: string, query: Record<string, any> = {}): Promise<any> => {
        try {
            if (this.accessToken !== undefined) {
                query = {access_token: this.accessToken, ...query};
            }
            // Mixcloud serves JSON as text/javascript so superagent will not parse it by default
            const resp = await request.get(`${this.baseUrl}${path}`)
                .query(query)
                .buffer(true)
                .parse(request.parse['application/json']);
            return resp.body;
        } catch (e: any) {
            // Mixcloud returns errors as {"error": {"type": "...", "message": "..."}}
            const {
                type,
                message
            } = e?.response?.body?.error ?? {};
            if (message !== undefined) {
                throw new Error(`Mixcloud API returned an error (${e.status} ${type ?? 'unknown'}): ${message}`, {cause: e});
            }
            throw e;
        }
    }
}
