import AbstractScrobbleClient from "./AbstractScrobbleClient.js";
import request from 'superagent';
import dayjs from 'dayjs';
import {buildTrackString} from "../utils.js";

export default class MalojaScrobbler extends AbstractScrobbleClient {

    name = 'Maloja';

    refreshScrobbles = async () => {
        if (this.refreshEnabled) {
            const {url} = this.config;
            const today = dayjs().format('YYYY/MM/DD');
            const resp = await request.get(`${url}/apis/mlj_1/scrobbles?since=${today}&to=${today}&max=50`);
            this.recentScrobbles = resp.body.list;
            this.newestScrobbleTime = dayjs.unix(this.recentScrobbles.slice(0,1)[0].time);
            this.oldestScrobbleTime = dayjs.unix(this.recentScrobbles.slice(-1)[0].time);
        }
        this.lastScrobbleCheck = dayjs();
    }

    alreadyScrobbled = (playObj) => {
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

        const playUnix = playDate.unix();
        const lowerTitle = track.toLocaleLowerCase();
        return this.recentScrobbles.some((x) => {
            const {time: scrobbleTime, title: scrobbleTitle} = x;
            const lowerScrobbleTitle = scrobbleTitle.toLocaleLowerCase();
            if (lowerTitle.includes(lowerScrobbleTitle) || lowerScrobbleTitle.includes(lowerTitle)) {
                // check if scrobble time is same as play date (when the track finished playing AKA entered recent tracks)
                let scrobblePlayDiff = Math.abs(playUnix - scrobbleTime);
                if (scrobblePlayDiff < 10) {
                    // this.logger.debug(`Scrobble with same name (${scrobbleTitle}) found and the play (finish time) vs. scrobble time diff was smaller than 10 seconds`, {label: this.name});
                    return true;
                }
                // also need to check that scrobble time isn't the BEGINNING of the track
                let scrobblePlayStartDiff = Math.abs(playUnix - (scrobbleTime - trackLength));
                if (scrobblePlayStartDiff < 10) {
                   // this.logger.debug(`Scrobble with same name (${scrobbleTitle}) found and the play (start time) vs. scrobble time diff was smaller than 10 seconds`, {label: this.name});
                    return true;
                }
                // this.logger.debug(`Scrobble with same name (${scrobbleTitle}) found but the start/finish times vs scrobble time diffs were too large to consider dups (Start Diff ${scrobblePlayStartDiff.toFixed(0)}s) (End Diff ${scrobblePlayDiff.toFixed(0)}s)`, {label: this.name});
                return false;
            }
            return false;
        });
    }

    scrobble = async (playObj, {foundInSourceDiff = false, source}) => {
        const {url, apiKey} = this.config;

        const {
            data: {
                artist,
                album,
                track,
                playDate
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
            if(foundInSourceDiff) {
                this.logger.info(`Scrobbled Newly Found Track (${source}): ${buildTrackString(playObj)}`, {label: this.name});
            } else {
                this.logger.info(`Scrobbled Backlogged Track (${source}): ${buildTrackString(playObj)}`, {label: this.name});
            }
        } catch (e) {
            this.logger.error('Error while scrobbling', {label: this.name, playInfo: buildTrackString(playObj)});
            this.logger.log(e);
        }

        return true;
    }
}
