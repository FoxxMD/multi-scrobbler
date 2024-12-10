import { Logger } from "@foxxmd/logging";
import compareVersions from 'compare-versions';
import dayjs from 'dayjs';
import EventEmitter from "events";
import normalizeUrl from "normalize-url";
import request, { SuperAgentRequest } from 'superagent';
import { PlayObject } from "../../core/Atomic.js";
import { buildTrackString, capitalize } from "../../core/StringUtils.js";
import { isSuperAgentResponseError } from "../common/errors/ErrorUtils.js";
import { isNodeNetworkException } from "../common/errors/NodeErrors.js";
import { UpstreamError } from "../common/errors/UpstreamError.js";
import { DEFAULT_RETRY_MULTIPLIER, FormatPlayObjectOptions } from "../common/infrastructure/Atomic.js";
import { MalojaClientConfig } from "../common/infrastructure/config/client/maloja.js";
import {
    getMalojaResponseError,
    isMalojaAPIErrorBody,
    MalojaResponseV3CommonData,
    MalojaScrobbleData,
    MalojaScrobbleRequestData,
    MalojaScrobbleV2RequestData,
    MalojaScrobbleV3RequestData,
    MalojaScrobbleV3ResponseData, MalojaScrobbleWarning,
    MalojaV2ScrobbleData,
    MalojaV3ScrobbleData,
} from "../common/vendor/maloja/interfaces.js";
import { Notifiers } from "../notifier/Notifiers.js";
import { parseRetryAfterSecsFromObj, sleep } from "../utils.js";
import { getScrobbleTsSOCDate, getScrobbleTsSOCDateWithContext } from "../utils/TimeUtils.js";
import AbstractScrobbleClient from "./AbstractScrobbleClient.js";

const feat = ["ft.", "ft", "feat.", "feat", "featuring", "Ft.", "Ft", "Feat.", "Feat", "Featuring"];

export default class MalojaScrobbler extends AbstractScrobbleClient {

    requiresAuth = true;
    serverVersion: any;
    webUrl: string;

    declare config: MalojaClientConfig

    constructor(name: any, config: MalojaClientConfig, notifier: Notifiers, emitter: EventEmitter, logger: Logger) {
        super('maloja', name, config, notifier,  emitter,logger);
        this.MAX_INITIAL_SCROBBLES_FETCH = 100;
    }

    static formatPlayObj(obj: MalojaScrobbleData, options: FormatPlayObjectOptions = {}): PlayObject {
        let artists,
            title,
            album,
            duration,
            time,
            listenedFor;

        const {serverVersion, url} = options;

        if(serverVersion === undefined || compareVersions(serverVersion, '3.0.0') >= 0) {
            // scrobble data structure changed for v3
            const {
                // when the track was scrobbled
                time: mTime,
                track: {
                    artists: mArtists = [],
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
            listenedFor = mDuration;
            if(mAlbum !== null) {
                const {
                    albumtitle,
                    name: mAlbumName,
                    artists: albumArtists = []
                } = mAlbum || {};
                album = albumtitle ?? mAlbumName;
            }
        } else {
            // scrobble data structure for v2 and below
            const {
                artists: mArtists = [],
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
        const artistStrings = artists.reduce((acc: any, curr: any) => {
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
                listenedFor,
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

    callApi = async (req: SuperAgentRequest, retries = 0) => {
        const {
            maxRequestRetries = 1,
            retryMultiplier = DEFAULT_RETRY_MULTIPLIER
        } = this.config.data;

        try {
            return await req;
        } catch (e) {
            if((isNodeNetworkException(e) || isSuperAgentResponseError(e) && e.timeout)) {
                if(retries < maxRequestRetries) {
                    const retryAfter = parseRetryAfterSecsFromObj(e) ?? (retryMultiplier * (retries + 1));
                    this.logger.warn(`Request failed but retries (${retries}) less than max (${maxRequestRetries}), retrying request after ${retryAfter} seconds...`);
                    await sleep(retryAfter * 1000);
                    return await this.callApi(req, retries + 1)
                } else {
                    throw new UpstreamError(`Request continued to fail after reach max retries (${maxRequestRetries})`, {cause : e, showStopper: true});
                }
            } else if(isSuperAgentResponseError(e)) {
                const {
                    message,
                    response: {
                        status,
                        body,
                    } = {},
                    response,
                } = e;
                if(isMalojaAPIErrorBody(body)) {
                    throw new UpstreamError(buildErrorString(body), {cause: e})
                } else {
                    throw new UpstreamError(`API Call failed (HTTP ${status}) => ${message}`, {cause: e})
                }
            } else {
                throw new Error('Unexpected error occurred during API call', {cause : e});
            }
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
                throw new Error(`Communication test not OK! HTTP Status => Expected: 200 | Received: ${statusCode}`);
            }

            this.logger.info('Communication test succeeded.');

            if (version.length === 0) {
                this.logger.warn('Server did not respond with a version. Either the base URL is incorrect or this Maloja server is too old. multi-scrobbler will most likely not work with this server.');
            } else {
                this.logger.info(`Maloja Server Version: ${versionstring}`);
                this.serverVersion = versionstring;
                if(compareVersions(versionstring, '3.0.0') < 0) {
                    this.logger.warn(`Support for Maloja versions below 3.0.0 is DEPRECATED and will be removed in a future minor release.`);
                } else if(compareVersions(versionstring, '3.2.0') < 0) {
                    this.logger.warn(`Maloja versions below 3.2.0 do not support scrobbling albums.`);
                }
            }
            return true;
        } catch (e) {
            throw new Error('Communication test failed', {cause: e})
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
                throw new Error(`Server responded with NOT OK status: ${statusCode}`);
            }

            if(rebuildinprogress) {
                throw new Error(`Server is rebuilding database`);
            }

            if(!healthy) {
                throw new Error('Server responded that it is not healthy');
            }

            return true
        } catch (e) {
            throw new Error('Error encountered while testing server health', {cause: e});
        }
    }

    protected async doBuildInitData(): Promise<true | string | undefined> {
        const {data: {url, apiKey} = {}} = this.config;
        if (apiKey === undefined) {
            throw new Error("'apiKey' not found in config!");
        }
        if (url === undefined) {
            throw new Error("Missing 'url' for Maloja config");
        }
        this.webUrl = normalizeUrl(url);
        return true;
    }

    protected async doCheckConnection(): Promise<true | string | undefined> {
        await this.testConnection();
        await this.testHealth();
        return true;
    }


    doAuthentication = async () => {

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
                return true;
            } else {
                this.logger.error('Maloja API Response', {
                    status,
                    body,
                    text: text.slice(0, 50)
                });
                throw new Error('Server Response body was malformed -- should have returned "status: ok"...is the URL correct?', {cause: new Error(`Maloja API Response was ${status}: ${text.slice(0,50)}`)})
            }
        } catch (e) {
            if(e instanceof UpstreamError) {
                if((e?.cause as any)?.status === 403) {
                    // may be an older version that doesn't support auth readiness before db upgrade
                    // and if it was before api was accessible during db build then test would fail during testConnection()
                    if(compareVersions(this.serverVersion, '2.12.19') < 0) {
                        if(!(await this.isReady())) {
                            throw new UpstreamError(`Could not test auth because server is not ready`, {showStopper: false});
                        }
                    }
                }
            }
            throw e;
        }
    }

    getScrobblesForRefresh = async (limit: number) => {
        const {url} = this.config.data;
        const resp = await this.callApi(request.get(`${url}/apis/mlj_1/scrobbles?perpage=${limit}`));
        const {
            body: {
                list = [],
            } = {},
        } = resp;
        return list.map((x: any) => this.formatPlayObj(x));
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

    alreadyScrobbled = async (playObj: any, log = false) => (await this.existingScrobble(playObj)) !== undefined

    public playToClientPayload(playObj: PlayObject): MalojaScrobbleRequestData {

        const {apiKey} = this.config.data;

        const {
            data: {
                artists = [],
                albumArtists = [],
                album,
                track,
                duration,
                listenedFor
            } = {}
        } = playObj;

        const [pd, scrobbleTsSOC] = getScrobbleTsSOCDateWithContext(playObj);

        const scrobbleData: MalojaScrobbleRequestData = {
            title: track,
            album,
            key: apiKey,
            time: pd.unix(),
            // https://github.com/FoxxMD/multi-scrobbler/issues/42#issuecomment-1100184135
            length: duration,
        };
        if(listenedFor !== undefined && listenedFor > 0) {
            scrobbleData.duration = listenedFor;
        }

        // 3.0.3 has a BC for something (maybe seconds => length ?) -- see #42 in repo
        if(this.serverVersion === undefined || compareVersions(this.serverVersion, '3.0.2') > 0) {
            (scrobbleData as MalojaScrobbleV3RequestData).artists = artists;
            if(albumArtists.length > 0) {
                (scrobbleData as MalojaScrobbleV3RequestData).albumartists = albumArtists;
            }
        } else {
            // maloja seems to detect this deliminator much better than commas
            // also less likely artist has a forward slash in their name than a comma
            (scrobbleData as MalojaScrobbleV2RequestData).artist = artists.join(' / ');
        }

        return scrobbleData;
    }

    doScrobble = async (playObj: PlayObject) => {
        const {url, apiKey} = this.config.data;

        const {
            data: {
                album,
                duration,
                playDate,
            } = {},
            meta: {
                source,
                newFromSource = false,
            } = {}
        } = playObj;

        const pd =  getScrobbleTsSOCDate(playObj);

        const sType = newFromSource ? 'New' : 'Backlog';

        const scrobbleData = this.playToClientPayload(playObj);

        let responseBody: MalojaScrobbleV3ResponseData;

        try {
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
                            time: pd.unix(),
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
                            const warnStr = buildWarningString(w);
                            if(warnStr.includes('The submitted scrobble was not added')) {
                                throw new UpstreamError(`Maloja returned a warning but MS treating as error: ${warnStr}`, {showStopper: false});
                            }
                            this.logger.warn(`Maloja Warning: ${warnStr}`);
                        }
                    }
                } else {
                    throw new UpstreamError(buildErrorString(response), {showStopper: false});
                }
            } else {
                const {
                    body: {
                        track: {
                            time: mTime = pd.unix(),
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
            const scrobbleInfo = `Scrobbled (${newFromSource ? 'New' : 'Backlog'})     => (${source}) ${buildTrackString(playObj)}`;
            if(warning !== '') {
                this.logger.warn(`${scrobbleInfo} | ${warning}`);
                this.logger.debug(`Response: ${this.logger.debug(JSON.stringify(response.body))}`);
            } else {
                this.logger.info(scrobbleInfo);
            }
            return scrobbledPlay;
        } catch (e) {
            await this.notifier.notify({title: `Client - ${capitalize(this.type)} - ${this.name} - Scrobble Error`, message: `Failed to scrobble => ${buildTrackString(playObj)} | Error: ${e.message}`, priority: 'error'});
            this.logger.error(`Scrobble Error (${sType})`, {playInfo: buildTrackString(playObj), payload: scrobbleData});
            const responseError = getMalojaResponseError(e);
            if(responseError !== undefined) {
                if(responseError.status < 500 && e instanceof UpstreamError) {
                    e.showStopper = false;
                }
                if(responseError.response?.text !== undefined) {
                    this.logger.error('Raw Response:', { text: responseError.response?.text });
                }
            }
            throw e;
        } finally {
            this.logger.debug('Raw Payload:', scrobbleData);
        }
    }
}

const buildErrorString = (body: MalojaResponseV3CommonData) => {
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

const buildWarningString = (w: MalojaScrobbleWarning): string => {
    const parts: string[] = [`${typeof w.type === 'string' ? `(${w.type}) ` : ''}${w.desc ?? ''}`];
    let vals: string[] = [];
    if(w.value !== null && w.value !== undefined) {
        if(Array.isArray(w.value)) {
            vals = w.value;
        } else {
            vals.push(w.value);
        }
    }
    if(vals.length > 0) {
        parts.push(vals.join(' | '));
    }
    return parts.join(' => ');
}
