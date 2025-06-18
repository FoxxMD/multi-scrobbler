import dayjs from "dayjs";
import EventEmitter from "events";
import passport from "passport";
import { Strategy as DeezerStrategy } from 'passport-deezer';
import request from 'superagent';
import { PlayObject } from "../../core/Atomic.js";
import { DEFAULT_RETRY_MULTIPLIER, FormatPlayObjectOptions, InternalConfig } from "../common/infrastructure/Atomic.js";
import { DeezerSourceConfig } from "../common/infrastructure/config/source/deezer.js";
import { parseRetryAfterSecsFromObj, readJson, sleep, sortByOldestPlayDate, writeFile, } from "../utils.js";
import { joinedUrl } from "../utils/NetworkUtils.js";
import AbstractSource, { RecentlyPlayedOptions } from "./AbstractSource.js";

export default class DeezerSource extends AbstractSource {
    workingCredsPath;
    error: any;

    requiresAuth = true;
    requiresAuthInteraction = true;

    baseUrl = 'https://api.deezer.com';
    redirectUri: string;

    declare config: DeezerSourceConfig;

    constructor(name: any, config: DeezerSourceConfig, internal: InternalConfig, emitter: EventEmitter) {
        super('deezer', name, config, internal, emitter);
        const {
            data: {
                interval = 60,
                redirectUri,
                ...rest
            } = {},
        } = config;

        if (interval < 15) {
            this.logger.warn('Interval should be above 30 seconds...😬');
        }

        // @ts-expect-error not correct structure
        this.config.data = {
            ...rest,
            interval,
            redirectUri,
        };

        this.redirectUri = redirectUri || joinedUrl(this.localUrl, 'deezer/callback').toString();

        this.workingCredsPath = `${this.configDir}/currentCreds-${name}.json`;
        this.canPoll = true;
        this.canBacklog = true;
        this.supportsUpstreamRecentlyPlayed = true;
        // https://developers.deezer.com/api/user/history
        // https://stackoverflow.com/a/19497151/1469797
        this.SCROBBLE_BACKLOG_COUNT = 50;
    }

    static formatPlayObj(obj: any, options: FormatPlayObjectOptions = {}): PlayObject {
        const {newFromSource = false} = options;
        const {
            title: name,
            artist: {
                // @ts-expect-error TS(2525): Initializer provides no value for this binding ele... Remove this comment to see the full error message
                name: artistName,
            } = {},
            duration,
            timestamp,
            id,
            link,
            album: {
                // @ts-expect-error TS(2525): Initializer provides no value for this binding ele... Remove this comment to see the full error message
                title: albumName,
            } = {},
        } = obj;
        return {
            data: {
                artists: [artistName],
                album: albumName,
                track: name,
                duration,
                playDate: dayjs(timestamp * 1000),
            },
            meta: {
                source: 'Deezer',
                trackId: id,
                newFromSource,
                url: {
                    web: link
                }
            }
        }
    }

    protected async doBuildInitData(): Promise<true | string | undefined> {
        this.logger.warn('This Source is DEPRECATED! Deezer has dropped support official API support. New apps cannot be created and existing apps are not guaranteed to continue working. Refer to the MS documentation for a new Deezer Source implementation.');

        try {
            const credFile = await readJson(this.workingCredsPath, {throwOnNotFound: false});
            if(credFile !== undefined) {
                this.config.data.accessToken = credFile.accessToken;
            } else {
                this.logger.warn(`No Deezer credentials file found at ${this.workingCredsPath}`);
            }
        } catch (e) {
            throw new Error('Current deezer credentials file exists but could not be parsed', {cause: e});
        }
        if (this.config.data.accessToken === undefined) {
            if (this.config.data.clientId === undefined) {
                throw new Error('clientId must be defined when accessToken is not present');
            } else if (this.config.data.clientSecret === undefined) {
                throw new Error('clientSecret must be defined when accessToken is not present');
            }
        }
        this.logger.info(`Redirect URL that will be used on auth callback: '${this.redirectUri}'`);
        passport.use(`deezer-${this.name}`, this.generatePassportStrategy());
        return true;
    }

    protected async doCheckConnection(): Promise<true | string | undefined> {
        try {
            await request.get('https://api.deezer.com/infos');
            return true;
        } catch (e) {
            throw e;
        }
    }

    doAuthentication = async () => {
        if(this.config.data.accessToken === undefined) {
            throw new Error(`No access token is present. User interaction for authentication is required.`);
        }
        try {
            await this.callApi(request.get(`${this.baseUrl}/user/me`));
            return true;
        } catch (e) {
            throw e;
        }
    }

    getUpstreamRecentlyPlayed = async (options: RecentlyPlayedOptions = {}): Promise<PlayObject[]> => this.getRecentlyPlayed(options)

    getRecentlyPlayed = async (options: RecentlyPlayedOptions = {}) => {
        const resp = await this.callApi(request.get(`${this.baseUrl}/user/me/history?limit=${options.limit || 20}`));
        return resp.data.map((x: any) => DeezerSource.formatPlayObj(x)).sort(sortByOldestPlayDate);
    }

    callApi = async (req: any, retries = 0) => {
        const {
            maxRequestRetries = 1,
            retryMultiplier = DEFAULT_RETRY_MULTIPLIER
        } = this.config.options;

        req.query({
            access_token: this.config.data.accessToken,
            output: 'json'
           });
        try {
            const resp = await req;
            const {
                body = {},
                body: {
                    // @ts-expect-error TS(2525): Initializer provides no value for this binding ele... Remove this comment to see the full error message
                    error,
                } = {}
            } = resp;
            if (error !== undefined) {
                const err = new Error(error.message);
                // @ts-expect-error TS(2339): Property 'type' does not exist on type 'Error'.
                err.type = error.type;
                // @ts-expect-error TS(2339): Property 'code' does not exist on type 'Error'.
                err.code = error.code;
                // @ts-expect-error TS(2339): Property 'response' does not exist on type 'Error'... Remove this comment to see the full error message
                err.response = resp;
                throw  err;
            }
            return body;
        } catch (e) {
            if(retries < maxRequestRetries) {
                const retryAfter = parseRetryAfterSecsFromObj(e) ?? (retryMultiplier * (retries + 1));
                this.logger.warn(`Request failed but retries (${retries}) less than max (${maxRequestRetries}), retrying request after ${retryAfter} seconds...`);
                await sleep(retryAfter * 1000);
                return await this.callApi(req, retries + 1)
            }
            const {
                message,
                response: {
                    // @ts-expect-error TS(2525): Initializer provides no value for this binding ele... Remove this comment to see the full error message
                    status,
                    body: {
                        "subsonic-response": {
                            // @ts-expect-error TS(2525): Initializer provides no value for this binding ele... Remove this comment to see the full error message
                            status: ssStatus,
                            error: {
                                // @ts-expect-error TS(2525): Initializer provides no value for this binding ele... Remove this comment to see the full error message
                                code,
                                // @ts-expect-error TS(2525): Initializer provides no value for this binding ele... Remove this comment to see the full error message
                                message: ssMessage,
                            } = {},
                        } = {},
                        // @ts-expect-error TS(2525): Initializer provides no value for this binding ele... Remove this comment to see the full error message
                        "subsonic-response": ssResp
                    } = {},
                    // @ts-expect-error TS(2525): Initializer provides no value for this binding ele... Remove this comment to see the full error message
                    text,
                } = {},
                response,
            } = e;
            const msg = response !== undefined ? `API Call failed: Server Response => ${ssMessage}` : `API Call failed: ${message}`;
            const responseMeta = ssResp ?? text;
            this.logger.error(msg, {status, response: responseMeta});
            throw e;
        }
    }

    generatePassportStrategy = () => new DeezerStrategy({
            clientID: this.config.data.clientId,
            clientSecret: this.config.data.clientSecret,
            callbackURL: this.redirectUri,
            scope: ['listening_history','offline_access'],
        }, (accessToken: any, refreshToken: any, profile: any, done: any) => {
                // return done(null, {
                //     accessToken,
                //     refreshToken,
                //     ...profile,
                // });
            this.handleAuthCodeCallback({
                accessToken,
                refreshToken,
                ...profile,
            }).then((r) => {
                if(r === true) {
                    return done(null, {});
                }
                return done(r);
            });
        })

    handleAuthCodeCallback = async (res: any) => {
        const {error, accessToken, id, displayName} = res;
        if (error === undefined) {
            await writeFile(this.workingCredsPath, JSON.stringify({
                accessToken,
                id,
                displayName,
            }));
            this.config.data.accessToken = accessToken;
            this.logger.info('Got token Deezer SDK callback!');
            return true;
        } else {
            this.logger.warn('Callback contained an error! User may have denied access?')
            this.error = error;
            this.logger.error(error);
            return error;
        }
    }

    protected getBackloggedPlays = async (options: RecentlyPlayedOptions = {}) => await this.getRecentlyPlayed({formatted: true, ...options})
}
