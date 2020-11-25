import AbstractScrobbleClient from "./AbstractScrobbleClient.js";
import request from 'superagent';
import dayjs from 'dayjs';
import {buildTrackString, createLabelledLogger, sortByPlayDate} from "../utils.js";

export default class MalojaScrobbler extends AbstractScrobbleClient {

    name = 'Maloja';

    constructor(config = {}, options = {}) {
        super(config, options);
        this.logger = createLabelledLogger('maloja', 'Maloja');
    }

    static formatPlayObj(obj) {
        const {
            artists,
            title,
            time,
        } = obj;
        let artistString = artists.reduce((acc, curr) => acc.concat(curr.name), []).join(',');
        return {
            data: {
                artist: artistString,
                track: title,
                playDate: dayjs.unix(time),
            },
            meta: {
                source: 'Maloja',
            }
        }
    }

    callApi = async (req) => {
        try {
            return await req;
        } catch (e) {
            const {
                message,
                response: {
                    status,
                    body,
                    text,
                } = {},
                response,
            } = e;
            let msg = response !== undefined ? `API Call failed: Server Response => ${message}` : `API Call failed: ${message}`;
            const responseMeta = body ?? text;
            this.logger.error(msg, {status, response: responseMeta});
            throw e;
        }
    }

    testConnection = async () => {

        const {url, apiKey} = this.config;
        try {
            const serverInfoResp = await this.callApi(request.get(`${url}/apis/mlj_1/serverinfo`));
            const {
                body: {
                    version = [],
                    versionstring = '',
                } = {},
            } = serverInfoResp;
            if (version.length === 0) {
                this.logger.error('Server did not respond with a version. Either the base URL is incorrect or this Maloja server is too old :(');
                return false;
            }
            this.logger.info(`Maloja Server Version: ${versionstring}`);
            if (version[0] < 2 || version[1] < 7) {
                this.logger.warn('Maloja Server Version is less than 2.7, please upgrade to ensure compatibility');
            }

            const resp = await this.callApi(request
                .get(`${url}/apis/mlj_1/test`)
                .query({key: apiKey}));

            const {
                status,
                body: {
                    status: bodyStatus,
                } = {},
                body = {},
                text = '',
            } = resp;
            if (bodyStatus.toLocaleLowerCase() === 'ok') {
                this.logger.info('Test connection succeeded!');
                return true;
            }
            this.logger.error('Testing connection failed => Server Response body was malformed -- should have returned "status: ok"...is the URL correct?', {
                status,
                body,
                text: text.slice(0, 50)
            })
            return false;
        } catch (e) {
            this.logger.error('Testing connection failed');
            return false;
        }
    }

    refreshScrobbles = async () => {
        if (this.refreshEnabled) {
            const {url} = this.config;
            const resp = await this.callApi(request.get(`${url}/apis/mlj_1/scrobbles?max=20`));
            const {
                body: {
                    list = [],
                } = {},
            } = resp;
            this.recentScrobbles = list.map(x => MalojaScrobbler.formatPlayObj(x)).sort(sortByPlayDate);
            const [{data: {playDate: newestScrobbleTime = dayjs()} = {}} = {}] = this.recentScrobbles.slice(-1);
            const [{data: {playDate: oldestScrobbleTime = dayjs()} = {}} = {}] = this.recentScrobbles.slice(0, 1);
            this.newestScrobbleTime = newestScrobbleTime;
            this.oldestScrobbleTime = oldestScrobbleTime;
        }
        this.lastScrobbleCheck = dayjs();
    }

    alreadyScrobbled = (playObj) => {
        return this.existingScrobble(playObj) !== undefined;
    }

    existingScrobble = (playObj) => {
        if (false === this.checkExistingScrobbles || this.recentScrobbles.length === 0) {
            return undefined;
        }

        const {
            data: {
                track,
                playDate
            } = {},
            meta: {
                trackLength,
            } = {},
        } = playObj;

        const lowerTitle = track.toLocaleLowerCase();
        const largeDiffs = [];
        // TODO add a runtime config option for verbose debugging for commented log statements
        const existingScrobble = this.recentScrobbles.find((x) => {
            const {data: {playDate: scrobbleTime, track: scrobbleTitle} = {}} = x;
            const lowerScrobbleTitle = scrobbleTitle.toLocaleLowerCase();
            if (lowerTitle.includes(lowerScrobbleTitle) || lowerScrobbleTitle.includes(lowerTitle)) {
                let scrobblePlayStartDiff;

                // check if scrobble time is same as play date (when the track finished playing AKA entered recent tracks)
                let scrobblePlayDiff = Math.abs(playDate.unix() - scrobbleTime.unix());
                if (scrobblePlayDiff < 10) {
                    //this.logger.debug(`Scrobble with same name (${scrobbleTitle}) found and the play (finish time) vs. scrobble time diff was smaller than 10 seconds`);
                    return true;
                }
                // also need to check that scrobble time isn't the BEGINNING of the track -- if the source supports durations
                if (trackLength !== undefined) {
                    scrobblePlayStartDiff = Math.abs(playDate.unix() - (scrobbleTime.unix() - trackLength));
                    if (scrobblePlayStartDiff < 10) {
                        //this.logger.debug(`Scrobble with same name (${scrobbleTitle}) found and the play (start time) vs. scrobble time diff was smaller than 10 seconds`);
                        return true;
                    }
                }
                largeDiffs.push({
                    endTimeDiff: scrobblePlayDiff,
                    startTimeDiff: scrobblePlayStartDiff,
                    playDate: scrobbleTime,
                    title: scrobbleTitle,
                });
                return false;
            }
            return false;
        });
        if (existingScrobble === undefined && largeDiffs.length > 0) {
            this.logger.debug('Scrobbles with same name detected but play diff and scrobble diffs were too large to consider dups.');
            for (const diff of largeDiffs) {
                this.logger.debug(`Scrobble: ${diff.title} | Played At ${playDate.local().format()} | End Diff ${diff.endTimeDiff.toFixed(0)}s | Start Diff ${diff.startTimeDiff === undefined ? 'N/A' : `${diff.startTimeDiff.toFixed(0)}s`}`);
            }
        }
        return existingScrobble;
    }

    scrobble = async (playObj) => {
        const {url, apiKey} = this.config;

        const {
            data: {
                artist,
                album,
                track,
                playDate
            } = {},
            meta: {
                source,
                newFromSource = false,
            } = {}
        } = playObj;

        const sType = newFromSource ? 'New' : 'Backlog';

        try {
            await this.callApi(request.post(`${url}/apis/mlj_1/newscrobble`)
                .type('json')
                .send({
                    artist,
                    title: track,
                    album,
                    key: apiKey,
                    time: playDate.unix(),
                }));
            if (newFromSource) {
                this.logger.info(`Scrobbled (New)     => (${source}) ${buildTrackString(playObj)}`);
            } else {
                this.logger.info(`Scrobbled (Backlog) => (${source}) ${buildTrackString(playObj)}`);
            }
        } catch (e) {
            this.logger.error(`Scrobble Error (${sType})`, {playInfo: buildTrackString(playObj)});
            throw e;
        }

        return true;
    }
}
