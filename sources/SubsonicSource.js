import AbstractSource from "./AbstractSource.js";
import request from 'superagent';
import crypto from 'crypto';
import dayjs from "dayjs";
import {buildTrackString, sleep} from "../utils.js";

export class SubsonicSource extends AbstractSource {

    constructor(name, config = {}, clients = []) {
        super('subsonic', name, config, clients);

        const {user, password} = this.config;

        if (user === undefined) {
            throw new Error(`Cannot setup Subsonic source, 'user' is not defined`);
        }
        if (password === undefined) {
            throw new Error(`Cannot setup Subsonic source, 'password' is not defined`);
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

    callApi = async (req) => {
        const {user, password} = this.config;

        const salt = await crypto.randomBytes(10).toString('hex');
        const hash = crypto.createHash('md5').update(`${password}${salt}`).digest('hex')
        req.query({
            u: user,
            t: hash,
            s: salt,
            v: '1.15.0',
            c: `multi-scrobbler - ${this.name}`,
            f: 'json'
        })
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
        return entry.map(x => formatted ? SubsonicSource.formatPlayObj(x) : x)
    }
}
