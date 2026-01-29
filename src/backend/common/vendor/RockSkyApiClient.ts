import dayjs from "dayjs";
import request, { Request, Response } from 'superagent';
import { PlayObject, PlayObjectLifecycleless, ScrobbleActionResult, URLData } from "../../../core/Atomic.js";
import { nonEmptyStringOrDefault } from "../../../core/StringUtils.js";
import { UpstreamError } from "../errors/UpstreamError.js";
import { AbstractApiOptions, DEFAULT_RETRY_MULTIPLIER, FormatPlayObjectOptions } from "../infrastructure/Atomic.js";
import { RockSkyClientData, RockSkyData, RockSkyOptions } from "../infrastructure/config/client/rocksky.js";
import AbstractApiClient from "./AbstractApiClient.js";
import { isPortReachableConnect, joinedUrl, normalizeWebAddress } from '../../utils/NetworkUtils.js';
import { unique } from '../../utils.js';
import { ListenPayload, ListenResponse, ListenType, SubmitPayload } from './listenbrainz/interfaces.js';
import { playToListenPayload } from './ListenbrainzApiClient.js';
import { RockskyScrobble } from './rocksky/interfaces.js';
import { Handle } from "@atcute/lexicons";
import { identifierToAtProtoHandle } from './bluesky/bsUtils.js';
import { baseFormatPlayObj } from "../../utils/PlayTransformUtils.js";
import { ScrobbleSubmitError } from "../errors/MSErrors.js";

interface SubmitOptions {
    log?: boolean
    listenType?: ListenType
}

export interface ListensResponse {
    count: number;
    listens: ListenResponse[];
}

export interface SubmitResponse {
    payload?: {
        ignored_listens: number
        submitted_listens: number
    },
    status: string
}

export class RockSkyApiClient extends AbstractApiClient {

    declare config: RockSkyClientData;
    lzUrl: URLData;
    apiUrl: URLData;
    isKoito: boolean = false;
    handle: Handle;

    constructor(name: any, config: RockSkyData & RockSkyOptions, options: AbstractApiOptions) {
        super('RockSky', name, config, options);
        const {
            audioScrobblerUrl,
            apiUrl
        } = config;

        this.lzUrl = normalizeWebAddress(audioScrobblerUrl ?? 'https://audioscrobbler.rocksky.app/');
        this.apiUrl = normalizeWebAddress(apiUrl ?? 'https://api.rocksky.app/xrpc/');

        this.logger.verbose(`Audioscrobbler URL: '${audioScrobblerUrl ?? '(None Given)'}' => Normalized: '${this.lzUrl.url}'`);
        this.logger.verbose(`API URL: '${apiUrl ?? '(None Given)'}' => Normalized: '${this.apiUrl.url}'`);
        this.handle = identifierToAtProtoHandle(this.config.handle, {logger: this.logger, defaultDomain: 'bsky.social'});
    }


    callLZApi = async <T = Response>(req: Request, retries = 0): Promise<T> => {
        try {
            req.set('Authorization', `Token ${this.config.key ?? this.config.token}`);
            return await req as T;
        } catch (e) {
            const {
                message,
                err,
                status,
                response: {
                    body = undefined,
                    text = undefined,
                } = {}
            } = e;
            // TODO check err for network exception
            if(status !== undefined) {
                const msgParts = [`(HTTP Status ${status})`];
                // if the response is 400 then its likely there was an issue with the data we sent rather than an error with the service
                const showStopper = status !== 400;
                if(body !== undefined) {
                    if(typeof body === 'object') {
                        if('code' in body) {
                            msgParts.push(`Code ${body.code}`);
                        }
                        if('error' in body) {
                            msgParts.push(`Error => ${body.error}`);
                        }
                        if('message' in body) {
                            msgParts.push(`Message => ${body.error}`);
                        }
                        // if('track_metadata' in body) {
                        //     msgParts.push(`Track Metadata => ${JSON.stringify(body.track_metadata)}`);
                        // }
                    } else if(typeof body === 'string') {
                        msgParts.push(`Response => ${body}`);
                    }
                } else if (text !== undefined) {
                    msgParts.push(`Response => ${text}`);
                }
                throw new UpstreamError(`Listenbrainz API Request Failed => ${msgParts.join(' | ')}`, {cause: e, showStopper});
            }
            throw e;
        }
    }

    callApi = async <T = Response>(req: Request, retries = 0): Promise<T> => {
        const {
            maxRequestRetries = 2,
            retryMultiplier = DEFAULT_RETRY_MULTIPLIER
        } = this.config;

        try {
            return await req as T;
        } catch (e) {
            throw e;
        }
    }

    testConnection = async () => {
        try {
            await isPortReachableConnect(this.apiUrl.port, {host: this.apiUrl.url.hostname});
        } catch (e) {
            throw new Error('Could not reach API URL endpoint', {cause: e});
        }
        try {
            await isPortReachableConnect(this.lzUrl.port, {host: this.lzUrl.url.hostname});
        } catch (e) {
            throw new Error('Could not reach Audioscrobbler URL endpoint', {cause: e});
        }
        return true;
    }

    testAuth = async () => {
        try {
            const resp = await this.callLZApi(request.get(`${joinedUrl(this.lzUrl.url,'1/validate-token')}`));
            return true;
        } catch (e) {
            throw e;
        }
    }

    getUserListens = async (maxTracks: number, user?: string): Promise<UserScrobbleResponse> => {
        try {

            const resp = await this.callApi(request
                .get(`${joinedUrl(this.apiUrl.url,`app.rocksky.actor.getActorScrobbles`)}`)
                // this endpoint can take forever, sometimes, and we want to make sure we timeout in a reasonable amount of time for polling sources to continue trying to scrobble
                .timeout({
                    response: 3000, // wait 3 seconds before timeout if server doesn't response at all
                    deadline: 5000 // wait 5 seconds overall for request to complete
                })
                .query({
                    limit: maxTracks,
                    offset: 0,
                    did: user ?? this.config.handle
                })
                .redirects(1));
            return resp.body as UserScrobbleResponse;
        } catch (e) {
            throw e;
        }
    }

    getRecentlyPlayed = async (maxTracks: number, user?: string): Promise<PlayObject[]> => {
        try {
            const resp = await this.getUserListens(maxTracks, user);
            return resp.scrobbles.map(x => rockskyScrobbleToPlay(x));
        } catch (e) {
            this.logger.error(`Error encountered while getting User listens | Error =>  ${e.message}`);
            return [];
        }
    }


    submitListen = async (play: PlayObject, options: SubmitOptions = {}): Promise<ScrobbleActionResult> => {
        const { log = false, listenType = 'single'} = options;
        const listenPayload = playToListenPayload(play);
        if(listenType === 'playing_now') {
                delete listenPayload.listened_at;
            }
        // https://tangled.org/rocksky.app/rocksky/blob/main/crates/scrobbler/src/listenbrainz/types.rs#L11
        // rocksky only uses duration_ms
        if(play.data.duration !== undefined && listenPayload.track_metadata.additional_info?.duration !== undefined) {
            delete listenPayload.track_metadata.additional_info.duration;
            listenPayload.track_metadata.additional_info.duration_ms = Math.round(play.data.duration) * 1000;
        }
        const submitPayload: SubmitPayload = {listen_type: listenType, payload: [listenPayload]};

        try {
            if(log) {
                this.logger.debug(`Submit Payload: ${JSON.stringify(submitPayload)}`);
            }
            const resp = await this.callLZApi(request.post(`${joinedUrl(this.lzUrl.url,'1/submit-listens')}`).type('json').send(submitPayload));
            if(log) {
                this.logger.debug(`Submit Response: ${resp.text}`)
            }
            return {payload: submitPayload, response: resp.body as SubmitResponse};
        } catch (e) {
            throw new ScrobbleSubmitError(`Error occurred while making Rocksky API scrobble (${listenType}) request`, {cause: e, payload: submitPayload});
        }
    }

    static formatPlayObj(obj: any, options: FormatPlayObjectOptions): PlayObject {
        return rockskyScrobbleToPlay(obj);
    }
}

interface UserScrobbleResponse {
    scrobbles: RockskyScrobble[]
}

export const rockskyScrobbleToPlay = (obj: RockskyScrobble): PlayObject => {
    const play: PlayObjectLifecycleless = {
        data: {
            track: obj.title,
            artists: nonEmptyStringOrDefault(obj.artist) ? [obj.artist] : [],
            albumArtists: nonEmptyStringOrDefault(obj.albumArtist) ? [obj.albumArtist] : [],
            album: nonEmptyStringOrDefault(obj.album),
            playDate: dayjs.utc(obj.createdAt).local()
        },
        meta: {
            trackId: obj.trackId,
            playId: obj.id
        }
    };

    return baseFormatPlayObj(obj, play);
}