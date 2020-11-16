import ScrobbleClient from "./ScrobbleClient.js";
import request from 'superagent';
import dayjs from 'dayjs';

export default class MalojaScrobbler extends ScrobbleClient {

    name = 'Maloja';

    refreshScrobbles = async () => {
        const {url} = this.config;
        const today = dayjs().format('YYYY/MM/DD');
        const resp = await request.get(`${url}/apis/mlj_1/scrobbles?since=${today}&to=${today}`);
        this.recentScrobbles = resp.body.list.slice(0, 10);
        this.lastScrobbleCheck = new Date();
    }

    alreadyScrobbled = (title, playDate, duration) => {
        const playUnix = playDate.getTime() / 1000;
        const lowerTitle = title.toLocaleLowerCase();
        return this.recentScrobbles.some((x) => {
            const {time: scrobbleTime, title: scrobbleTitle} = x;
            const lowerScrobbleTitle = scrobbleTitle.toLocaleLowerCase();
            if (lowerTitle.includes(lowerScrobbleTitle) || lowerScrobbleTitle.includes(lowerTitle)) {
                // check if scrobble time is same as play date (when the track finished playing AKA entered recent tracks)
                let scrobblePlayDiff = Math.abs(playUnix - scrobbleTime);
                if (scrobblePlayDiff < 10) {
                    this.logger.debug(`Scrobble with same name found and the play (finish time) vs. scrobble time diff was smaller than 10 seconds`, {label: this.name});
                    return true;
                }
                // also need to check that scrobble time isn't the BEGINNING of the track
                let scrobblePlayStartDiff = Math.abs(playUnix - (scrobbleTime - duration));
                if (scrobblePlayStartDiff < 10) {
                    this.logger.debug(`Scrobble with same name found and the play (start time) vs. scrobble time diff was smaller than 10 seconds`, {label: this.name});
                    return true;
                }
                this.logger.debug(`Scrobble with same name found but the start/finish times vs scrobble time diffs were too large to consider dups (Start Diff ${scrobblePlayStartDiff}s) (End Diff ${scrobblePlayDiff}s)`, {label: this.name});
                return false;
            }
            return false;
        })
    }

    scrobble = async (playObj) => {
        const {url, apiKey} = this.config;

        const {
            track: {
                artists = [],
                name,
                id,
                external_urls: {
                    spotify,
                } = {}
            } = {},
            played_at
        } = playObj;

        let artistString = artists.reduce((acc, curr) => acc.concat(curr.name), []).join(',');
        const time = new Date(played_at);
        try {
            await request.post(`${url}/apis/mlj_1/newscrobble`)
                .type('json')
                .send({
                    artist: artistString,
                    title: name,
                    key: apiKey,
                    time: time.getTime() / 1000
                });
            this.logger.info('Scrobbled', {label: this.name});
        } catch (e) {
            this.logger.error('Error while scrobbling', {label: this.name});
            this.logger.log(e);
        }

        return true;
    }
}
