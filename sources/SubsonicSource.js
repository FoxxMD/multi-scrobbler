import AbstractSource from "./AbstractSource.js";
import request from 'superagent';
import crypto from 'crypto';
import dayjs from "dayjs";
import {buildTrackString, sleep} from "../utils.js";

export class SubsonicSource extends AbstractSource {

    polling = false;
    tracksDiscovered = 0;

    constructor(name, config = {}, clients = []) {
        super('subsonic', name, config, clients);

        const {user, password} = this.config;

        if (user === undefined) {
            throw new Error(`Cannot setup Subsonic source, 'user' is not defined`);
        }
        if (password === undefined) {
            throw new Error(`Cannot setup Subsonic source, 'password' is not defined`);
        }
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

    poll = async (allClients) => {
        if (this.polling === true) {
            return;
        }
        this.logger.info('Polling started');
        let lastTrackPlayedAt = dayjs();
        let checkCount = 0;
        try {
            this.polling = true;
            while (true) {
                let playObjs = [];
                this.logger.debug('Refreshing recently played')
                playObjs = await this.getRecentlyPlayed({formatted: true});
                checkCount++;
                let newTracksFound = false;
                let closeToInterval = false;
                const now = dayjs();

                const playInfo = playObjs.reduce((acc, playObj) => {
                    const {data: {playDate} = {}} = playObj;
                    if (playDate.unix() > lastTrackPlayedAt.unix()) {
                        newTracksFound = true;
                        this.logger.info(`New Track => ${buildTrackString(playObj)}`);

                        if (closeToInterval === false) {
                            closeToInterval = Math.abs(now.unix() - playDate.unix()) < 5;
                        }

                        return {
                            plays: [...acc.plays, {...playObj, meta: {...playObj.meta, newFromSource: true}}],
                            lastTrackPlayedAt: playDate
                        }
                    }
                    return {
                        ...acc,
                        plays: [...acc.plays, playObj]
                    }
                }, {plays: [], lastTrackPlayedAt});
                playObjs = playInfo.plays;
                lastTrackPlayedAt = playInfo.lastTrackPlayedAt;

                if (closeToInterval) {
                    // because the interval check was so close to the play date we are going to delay client calls for a few secs
                    // this way we don't accidentally scrobble ahead of any other clients (we always want to be behind so we can check for dups)
                    // additionally -- it should be ok to have this in the for loop because played_at will only decrease (be further in the past) so we should only hit this once, hopefully
                    this.logger.info('Track is close to polling interval! Delaying scrobble clients refresh by 10 seconds so other clients have time to scrobble first');
                    await sleep(10 * 1000);
                }

                if (newTracksFound === false) {
                    if (playObjs.length === 0) {
                        this.logger.debug(`No new tracks found and no tracks returned from API`);
                    } else {
                        this.logger.debug(`No new tracks found. Newest track returned was ${buildTrackString(playObjs.slice(-1)[0])}`);
                    }
                } else {
                    checkCount = 0;
                }

                const scrobbleResult = await allClients.scrobble(playObjs, {
                    forceRefresh: closeToInterval,
                    scrobbleFrom: this.identifier,
                    scrobbleTo: this.clients
                });

                if (scrobbleResult.length > 0) {
                    checkCount = 0;
                    this.tracksDiscovered += scrobbleResult.length;
                }

                const {interval = 30} = this.config;

                let sleepTime = interval;
                // don't need to do back off calc if interval is 10 minutes or greater since its already pretty light on API calls
                // and don't want to back off if we just started the app
                if (checkCount > 5 && sleepTime < 600) {
                    const lastPlayToNowSecs = Math.abs(now.unix() - lastTrackPlayedAt.unix());
                    // back off if last play was longer than 10 minutes ago
                    const backoffThreshold = Math.min((interval * 10), 600);
                    if (lastPlayToNowSecs >= backoffThreshold) {
                        // back off to a maximum of 5 minutes
                        sleepTime = Math.min(interval * 5, 300);
                    }
                }

                // sleep for interval
                this.logger.debug(`Sleeping for ${sleepTime}s`);
                await sleep(sleepTime * 1000);

            }
        } catch (e) {
            this.logger.error('Error occurred while polling');
            this.logger.error(e);
            this.polling = false;
        }
    }
}
