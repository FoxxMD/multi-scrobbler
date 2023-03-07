import request from 'superagent';
import * as crypto from 'crypto';
import dayjs from "dayjs";
import isSameOrAfter from "dayjs/plugin/isSameOrAfter.js";
import {buildTrackString, parseRetryAfterSecsFromObj, removeDuplicates, sleep} from "../utils.js";
import MemorySource from "./MemorySource.js";
import {SubSonicSourceConfig} from "../common/infrastructure/config/source/subsonic.js";
import {InternalConfig, PlayObject} from "../common/infrastructure/Atomic.js";
import {RecentlyPlayedOptions} from "./AbstractSource.js";
import EventEmitter from "events";

dayjs.extend(isSameOrAfter);

export class SubsonicSource extends MemorySource {

    requiresAuth = true;

    multiPlatform: boolean = true;

    declare config: SubSonicSourceConfig;

    constructor(name: any, config: SubSonicSourceConfig, internal: InternalConfig, emitter: EventEmitter) {
        // default to quick interval so we can get a decently accurate nowPlaying
        const {
            data: {
                interval = 10,
                maxInterval = 30,
                ...restData
            } = {}
        } = config;
        const subsonicConfig = {...config, data: {...restData, internal, maxInterval}};
        super('subsonic', name, subsonicConfig, internal,emitter);

        const {data: {user, password, url} = {}} = this.config;

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

    static formatPlayObj(obj: any, newFromSource = false): PlayObject {
        const {
            id,
            title,
            album,
            artist,
            duration, // seconds
            minutesAgo,
            playerId,
            username,
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
                source: 'Subsonic',
                trackId: id,
                newFromSource,
                user: username,
                deviceId: playerId
            }
        }
    }

    callApi = async (req: any, retries = 0) => {
        const {
            user,
            password,
            maxRequestRetries = 1,
            retryMultiplier = 1.5
        } = this.config.data;


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

    initialize = async () => {
        const {url} = this.config.data;
        try {
            await request.get(`${url}/`);
            this.logger.info('Subsonic Connection: ok');
            this.initialized = true;
        } catch (e) {
            if(e.status !== undefined && e.status !== 404) {
                this.logger.info('Subsonic Connection: ok');
                // we at least got a response!
                this.initialized = true;
            }
        }

        return this.initialized;
    }

    testAuth= async () => {
        const {url} = this.config.data;
        try {
            await this.callApi(request.get(`${url}/rest/ping`));
            this.authed = true;
            this.logger.info('Subsonic API Status: ok');
        } catch (e) {
            this.authed = false;
        }

        return this.authed;
    }

    getRecentlyPlayed = async (options: RecentlyPlayedOptions = {}) => {
        const {formatted = false} = options;
        const {url} = this.config.data;
        const resp = await this.callApi(request.get(`${url}/rest/getNowPlaying`));
        const {
            nowPlaying: {
                entry = []
            } = {}
        } = resp;
        // sometimes subsonic sources will return the same track as being played twice on the same player, need to remove this so we don't duplicate plays
        const deduped = removeDuplicates(entry.map(SubsonicSource.formatPlayObj));
        return this.processRecentPlays(deduped);
    }
}
