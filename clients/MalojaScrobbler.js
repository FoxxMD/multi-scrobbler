import AbstractScrobbleClient from "./AbstractScrobbleClient.js";
import request from 'superagent';
import dayjs from 'dayjs';
import {buildTrackString, createLabelledLogger, sortByPlayDate} from "../utils.js";

export default class MalojaScrobbler extends AbstractScrobbleClient {

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

    refreshScrobbles = async () => {
        if (this.refreshEnabled) {
            const {url} = this.config;
            const resp = await request.get(`${url}/apis/mlj_1/scrobbles?max=20`);
            this.recentScrobbles = resp.body.list.map(x => MalojaScrobbler.formatPlayObj(x)).sort(sortByPlayDate);
            const [{data: {playDate: newestScrobbleTime = dayjs()}} = {}] = this.recentScrobbles.slice(-1);
            const [{data: {playDate: oldestScrobbleTime = dayjs()}} = {}] = this.recentScrobbles.slice(0, 1);
            this.newestScrobbleTime = newestScrobbleTime;
            this.oldestScrobbleTime = oldestScrobbleTime;
        }
        this.lastScrobbleCheck = dayjs();
    }

    alreadyScrobbled = (playObj) => {
        return this.existingScrobble(playObj) !== undefined;
    }

    existingScrobble = (playObj) => {
        if (false === this.checkExistingScrobbles) {
            return false;
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
        if (existingScrobble && largeDiffs.length > 0) {
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

        try {
            await request.post(`${url}/apis/mlj_1/newscrobble`)
                .type('json')
                .send({
                    artist,
                    title: track,
                    album,
                    key: apiKey,
                    time: playDate.unix(),
                });
            if (newFromSource) {
                this.logger.info(`Scrobbled Newly Found Track (${source}): ${buildTrackString(playObj)}`);
            } else {
                this.logger.info(`Scrobbled Backlogged Track (${source}): ${buildTrackString(playObj)}`);
            }
        } catch (e) {
            this.logger.error('Error while scrobbling', {label: this.name, playInfo: buildTrackString(playObj)});
            this.logger.log(e);
        }

        return true;
    }
}
