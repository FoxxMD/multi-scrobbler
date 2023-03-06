import request from 'superagent';
import {parseRetryAfterSecsFromObj, readJson, sleep, sortByPlayDate, writeFile} from "../utils.js";
import {Strategy as DeezerStrategy} from 'passport-deezer';
import AbstractSource, {RecentlyPlayedOptions} from "./AbstractSource.js";
import dayjs from "dayjs";
import {DeezerSourceConfig} from "../common/infrastructure/config/source/deezer.js";
import {InternalConfig, PlayObject} from "../common/infrastructure/Atomic.js";
import EventEmitter from "events";

export default class DeezerSource extends AbstractSource {
    workingCredsPath;
    error: any;

    requiresAuth = true;
    requiresAuthInteraction = true;

    baseUrl = 'https://api.deezer.com';

    declare config: DeezerSourceConfig;

    constructor(name: any, config: DeezerSourceConfig, internal: InternalConfig, emitter: EventEmitter) {
        super('deezer', name, config, internal, emitter);
        const {
            data: {
                interval = 60,
            } = {},
        } = config;

        if (interval < 15) {
            this.logger.warn('Interval should be above 30 seconds...😬');
        }

        this.config.data.interval = interval;

        this.workingCredsPath = `${this.configDir}/currentCreds-${name}.json`;
        this.canPoll = true;
    }

    static formatPlayObj(obj: any, newFromSource = false): PlayObject {
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

    initialize = async () => {
        try {
            const credFile = await readJson(this.workingCredsPath, {throwOnNotFound: false});
            this.config.data.accessToken = credFile.accessToken;
        } catch (e) {
            this.logger.warn('Current deezer credentials file exists but could not be parsed', { path: this.workingCredsPath });
        }
        if(this.config.data.accessToken === undefined) {
            if(this.config.data.clientId === undefined) {
                throw new Error('clientId must be defined when accessToken is not present');
            } else if(this.config.data.clientSecret === undefined) {
                throw new Error('clientSecret must be defined when accessToken is not present');
            }
        }
        this.initialized = true;
        return this.initialized;
    }

    testAuth = async () => {
        try {
            await this.callApi(request.get(`${this.baseUrl}/user/me`));
            this.authed = true;
        } catch (e) {
            this.logger.error('Could not successfully communicate with Deezer API');
            this.authed = false;
        }
        return this.authed;
    }

    getRecentlyPlayed = async (options: RecentlyPlayedOptions = {}) => {
        const {formatted = false} = options;
        const resp = await this.callApi(request.get(`${this.baseUrl}/user/me/history`));
        if(formatted) {
            return resp.data.map((x: any) => DeezerSource.formatPlayObj(x)).sort(sortByPlayDate);
        }
        return resp.data;
    }

    callApi = async (req: any, retries = 0) => {
        const {
            maxRequestRetries = 1,
            retryMultiplier = 1.5
        } = this.config.data;

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
            let msg = response !== undefined ? `API Call failed: Server Response => ${ssMessage}` : `API Call failed: ${message}`;
            const responseMeta = ssResp ?? text;
            this.logger.error(msg, {status, response: responseMeta});
            throw e;
        }
    }

    generatePassportStrategy = () => {
        return new DeezerStrategy({
            clientID: this.config.data.clientId,
            clientSecret: this.config.data.clientSecret,
            callbackURL: this.config.data.redirectUri || `${this.localUrl}/deezer/callback`,
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
        });
    }

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
}
