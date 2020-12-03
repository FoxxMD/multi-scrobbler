import AbstractScrobbleClient from "./AbstractScrobbleClient.js";
import request from 'superagent';
import dayjs from 'dayjs';
import {buildTrackString, createLabelledLogger, setIntersection, sortByPlayDate} from "../utils.js";

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
            album,
            duration,
            time,
        } = obj;
        let artistStrings = artists.reduce((acc, curr) => {
            let aString;
            if(typeof curr === 'string') {
                aString = curr;
            } else if(typeof curr === 'object') {
                aString = curr.name;
            }
            const aStrings = aString.split(',');
            return [...acc, ...aStrings];
        }, []);
        return {
            data: {
                artists: [...new Set(artistStrings)],
                track: title,
                album,
                duration,
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
            if (this.recentScrobbles.length > 0) {
                const [{data: {playDate: newestScrobbleTime = dayjs()} = {}} = {}] = this.recentScrobbles.slice(-1);
                const [{data: {playDate: oldestScrobbleTime = dayjs()} = {}} = {}] = this.recentScrobbles.slice(0, 1);
                this.newestScrobbleTime = newestScrobbleTime;
                this.oldestScrobbleTime = oldestScrobbleTime;
            }
        }
        this.lastScrobbleCheck = dayjs();
    }

    alreadyScrobbled = (playObj, log = false) => {
        const result = this.existingScrobble(playObj) !== undefined;
        if (log && result === true) {
            this.logger.debug(`${buildTrackString(playObj, {include: []})} was already scrobbled`);
        }
        return result;
    }

    existingScrobble = (playObj) => {
        if (false === this.checkExistingScrobbles || this.recentScrobbles.length === 0) {
            return undefined;
        }

        const {
            data: {
                track,
                artists: sourceArtists = [],
                playDate
            } = {},
            meta: {
                trackLength,
            } = {},
        } = playObj;

        // One of the ways Maloja cleans track titles is by removing "feat"
        let lowerTitle = track.toLocaleLowerCase().replace('.feat', '').replace('feat', '');
        // also remove [artist] from the track if found since that gets removed as well
        const lowerArtists = sourceArtists.map(x => x.toLocaleLowerCase());
        lowerTitle = lowerArtists.reduce((acc, curr) => acc.replace(curr, ''), lowerTitle);

        const largeDiffs = [];
        // TODO add a runtime config option for verbose debugging for commented log statements
        // TODO check artists as well
        const existingScrobble = this.recentScrobbles.find((x) => {
            const {data: {playDate: scrobbleTime, track: scrobbleTitle, artists = []} = {}} = x;

            const lowerScrobbleTitle = scrobbleTitle.toLocaleLowerCase();

            // because of all this replacing we need a more position-agnostic way of comparing titles so use intersection on title split by spaces
            // and compare against length of scrobble title
            const lowerTitleTerms = new Set(lowerTitle.split(' '));
            const commonTerms = setIntersection(new Set(lowerScrobbleTitle.split(' ')), lowerTitleTerms);

            let closeMatch = commonTerms.size/lowerTitleTerms.size >= 0.7;

            let closeTime = false;
            // check if scrobble time is same as play date (when the track finished playing AKA entered recent tracks)
            let scrobblePlayDiff = Math.abs(playDate.unix() - scrobbleTime.unix());
            let scrobblePlayStartDiff;
            if (scrobblePlayDiff < 10) {
                //this.logger.debug(`Scrobble with same name (${scrobbleTitle}) found and the play (finish time) vs. scrobble time diff was smaller than 10 seconds`);
                closeTime = true;
            }
            // also need to check that scrobble time isn't the BEGINNING of the track -- if the source supports durations
            if (closeTime === false && trackLength !== undefined) {
                scrobblePlayStartDiff = Math.abs(playDate.unix() - (scrobbleTime.unix() - trackLength));
                if (scrobblePlayStartDiff < 10) {
                    //this.logger.debug(`Scrobble with same name (${scrobbleTitle}) found and the play (start time) vs. scrobble time diff was smaller than 10 seconds`);
                    closeTime = true;
                }
            }

            // not sure how useful this actually is. its doing the job well and no one is asking for it right now so removing for now
            // if(closeMatch && !closeTime) {
            //     largeDiffs.push({
            //         endTimeDiff: scrobblePlayDiff,
            //         startTimeDiff: scrobblePlayStartDiff,
            //         playDate: scrobbleTime,
            //         title: scrobbleTitle,
            //     });
            // }

            if(closeMatch && closeTime) {
                return true;
            }
            if(closeTime) {
                // if time was close but didn't match title lets relax match slightly to see if it works
                const relaxedMatch = commonTerms.size/lowerTitleTerms.size >= 0.6;
                if(relaxedMatch) {
                    return true;
                }
            }



            return false;
        });
        // if (existingScrobble === undefined && largeDiffs.length > 0) {
        //     this.logger.debug('Scrobbles with same name detected but play diff and scrobble diffs were too large to consider dups.');
        //     for (const diff of largeDiffs) {
        //         this.logger.debug(`Scrobble: ${diff.title} | Played At ${playDate.local().format()} | End Diff ${diff.endTimeDiff.toFixed(0)}s | Start Diff ${diff.startTimeDiff === undefined ? 'N/A' : `${diff.startTimeDiff.toFixed(0)}s`}`);
        //     }
        // }
        return existingScrobble;
    }

    scrobble = async (playObj) => {
        const {url, apiKey} = this.config;

        const {
            data: {
                artists,
                album,
                track,
                duration,
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
                    // maloja seems to detect this deliminator much better than commas
                    // also less likely artist has a forward slash in their name than a comma
                    artist: artists.join(' / '),
                    seconds: duration,
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
