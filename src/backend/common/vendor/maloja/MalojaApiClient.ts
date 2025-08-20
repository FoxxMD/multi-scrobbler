import dayjs from 'dayjs';
import request, { SuperAgentRequest, Response } from 'superagent';
import compareVersions from "compare-versions";
import AbstractApiClient from "../AbstractApiClient.js";
import { getBaseFromUrl, isPortReachableConnect, joinedUrl, normalizeWebAddress } from "../../../utils/NetworkUtils.js";
import { MalojaData } from "../../infrastructure/config/client/maloja.js";
import { PlayObject, URLData } from "../../../../core/Atomic.js";
import { AbstractApiOptions, DEFAULT_RETRY_MULTIPLIER, FormatPlayObjectOptions } from "../../infrastructure/Atomic.js";
import { isNodeNetworkException } from "../../errors/NodeErrors.js";
import { isSuperAgentResponseError } from "../../errors/ErrorUtils.js";
import { getNonEmptyVal, parseRetryAfterSecsFromObj, removeUndefinedKeys, sleep } from "../../../utils.js";
import { UpstreamError } from "../../errors/UpstreamError.js";
import { getMalojaResponseError, isMalojaAPIErrorBody, MalojaResponseV3CommonData, MalojaScrobbleData, MalojaScrobbleRequestData, MalojaScrobbleV3RequestData, MalojaScrobbleV3ResponseData, MalojaScrobbleWarning } from "./interfaces.js";
import { getScrobbleTsSOCDate, getScrobbleTsSOCDateWithContext } from '../../../utils/TimeUtils.js';
import { buildTrackString } from '../../../../core/StringUtils.js';



export class MalojaApiClient extends AbstractApiClient {

    declare config: MalojaData;
    url: URLData;
    serverVersion: any;

    constructor(name: any, config: MalojaData, options: AbstractApiOptions) {
        super('Maloja', name, config, options);

        const {
            url
        } = this.config;

        const u = normalizeWebAddress(url);
        this.url = u;

        this.logger.verbose(`Config URL: '${url ?? '(None Given)'}' => Normalized: '${this.url.url}'`)
    }

    callApi = async <T = Response>(req: SuperAgentRequest, retries = 0): Promise<T> => {
        const {
            maxRequestRetries = 1,
            retryMultiplier = DEFAULT_RETRY_MULTIPLIER
        } = this.config;

        try {
            return await req as T;
        } catch (e) {
            if ((isNodeNetworkException(e) || isSuperAgentResponseError(e) && e.timeout)) {
                if (retries < maxRequestRetries) {
                    const retryAfter = parseRetryAfterSecsFromObj(e) ?? (retryMultiplier * (retries + 1));
                    this.logger.warn(`Request failed but retries (${retries}) less than max (${maxRequestRetries}), retrying request after ${retryAfter} seconds...`);
                    await sleep(retryAfter * 1000);
                    return await this.callApi(req, retries + 1)
                } else {
                    throw new UpstreamError(`Request continued to fail after reach max retries (${maxRequestRetries})`, { cause: e, showStopper: true });
                }
            } else if (isSuperAgentResponseError(e)) {
                const {
                    message,
                    response: {
                        status,
                        body,
                    } = {},
                    response,
                } = e;
                if (isMalojaAPIErrorBody(body)) {
                    throw new UpstreamError(buildMalojaErrorString(body), { cause: e })
                } else {
                    throw new UpstreamError(`API Call failed (HTTP ${status}) => ${message}`, { cause: e })
                }
            } else {
                throw new Error('Unexpected error occurred during API call', { cause: e });
            }
        }
    }

    testConnection = async () => {
        try {
            await isPortReachableConnect(this.url.port, { host: this.url.url.hostname });
        } catch (e) {
            throw new Error(`Maloja server is not reachable at ${this.url.url.hostname}:${this.url.port}`, { cause: e });
        }

        try {
            const serverInfoResp = await this.callApi(request.get(`${this.url.url}/apis/mlj_1/serverinfo`));
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
                throw new Error('Server did not respond with a version. Either the base URL is incorrect or this Maloja server is too old. Maloja versions below 3.0.0 are not supported.');
            } else {
                this.logger.info(`Maloja Server Version: ${versionstring}`);
                this.serverVersion = versionstring;
                if (compareVersions(versionstring, '3.0.0') < 0) {
                    throw new Error(`Maloja versions below 3.0.0 are not supported.`);
                } else if (compareVersions(versionstring, '3.2.0') < 0) {
                    this.logger.warn(`Maloja versions below 3.2.0 do not support scrobbling albums.`);
                }
            }
            return true;
        } catch (e) {
            throw new Error('Communication test failed', { cause: e })
        }

    }

    testHealth = async () => {

        try {
            const serverInfoResp = await this.callApi(request.get(`${this.url.url}/apis/mlj_1/serverinfo`), 0);
            const {
                statusCode,
                body: {
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

            if (rebuildinprogress) {
                throw new Error(`Server is rebuilding database`);
            }

            if (!healthy) {
                throw new Error('Server responded that it is not healthy');
            }

            return true
        } catch (e) {
            throw new Error('Error encountered while testing server health', { cause: e });
        }
    }

    testAuth = async () => {
        try {
            const resp = await this.callApi(request
                .get(`${this.url.url}/apis/mlj_1/test`)
                .query({ key: this.config.apiKey }));

            const {
                status,
                body: {
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
                throw new Error('Server Response body was malformed -- should have returned "status: ok"...is the URL correct?', { cause: new Error(`Maloja API Response was ${status}: ${text.slice(0, 50)}`) })
            }
        } catch (e) {
            throw e;
        }
    }

    getRecentScrobbles = async (limit: number) => {
        const resp = await this.callApi(request.get(`${this.url.url}/apis/mlj_1/scrobbles?perpage=${limit}`));
        const {
            body: {
                list = [],
            } = {},
        } = resp;
        return list.map(formatPlayObj);
    }

    scrobble = async (playObj: PlayObject): Promise<[(MalojaScrobbleData | undefined), MalojaScrobbleV3ResponseData, string?]> => {

        const {
            data: {
                album,
                albumArtists = [],
                duration,
            } = {},
            meta: {
                newFromSource = false,
            } = {}
        } = playObj;

        const sType = newFromSource ? 'New' : 'Backlog';

        const pd = getScrobbleTsSOCDate(playObj);

        const scrobbleData = playToScrobblePayload(playObj, this.config.apiKey);

        try {


            const response = await this.callApi(request.post(`${this.url.url}/apis/mlj_1/newscrobble`)
                .type('json')
                .send(scrobbleData));

            let scrobbleResponse: MalojaScrobbleData,
                scrobbledPlay: PlayObject;

            let responseBody: MalojaScrobbleV3ResponseData;
            let warnStr: string;

            responseBody = response.body;
            const {
                track,
                status,
                warnings = [],
            } = responseBody;
            if (status === 'success') {
                if (track !== undefined) {
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
                            name: album,
                            artists: albumArtists,
                            ...malojaAlbum,
                        }
                    }
                }
                if (warnings.length > 0) {
                    for (const w of warnings) {
                        warnStr = builMalojadWarningString(w);
                        if (warnStr.includes('The submitted scrobble was not added')) {
                            throw new UpstreamError(`Maloja returned a warning but MS treating as error: ${warnStr}`, { showStopper: false });
                        }
                        this.logger.warn(`Maloja Warning: ${warnStr}`);
                    }
                }
            } else {
                throw new UpstreamError(buildMalojaErrorString(response.body), { showStopper: false });
            }

            return [scrobbleResponse, responseBody, warnStr]
        } catch (e) {
            this.logger.error(`Scrobble Error (${sType})`, { playInfo: buildTrackString(playObj), payload: scrobbleData });
            const responseError = getMalojaResponseError(e);
            if (responseError !== undefined) {
                if (responseError.status < 500 && e instanceof UpstreamError) {
                    e.showStopper = false;
                }
                if (responseError.response?.text !== undefined) {
                    this.logger.error('Raw Response:', { text: responseError.response?.text });
                }
            }
            throw e;
        }
    }
}

export const buildMalojaErrorString = (body: MalojaResponseV3CommonData) => {
    let valString: string | undefined = undefined;
    const {
        status,
        error: {
            type,
            value,
            desc
        } = {}
    } = body;
    if (value !== undefined && value !== null) {
        if (typeof value === 'string') {
            valString = value;
        } else if (Array.isArray(value)) {
            valString = value.map(x => {
                if (typeof x === 'string') {
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

export const builMalojadWarningString = (w: MalojaScrobbleWarning): string => {
    const parts: string[] = [`${typeof w.type === 'string' ? `(${w.type}) ` : ''}${w.desc ?? ''}`];
    let vals: string[] = [];
    if (w.value !== null && w.value !== undefined) {
        if (Array.isArray(w.value)) {
            vals = w.value;
        } else {
            vals.push(w.value);
        }
    }
    if (vals.length > 0) {
        parts.push(vals.join(' | '));
    }
    return parts.join(' => ');
}

export const formatPlayObj = (obj: MalojaScrobbleData, options: FormatPlayObjectOptions = {}): PlayObject => {
    let artists,
        title,
        album,
        duration,
        time,
        listenedFor;

    const { url } = options;

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
    } = obj;

    artists = mArtists;
    time = mTime;
    title = mTitle;
    duration = getNonEmptyVal(mLength);
    listenedFor = getNonEmptyVal(mDuration);
    if (mAlbum !== null) {
        const {
            albumtitle,
            name: mAlbumName,
            artists: albumArtists = []
        } = mAlbum || {};
        album = albumtitle ?? mAlbumName;
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
        data: removeUndefinedKeys({
            artists: [...new Set(artistStrings)] as string[],
            track: title,
            album,
            duration,
            listenedFor,
            playDate: dayjs.unix(time),
        }),
        meta: {
            source: 'Maloja',
            url: {
                web: `${url}/track?${urlParams.toString()}`
            }
        }
    }
}

export const playToScrobblePayload = (playObj: PlayObject, apiKey?: string): MalojaScrobbleV3RequestData => {

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

    const scrobbleData: MalojaScrobbleV3RequestData = {
        title: track,
        artists,
        album,
        key: apiKey,
        time: pd.unix(),
        // https://github.com/FoxxMD/multi-scrobbler/issues/42#issuecomment-1100184135
        length: duration,
    };
    if (listenedFor !== undefined && listenedFor > 0) {
        scrobbleData.duration = listenedFor;
    }

    if (albumArtists.length > 0) {
        scrobbleData.albumartists = albumArtists;
    }

    return scrobbleData;
}