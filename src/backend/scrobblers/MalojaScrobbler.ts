import AbstractScrobbleClient from "./AbstractScrobbleClient";
import request from 'superagent';
import dayjs from 'dayjs';
import compareVersions from 'compare-versions';
import {
    playObjDataMatch,
    setIntersection,
    sleep,
    sortByOldestPlayDate,
    parseRetryAfterSecsFromObj,
    isPlayTemporallyClose,
} from "../utils";
import {DEFAULT_RETRY_MULTIPLIER, FormatPlayObjectOptions, INITIALIZING} from "../common/infrastructure/Atomic";
import { MalojaClientConfig } from "../common/infrastructure/config/client/maloja";
import { Notifiers } from "../notifier/Notifiers";
import {Logger} from '@foxxmd/winston';
import {
    MalojaScrobbleData,
    MalojaScrobbleRequestData,
    MalojaScrobbleV2RequestData,
    MalojaScrobbleV3RequestData, MalojaScrobbleV3ResponseData, MalojaV2ScrobbleData, MalojaV3ScrobbleData
} from "../common/vendor/maloja/interfaces";
import { PlayObject, TrackStringOptions } from "../../core/Atomic";
import {buildTrackString, capitalize} from "../../core/StringUtils";
import EventEmitter from "events";
import normalizeUrl from "normalize-url";

const feat = ["ft.", "ft", "feat.", "feat", "featuring", "Ft.", "Ft", "Feat.", "Feat", "Featuring"];

export default class MalojaScrobbler extends AbstractScrobbleClient {

    requiresAuth = true;
    serverIsHealthy = false;
    serverVersion: any;
    webUrl: string;

    declare config: MalojaClientConfig

    constructor(name: any, config: MalojaClientConfig, notifier: Notifiers, emitter: EventEmitter, logger: Logger) {
        super('maloja', name, config, notifier,  emitter,logger);
        const {url, apiKey} = config.data;
        if (apiKey === undefined) {
            this.logger.warn("'apiKey' not found in config! Client will most likely fail when trying to scrobble");
        }
        if (url === undefined) {
            throw new Error("Missing 'url' for Maloja config");
        }
        this.webUrl = normalizeUrl(url);
    }

    static formatPlayObj(obj: MalojaScrobbleData, options: FormatPlayObjectOptions = {}): PlayObject {
        let artists,
            title,
            album,
            duration,
            time;

        const {serverVersion, url} = options;

        if(serverVersion === undefined || compareVersions(serverVersion, '3.0.0') >= 0) {
            // scrobble data structure changed for v3
            const {
                // when the track was scrobbled
                time: mTime,
                track: {
                    artists: mArtists,
                    title: mTitle,
                    album: mAlbum,
                    // length of the track
                    length: mLength,
                } = {},
                // how long the track was listened to before it was scrobbled
                duration: mDuration,
            } = obj as MalojaV3ScrobbleData;
            artists = mArtists;
            time = mTime;
            title = mTitle;
            duration = mLength;
            if(mAlbum !== null) {
                const {
                    albumtitle,
                    name: mAlbumName,
                    artists: albumArtists
                } = mAlbum || {};
                album = albumtitle ?? mAlbumName;
            }
        } else {
            // scrobble data structure for v2 and below
            const {
                artists: mArtists,
                title: mTitle,
                album: mAlbum,
                duration: mDuration,
                time: mTime,
            } = obj as MalojaV2ScrobbleData;
            artists = mArtists;
            title = mTitle;
            album = mAlbum;
            duration = mDuration;
            time = mTime;
        }
        let artistStrings = artists.reduce((acc: any, curr: any) => {
            let aString;
            if (typeof curr === 'string') {
                aString = curr;
            } else if (typeof curr === 'object') {
                aString = curr.name;
            }
            const aStrings = aString.split(',');
            return [...acc, ...aStrings];
        }, []);
        const urlParams = new URLSearchParams([['artist', artists[0]], ['title', title]]);
        return {
            data: {
                artists: [...new Set(artistStrings)] as string[],
                track: title,
                album,
                duration,
                playDate: dayjs.unix(time),
            },
            meta: {
                source: 'Maloja',
                url: {
                    web: `${url}/track?${urlParams.toString()}`
                }
            }
        }
    }

    formatPlayObj = (obj: any, options: FormatPlayObjectOptions = {}) => MalojaScrobbler.formatPlayObj(obj, {serverVersion: this.serverVersion, url: this.webUrl});

    callApi = async (req: any, retries = 0) => {
        const {
            maxRequestRetries = 1,
            retryMultiplier = DEFAULT_RETRY_MULTIPLIER
        } = this.config.data;

        try {
            return await req;
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
                    // @ts-expect-error TS(2525): Initializer provides no value for this binding ele... Remove this comment to see the full error message
                    body,
                    // @ts-expect-error TS(2525): Initializer provides no value for this binding ele... Remove this comment to see the full error message
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

        const {url} = this.config.data;
        try {
            const serverInfoResp = await this.callApi(request.get(`${url}/apis/mlj_1/serverinfo`));
            const {
                statusCode,
                body: {
                    version = [],
                    versionstring = '',
                } = {},
            } = serverInfoResp;

            if (statusCode >= 300) {
                this.logger.info(`Communication test not OK! HTTP Status => Expected: 200 | Received: ${statusCode}`);
                return false;
            }

            this.logger.info('Communication test succeeded.');

            if (version.length === 0) {
                this.logger.warn('Server did not respond with a version. Either the base URL is incorrect or this Maloja server is too old. multi-scrobbler will most likely not work with this server.');
            } else {
                this.logger.info(`Maloja Server Version: ${versionstring}`);
                this.serverVersion = versionstring;
                if(compareVersions(versionstring, '2.7.0') < 0) {
                    this.logger.warn('Maloja Server Version is less than 2.7, please upgrade to ensure compatibility');
                }
            }
            return true;
        } catch (e) {
            this.logger.error('Communication test failed');
            this.logger.error(e);
            return false;
        }
    }

    testHealth = async () => {

        const {url} = this.config.data;
        try {
            const serverInfoResp = await this.callApi(request.get(`${url}/apis/mlj_1/serverinfo`), 0);
            const {
                statusCode,
                body: {
                    // @ts-expect-error TS(2525): Initializer provides no value for this binding ele... Remove this comment to see the full error message
                    db_status: {
                        healthy = false,
                        rebuildinprogress = false,
                        complete = false,
                    }
                } = {},
            } = serverInfoResp;

            if (statusCode >= 300) {
                return [false, `Server responded with NOT OK status: ${statusCode}`];
            }

            if(rebuildinprogress) {
                return [false, 'Server is rebuilding database'];
            }

            if(!healthy) {
                return [false, 'Server responded that it is not healthy'];
            }

            return [true];
        } catch (e) {
            this.logger.error('Unexpected error encountered while testing server health');
            this.logger.error(e);
            throw e;
        }
    }

    initialize = async () => {
        // just checking that we can get a connection
        // @ts-expect-error TS(2322): Type 'number' is not assignable to type 'boolean'.
        this.initialized = INITIALIZING;
        this.initialized = await this.testConnection();
        return this.initialized;
    }

    testAuth = async () => {

        const {url, apiKey} = this.config.data;
        try {
            const resp = await this.callApi(request
                .get(`${url}/apis/mlj_1/test`)
                .query({key: apiKey}));

            const {
                status,
                body: {
                    // @ts-expect-error TS(2525): Initializer provides no value for this binding ele... Remove this comment to see the full error message
                    status: bodyStatus,
                } = {},
                body = {},
                text = '',
            } = resp;
            if (bodyStatus.toLocaleLowerCase() === 'ok') {
                this.logger.info('Auth test passed!');
                this.authed = true;
            } else {
                this.authed = false;
                this.logger.error('Testing connection failed => Server Response body was malformed -- should have returned "status: ok"...is the URL correct?', {
                    status,
                    body,
                    text: text.slice(0, 50)
                });
            }
        } catch (e) {
            if(e.status === 403) {
                // may be an older version that doesn't support auth readiness before db upgrade
                // and if it was before api was accessible during db build then test would fail during testConnection()
                if(compareVersions(this.serverVersion, '2.12.19') < 0) {
                    if(!(await this.isReady())) {
                        this.logger.error(`Could not test auth because server is not ready`);
                        this.authed = false;
                        return this.authed;
                    }
                }
            }
            this.logger.error('Auth test failed');
            this.logger.error(e);
            this.authed = false;
        }
        return this.authed;
    }

    isReady = async () => {
        if (this.serverIsHealthy) {
            return true;
        }

        try {
            const [isHealthy, status] = await this.testHealth();
            if (!isHealthy) {
                this.logger.error(`Server is not ready: ${status}`);
                this.serverIsHealthy = false;
            } else {
                this.logger.info('Server reported database is built and status is healthy');
                this.serverIsHealthy = true;
            }
        } catch (e) {
            this.logger.error(`Testing server health failed due to an unexpected error`);
            this.serverIsHealthy = false;
        }
        return this.serverIsHealthy
    }

    refreshScrobbles = async () => {
        if (this.refreshEnabled) {
            this.logger.debug('Refreshing recent scrobbles');
            const {url} = this.config.data;
            const resp = await this.callApi(request.get(`${url}/apis/mlj_1/scrobbles?max=${this.MAX_STORED_SCROBBLES}`));
            const {
                body: {
                    list = [],
                } = {},
            } = resp;
            this.logger.debug(`Found ${list.length} recent scrobbles`);
            this.recentScrobbles = list.map((x: any) => this.formatPlayObj(x));
            if (this.recentScrobbles.length > 0) {
                const [{data: {playDate: newestScrobbleTime = dayjs()} = {}} = {}] = this.recentScrobbles.slice(-1);
                const [{data: {playDate: oldestScrobbleTime = dayjs()} = {}} = {}] = this.recentScrobbles.slice(0, 1);
                this.newestScrobbleTime = newestScrobbleTime;
                this.oldestScrobbleTime = oldestScrobbleTime;

                this.filterScrobbledTracks();
            }
        }
        this.lastScrobbleCheck = dayjs();
    }

    cleanSourceSearchTitle = (playObj: PlayObject) => {
        const {
            data: {
                track,
                artists: sourceArtists = [],
            } = {},
        } = playObj;
        let lowerTitle = track.toLocaleLowerCase();
        lowerTitle = feat.reduce((acc, curr) => acc.replace(curr, ''), lowerTitle);
        // also remove [artist] from the track if found since that gets removed as well
        const lowerArtists = sourceArtists.map((x: any) => x.toLocaleLowerCase());
        lowerTitle = lowerArtists.reduce((acc: any, curr: any) => acc.replace(curr, ''), lowerTitle);

        // remove any whitespace in parenthesis
        lowerTitle = lowerTitle.replace("\\s+(?=[^()]*\\))", '')
            // replace parenthesis
            .replace('()', '')
            .replace('( )', '')
            .trim();

        return lowerTitle;
    }

    alreadyScrobbled = async (playObj: any, log = false) => {
        return (await this.existingScrobble(playObj)) !== undefined;
    }

    scrobble = async (playObj: PlayObject) => {
        const {url, apiKey} = this.config.data;

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

        const scrobbleData: MalojaScrobbleRequestData = {
            title: track,
            album,
            key: apiKey,
            time: playDate.unix(),
            // https://github.com/FoxxMD/multi-scrobbler/issues/42#issuecomment-1100184135
            length: duration,
        };

        let responseBody: MalojaScrobbleV3ResponseData;

        try {
            // 3.0.3 has a BC for something (maybe seconds => length ?) -- see #42 in repo
            if(this.serverVersion === undefined || compareVersions(this.serverVersion, '3.0.2') > 0) {
                (scrobbleData as MalojaScrobbleV3RequestData).artists = artists;
            } else {
                // maloja seems to detect this deliminator much better than commas
                // also less likely artist has a forward slash in their name than a comma
                (scrobbleData as MalojaScrobbleV2RequestData).artist = artists.join(' / ');
            }

            const response = await this.callApi(request.post(`${url}/apis/mlj_1/newscrobble`)
                .type('json')
                .send(scrobbleData));

            let scrobbleResponse: any | undefined = undefined,
                scrobbledPlay: PlayObject;

            if(this.serverVersion === undefined || compareVersions(this.serverVersion, '3.0.0') >= 0) {
                responseBody = response.body;
                const {
                    track,
                    status,
                    warnings = [],
                } = responseBody;
                if(status === 'success') {
                    if(track !== undefined) {
                        scrobbleResponse = {
                            time: playDate.unix(),
                            track: {
                                ...track,
                                length: duration
                            },
                        }
                        if (album !== undefined) {
                            const {
                                album: malojaAlbum = {},
                            } = track;
                            scrobbleResponse.track.album = {
                                ...malojaAlbum,
                                name: album
                            }
                        }
                    }
                    if(warnings.length > 0) {
                        for(const w of warnings) {
                            this.logger.warn(`Maloja Warning: ${w.desc} => ${JSON.stringify(w.value)}`)
                        }
                    }
                } else {
                    throw new Error(buildErrorString(response));
                }
            } else {
                const {
                    body: {
                        track: {
                            time: mTime = playDate.unix(),
                            duration: mDuration = duration,
                            album: mAlbum = album,
                            ...rest
                        } = {}
                    } = {}
                } = response;
                scrobbleResponse = {...rest, album: mAlbum, time: mTime, duration: mDuration};
            }
            let warning = '';
            if(scrobbleResponse === undefined) {
                warning = `WARNING: Maloja did not return track data in scrobble response! Maybe it didn't scrobble correctly??`;
                scrobbledPlay = playObj;
            } else {
                scrobbledPlay = this.formatPlayObj(scrobbleResponse)
            }
            this.addScrobbledTrack(playObj, scrobbledPlay);
            const scrobbleInfo = `Scrobbled (${newFromSource ? 'New' : 'Backlog'})     => (${source}) ${buildTrackString(playObj)}`;
            if(warning !== '') {
                this.logger.warn(`${scrobbleInfo} | ${warning}`);
                this.logger.debug(`Response: ${this.logger.debug(JSON.stringify(response.body))}`);
            } else {
                this.logger.info(scrobbleInfo);
            }
        } catch (e) {
            await this.notifier.notify({title: `Client - ${capitalize(this.type)} - ${this.name} - Scrobble Error`, message: `Failed to scrobble => ${buildTrackString(playObj)} | Error: ${e.message}`, priority: 'error'});
            this.logger.error(`Scrobble Error (${sType})`, {playInfo: buildTrackString(playObj), payload: scrobbleData});
            if(responseBody !== undefined) {
                this.logger.error('Raw Response:', responseBody);
            }
            throw e;
        } finally {
            this.logger.debug('Raw Payload:', scrobbleData);
        }

        return true;
    }
}

const buildErrorString = (body: MalojaScrobbleV3ResponseData) => {
    let valString: string | undefined = undefined;
    const {
        status,
        error: {
            type,
            value,
            desc
        } = {}
    } = body;
    if(value !== undefined && value !== null) {
        if(typeof value === 'string') {
            valString = value;
        } else if(Array.isArray(value)) {
            valString = value.map(x => {
                if(typeof x === 'string') {
                    return x;
                }
                return JSON.stringify(x);
            }).join(', ');
        } else {
            valString = JSON.stringify(value);
        }
    }
    return `Maloja API returned ${status} of type ${type} "${desc}"${valString !== undefined ? `: ${valString}` : ''}`;
}
