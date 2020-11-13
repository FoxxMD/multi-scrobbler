import ScrobbleClient from "./ScrobbleClient.js";
import request from 'superagent';
import format from 'date-fns/format/index.js';

export default class MalojaScrobbler extends ScrobbleClient {

    name = 'Maloja';

    refreshScrobbles = async () => {
        const {url} = this.config;
        const resp = await request.get(`${url}/apis/mlj_1/scrobbles?since=${format(new Date(), 'yyyy/MM/dd')}&to=${format(new Date(), 'yyyy/MM/dd')}`)
        this.recentScrobbles = resp.body.list.slice(0, 10);
        this.lastScrobbleCheck = new Date();
    }

    alreadyScrobbled = (title, playDate) => {
        const playUnix = playDate.getTime() / 1000;
        return this.recentScrobbles.some((x) => {
            const {time: mtime, title: mtitle} = x;
            // will only count as an existing scrobble if scrobble time and play time are less than 30 seconds apart
            const scrobblePlayDiff = Math.abs(playUnix - mtime);
            if (title === mtitle) {
                if (scrobblePlayDiff < 30) {
                    return true;
                }
                this.logger.debug(`Scrobble with same name found but play-scrobble time diff was larger than 30 seconds (${scrobblePlayDiff.toFixed(0)}s)`, {label: this.name});
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
