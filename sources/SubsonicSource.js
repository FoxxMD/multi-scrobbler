import AbstractSource from "./AbstractSource.js";
import request from 'superagent';
import crypto from 'crypto';
import dayjs from "dayjs";
import isSameOrAfter from "dayjs/plugin/isSameOrAfter.js";
import {buildTrackString, parseRetryAfterSecsFromObj, sleep} from "../utils.js";
import MemorySource from "./MemorySource.js";

dayjs.extend(isSameOrAfter);

export class SubsonicSource extends MemorySource {

    constructor(name, config = {}, clients = []) {
        // default to quick interval so we can get a decently accurate nowPlaying
        const subsonicConfig = {interval: 10, maxSleep: 30, ...config};
        super('subsonic', name, subsonicConfig, clients);

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

    static formatPlayObj(obj, newFromSource = false) {
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

    callApi = async (req, retries = 0) => {
        const {
            user,
            password,
            maxRequestRetries = 1,
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

    testConnection = async () => {
        const {url} = this.config;
        try {
            await this.callApi(request.get(`${url}/rest/ping`));
            this.logger.info('Subsonic API Status: ok');
        } catch (e) {
            this.logger.error(e);
        }
    }

    getRecentlyPlayed = async (options = {}) => {
        const {formatted = false} = options;
        const {url} = this.config;
        const resp = await this.callApi(request.get(`${url}/rest/getNowPlaying`));
        const {
            nowPlaying: {
                entry = []
            } = {}
        } = resp;
        return this.processRecentPlays(entry.map(x => formatted ? SubsonicSource.formatPlayObj(x) : x));
    }
}
