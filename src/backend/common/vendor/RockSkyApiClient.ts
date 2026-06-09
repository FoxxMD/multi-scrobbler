import dayjs from "dayjs";
import request, { Request, Response } from 'superagent';
import { PlayObject, PlayObjectMinimal, ScrobbleActionResult, URLData } from "../../../core/Atomic.js";
import { artistCreditsToNames, artistNamesToCredits, nonEmptyStringOrDefault } from "../../../core/StringUtils.js";
import { UpstreamError } from "../errors/UpstreamError.js";
import { AbstractApiOptions, DEFAULT_RETRY_MULTIPLIER, FormatPlayObjectOptions } from "../infrastructure/Atomic.js";
import { RockSkyClientData, RockSkyData, RockSkyOptions } from "../infrastructure/config/client/rocksky.js";
import AbstractApiClient from "./AbstractApiClient.js";
import { isPortReachableConnect, joinedUrl, normalizeWebAddress } from '../../utils/NetworkUtils.js';
import { unique } from '../../utils.js';
import { ListenPayload, ListenResponse, ListenType, SubmitPayload } from './listenbrainz/interfaces.js';
import { playToListenPayload } from './listenbrainz/lzUtils.js';
import { RockskyScrobble } from './rocksky/interfaces.js';
import { Handle } from "@atcute/lexicons";
import { getATProtoIdentifier, identifierToAtProtoHandle } from './atproto/atUtils.js';
import { baseFormatPlayObj } from "../../utils/PlayTransformUtils.js";
import { ScrobbleSubmitError } from "../errors/MSErrors.js";
import { tryApiCall } from "../../utils/RequestUtils.js";
import { CreateScrobbleInput, RockskyClient } from "@rocksky/sdk";
import { getRoot } from "../../ioc.js";
import { MSCache } from "../Cache.js";
import { HandleData } from "../infrastructure/config/client/atproto.js";
import { parseRegexSingle } from "@foxxmd/regex-buddy-core";

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
    cache: MSCache;
    userData!: HandleData

    rsClient?: RockskyClient;

    constructor(name: any, config: RockSkyData & RockSkyOptions, options: AbstractApiOptions) {
        super('RockSky', name, config, options);
        const {
            audioScrobblerUrl,
            apiUrl,
            token,
            key
        } = config;

        this.cache = getRoot().items.cache();
        this.lzUrl = normalizeWebAddress(audioScrobblerUrl ?? 'https://audioscrobbler.rocksky.app/');
        this.apiUrl = normalizeWebAddress(apiUrl ?? 'https://api.rocksky.app/xrpc/');

        this.logger.verbose(`Audioscrobbler URL: '${audioScrobblerUrl ?? '(None Given)'}' => Normalized: '${this.lzUrl.url}'`);
        this.logger.verbose(`API URL: '${apiUrl ?? '(None Given)'}' => Normalized: '${this.apiUrl.url}'`);
        this.handle = identifierToAtProtoHandle(this.config.handle, {logger: this.logger, defaultDomain: 'bsky.social'});
        if(key !== undefined) {
            this.logger.warn(`DEPRECATED: Listenbrainz interface (API Application 'key' auth) has been deprecated in favor of native API (access token auth). Please refer to the MS Rocksky docs and switch. Listenbrainz/key auth will be removed in a future release`);
        }
        this.rsClient = new RockskyClient({auth: token});
    }

    isLzMode = () => this.config.key !== undefined;

    doCallLZApi = async <T = Response>(req: Request, retries = 0): Promise<T> => {
        try {
            req.set('Authorization', `Token ${this.config.key}`);
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

    callLZApi = async <T = Response>(reqFunc: () => Request, retries = 0): Promise<T> => {

        try {
            return await tryApiCall(() => this.doCallLZApi(reqFunc()), {...this.config, logger: this.logger}) as T;
        } catch (e) {
            throw e;
        }
    }


    callApi = async <T = Response>(reqFunc: () => Request, retries = 0): Promise<T> => {
        const apiCall = async () => await reqFunc();

        try {
            return await tryApiCall(apiCall, {...this.config, logger: this.logger}) as T;
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
        if(this.isLzMode()) {
            try {
                await isPortReachableConnect(this.lzUrl.port, {host: this.lzUrl.url.hostname});
            } catch (e) {
                throw new Error('Could not reach Audioscrobbler URL endpoint', {cause: e});
            }
        }
        return true;
    }

    testAuth = async () => {
        this.userData = await getATProtoIdentifier({identifier: this.handle }, { logger: this.logger, cache: this.cache.cacheAuth });
        if(this.isLzMode()) {
            try {
                const resp = await this.callLZApi(() => request.get(`${joinedUrl(this.lzUrl.url,'1/validate-token')}`));
                return true;
            } catch (e) {
                throw e;
            }
        } else {
            try {
                const req = request.get('https://api.rocksky.app/profile').set('Authorization', `Bearer ${this.config.token}`);
                await req;
                return true;
            } catch (e) {
                throw new UpstreamError('Failed to get /profile with given token', {cause: e});
            }
        }
    }

    getUserListens = async (maxTracks: number, user?: string): Promise<UserScrobbleResponse> => {
        try {

            const res = await this.rsClient.actor.getActorScrobbles({
                limit: maxTracks,
                offset: 0,
                did: this.userData.did
            });
            return res;
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
        if(this.isLzMode()) {
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
                const resp = await this.callLZApi(() => request.post(`${joinedUrl(this.lzUrl.url,'1/submit-listens')}`).type('json').send(submitPayload));
                if(log) {
                    this.logger.debug(`Submit Response: ${resp.text}`)
                }
                return {payload: submitPayload, response: resp.body as SubmitResponse, createdAt: dayjs().toISOString()};
            } catch (e) {
                throw new ScrobbleSubmitError(`Error occurred while making Rocksky API scrobble (${listenType}) request`, {cause: e, payload: submitPayload});
            }
        } else {
            const payload = playToRockskyRecord(play);
            if(log) {
                this.logger.debug(`Submit Payload: ${JSON.stringify(payload)}`);
            }
            const resp = await this.rsClient.scrobble.createScrobble(playToRockskyRecord(play));
            return {payload, response: resp, createdAt: dayjs().toISOString()}
        }
    }

    static formatPlayObj(obj: any, options: FormatPlayObjectOptions): PlayObject {
        return rockskyScrobbleToPlay(obj);
    }
}

interface UserScrobbleResponse {
    scrobbles?: RockskyScrobble[]
}

export const rockskyScrobbleToPlay = (obj: RockskyScrobble, opts: {playId?: string, web?: string, user?: string} = {}): PlayObject => {
    const {
        playId,
        web,
        user
    } = opts;
    const play: PlayObjectMinimal = {
        data: {
            track: obj.title,
            artists: artistNamesToCredits(nonEmptyStringOrDefault(obj.artist) ? [obj.artist] : []),
            // @ts-expect-error its in the response but missing from types
            albumArtists: artistNamesToCredits(nonEmptyStringOrDefault(obj.albumArtist) ? [obj.albumArtist] : []),
            album: nonEmptyStringOrDefault(obj.album),
            // @ts-expect-error its in the response but missing from types
            playDate: dayjs.utc(obj.createdAt).local()
        },
        meta: {
            playId,
            user
        }
    };
    if(web !== undefined) {
        play.meta.url = {web};
    }
    if('trackId' in obj) {
        play.meta.trackId = obj.trackId as string;
    }
    // if('id' in obj) {
    //     play.meta.playId = obj.id as string;
    // }
    if('albumArt' in obj) {
        play.meta.art = {album: obj.albumArt as string}
    }

    if(obj.uri !== undefined) {
        const uriRes = parseRegexSingle(ATPROTO_URI_REGEX, obj.uri);
        if(uriRes !== undefined) {
            if(web === undefined) {
                play.meta.url = {
                    web: `https://atproto.at/viewer?uri=${uriRes.named.resource}`
                }
            }
            if(playId === undefined) {
                play.meta.playId = uriRes.named.tid;
            }
            if(user === undefined) {
                play.meta.user = uriRes.named.did;
            }
        }
    }

    return baseFormatPlayObj(obj, play);
}

export const playToRockskyRecord = (play: PlayObject): CreateScrobbleInput => {
    const csi: CreateScrobbleInput = {
        title: play.data.track,
        artist: artistCreditsToNames(play.data.artists).join(', '),
        album: play.data.album,
        mbId: play.data.meta?.brainz?.track,
        isrc: play.data.isrc,
        duration: play.data.duration !== undefined ? play.data.duration * 1000 : undefined,
        spotifyLink: play.meta.source === 'spotify' && play.meta.url?.web !== undefined ? play.meta.url?.web : undefined,
        timestamp: play.data.playDate.unix()
    }
    return csi;
}

const ATPROTO_URI_REGEX = new RegExp(/at:\/\/(?<resource>(?<did>did.*?)\/app\.rocksky\.scrobble\/(?<tid>.*))/);