import AbstractSource from "./AbstractSource.js";
// @ts-expect-error TS(7016): Could not find a declaration file for module 'supe... Remove this comment to see the full error message
import request from 'superagent';
import crypto from 'crypto';
import dayjs from "dayjs";
import isSameOrAfter from "dayjs/plugin/isSameOrAfter.js";
import {buildTrackString, parseRetryAfterSecsFromObj, sleep} from "../utils.js";
import MemorySource from "./MemorySource.js";

dayjs.extend(isSameOrAfter);

export class SubsonicSource extends MemorySource {

    requiresAuth = true;

    constructor(name: any, config = {}, clients = []) {
        // default to quick interval so we can get a decently accurate nowPlaying
        const subsonicConfig = {interval: 10, maxSleep: 30, ...config};
        super('subsonic', name, subsonicConfig, clients);

        // @ts-expect-error TS(2339): Property 'user' does not exist on type '{}'.
        const {user, password, url} = this.config;

        if (user === undefined) {
            throw new Error(`Cannot setup Subsonic source, 'user' is not defined`);
        }
        if (password === undefined) {
            throw new Error(`Cannot setup Subsonic source, 'password' is not defined`);
        }
        if (url === undefined) {
            throw new Error(`Cannot setup Subsonic source, 'url' is not defined`);
        }

        this.canPoll = true;
    }

    static formatPlayObj(obj: any, newFromSource = false) {
        const {
            id,
            title,
            album,
            artist,
            duration, // seconds
            minutesAgo,
        } = obj;
        return {
            data: {
                artists: [artist],
                album,
                track: title,
                duration,
                // subsonic doesn't return an exact datetime, only how many whole minutes ago it was played
                // so we need to force the time to be 0 seconds always so that when we compare against scrobbles from client the time isn't off
                playDate: minutesAgo === 0 ? dayjs().startOf('minute') : dayjs().startOf('minute').subtract(minutesAgo, 'minute'),
            },
            meta: {
                trackLength: duration,
                source: 'Subsonic',
                sourceId: id,
                newFromSource,
            }
        }
    }

    // @ts-expect-error TS(7024): Function implicitly has return type 'any' because ... Remove this comment to see the full error message
    callApi = async (req: any, retries = 0) => {
        const {
            // @ts-expect-error TS(2339): Property 'user' does not exist on type '{}'.
            user,
            // @ts-expect-error TS(2339): Property 'password' does not exist on type '{}'.
            password,
            // @ts-expect-error TS(2339): Property 'maxRequestRetries' does not exist on typ... Remove this comment to see the full error message
            maxRequestRetries = 1,
            // @ts-expect-error TS(2339): Property 'retryMultiplier' does not exist on type ... Remove this comment to see the full error message
            retryMultiplier = 1.5
        } = this.config;

        const salt = await crypto.randomBytes(10).toString('hex');
        const hash = crypto.createHash('md5').update(`${password}${salt}`).digest('hex')
        req.query({
            u: user,
            t: hash,
            s: salt,
            v: '1.15.0',
            c: `multi-scrobbler - ${this.name}`,
            f: 'json'
        });
        try {
            const resp = await req;
            const {
                body: {
                    "subsonic-response": {
                        status,
                    },
                    "subsonic-response": ssResp = {}
                } = {}
            } = resp;
            if (status === 'failed') {
                const err = new Error('Subsonic API returned an error');
                // @ts-expect-error TS(2339): Property 'response' does not exist on type 'Error'... Remove this comment to see the full error message
                err.response = resp;
                throw  err;
            }
            return ssResp;
        } catch (e) {
            if(retries < maxRequestRetries) {
                const retryAfter = parseRetryAfterSecsFromObj(e) ?? (retryMultiplier * (retries + 1));
                this.logger.warn(`Request failed but retries (${retries}) less than max (${maxRequestRetries}), retrying request after ${retryAfter} seconds...`);
                await sleep(retryAfter * 1000);
                return await this.callApi(req, retries + 1)
            }
            const {
                // @ts-expect-error TS(2339): Property 'message' does not exist on type 'unknown... Remove this comment to see the full error message
                message,
                // @ts-expect-error TS(2339): Property 'response' does not exist on type 'unknow... Remove this comment to see the full error message
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
                // @ts-expect-error TS(2339): Property 'response' does not exist on type 'unknow... Remove this comment to see the full error message
                response,
            } = e;
            let msg = response !== undefined ? `API Call failed: Server Response => ${ssMessage}` : `API Call failed: ${message}`;
            const responseMeta = ssResp ?? text;
            this.logger.error(msg, {status, response: responseMeta});
            throw e;
        }
    }

    initialize = async () => {
        // @ts-expect-error TS(2339): Property 'url' does not exist on type '{}'.
        const {url} = this.config;
        try {
            await request.get(`${url}/`);
            this.logger.info('Subsonic Connection: ok');
            this.initialized = true;
        } catch (e) {
            // @ts-expect-error TS(2571): Object is of type 'unknown'.
            if(e.status !== undefined && e.status !== 404) {
                this.logger.info('Subsonic Connection: ok');
                // we at least got a response!
                this.initialized = true;
            }
        }

        return this.initialized;
    }

    testAuth= async () => {
        // @ts-expect-error TS(2339): Property 'url' does not exist on type '{}'.
        const {url} = this.config;
        try {
            await this.callApi(request.get(`${url}/rest/ping`));
            this.authed = true;
            this.logger.info('Subsonic API Status: ok');
        } catch (e) {
            this.authed = false;
        }

        return this.authed;
    }

    getRecentlyPlayed = async (options = {}) => {
        // @ts-expect-error TS(2339): Property 'formatted' does not exist on type '{}'.
        const {formatted = false} = options;
        // @ts-expect-error TS(2339): Property 'url' does not exist on type '{}'.
        const {url} = this.config;
        const resp = await this.callApi(request.get(`${url}/rest/getNowPlaying`));
        const {
            nowPlaying: {
                entry = []
            } = {}
        } = resp;
        this.processRecentPlays(entry.map((x: any) => formatted ? SubsonicSource.formatPlayObj(x) : x));
        return this.statefulRecentlyPlayed;
    }
}
