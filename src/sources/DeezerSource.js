import request from 'superagent';
import {parseRetryAfterSecsFromObj, readJson, sleep, sortByPlayDate, writeFile} from "../utils.js";
import {Strategy as DeezerStrategy} from 'passport-deezer';
import AbstractSource from "./AbstractSource.js";
import dayjs from "dayjs";

export default class DeezerSource extends AbstractSource {

    localUrl;
    workingCredsPath;
    configDir;
    error;

    requiresAuth = true;
    requiresAuthInteraction = true;

    baseUrl = 'https://api.deezer.com';

    constructor(name, config = {}, clients = []) {
        super('deezer', name, config, clients);
        const {
            localUrl,
            configDir,
            interval = 60,
        } = config;

        if (interval < 15) {
            this.logger.warn('Interval should be above 30 seconds...😬');
        }

        this.config.interval = interval;

        this.configDir = configDir;
        this.workingCredsPath = `${configDir}/currentCreds-${name}.json`;
        this.localUrl = localUrl;
        this.canPoll = true;
    }

    static formatPlayObj(obj, newFromSource = false) {
        const {
            title: name,
            artist: {
                name: artistName,
            } = {},
            duration,
            timestamp,
            id,
            link,
            album: {
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
                trackLength: duration,
                source: 'Deezer',
                sourceId: id,
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
            this.config.accessToken = credFile.accessToken;
        } catch (e) {
            this.logger.warn('Current deezer credentials file exists but could not be parsed', { path: this.workingCredsPath });
        }
        if(this.config.accessToken === undefined) {
            if(this.config.clientId === undefined) {
                throw new Error('clientId must be defined when accessToken is not present');
            } else if(this.config.clientSecret === undefined) {
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

    getRecentlyPlayed = async (options = {}) => {
        const {formatted = false} = options;
        const resp = await this.callApi(request.get(`${this.baseUrl}/user/me/history`));
        if(formatted) {
            return resp.data.map(x => DeezerSource.formatPlayObj(x)).sort(sortByPlayDate)
        }
        return resp.data;
    }

    callApi = async (req, retries = 0) => {
        const {
            maxRequestRetries = 1,
            retryMultiplier = 1.5
        } = this.config;

        req.query({
            access_token: this.config.accessToken,
            output: 'json'
           });
        try {
            const resp = await req;
            const {
                body = {},
                body: {
                    error,
                } = {}
            } = resp;
            if (error !== undefined) {
                const err = new Error(error.message);
                err.type = error.type;
                err.code = error.code;
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
                    status,
                    body: {
                        "subsonic-response": {
                            status: ssStatus,
                            error: {
                                code,
                                message: ssMessage,
                            } = {},
                        } = {},
                        "subsonic-response": ssResp
                    } = {},
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
            clientID: this.config.clientId,
            clientSecret: this.config.clientSecret,
            callbackURL: this.config.redirectUri || `${this.localUrl}/deezer/callback`,
            scope: ['listening_history','offline_access'],
        }, (accessToken, refreshToken, profile, done) => {
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

    handleAuthCodeCallback = async (res) => {
        const {error, accessToken, id, displayName} = res;
        if (error === undefined) {
            await writeFile(this.workingCredsPath, JSON.stringify({
                accessToken,
                id,
                displayName,
            }));
            this.config.accessToken = accessToken;
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
