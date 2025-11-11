import dayjs from "dayjs";
import request, { Request, Response } from 'superagent';
import { PlayObject, URLData } from "../../../core/Atomic.js";
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

interface SubmitOptions {
    log?: boolean
    listenType?: ListenType
}

export interface ListensResponse {
    count: number;
    listens: ListenResponse[];
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
            req.set('Authorization', `Token ${this.config.token}`);
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
            const resp = await this.callApi(request.get(`${joinedUrl(this.lzUrl.url,'1/validate-token')}`));
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


    submitListen = async (play: PlayObject, options: SubmitOptions = {}) => {
        const { log = false, listenType = 'single'} = options;
        try {
            const listenPayload: SubmitPayload = {listen_type: listenType, payload: [playToListenPayload(play)]};
            if(listenType === 'playing_now') {
                delete listenPayload.payload[0].listened_at;
            }
            if(log) {
                this.logger.debug(`Submit Payload: ${JSON.stringify(listenPayload)}`);
            }
            // response consists of {"status": "ok"}
            // so no useful information
            // https://listenbrainz.readthedocs.io/en/latest/users/api-usage.html#submitting-listens
            // TODO may we should make a call to recent-listens to get the parsed scrobble?
            const resp = await this.callLZApi(request.post(`${joinedUrl(this.lzUrl.url,'1/submit-listens')}`).type('json').send(listenPayload));
            if(log) {
                this.logger.debug(`Submit Response: ${resp.text}`)
            }
            return listenPayload;
        } catch (e) {
            throw e;
        }
    }

    static listenPayloadToPlay(payload: ListenPayload, nowPlaying: boolean = false): PlayObject {
        const {
            listened_at = dayjs().unix(),
            track_metadata: {
                artist_name,
                track_name,
                release_name,
                additional_info: {
                    duration,
                    track_mbid,
                    artist_mbids,
                    artist_names = [],
                    release_mbid,
                    release_group_mbid,
                    release_artist_name,
                    release_artist_names = []
                } = {}
            } = {},
        } = payload;

        let albumArtists: string[];
        if(release_artist_name !== undefined) {
            albumArtists = [release_artist_name];
        }
        if(release_artist_names.length > 0) {
            albumArtists = unique([...(albumArtists ?? []), ...release_artist_names])
        }

        return {
            data: {
                playDate: typeof listened_at === 'number' ? dayjs.unix(listened_at) : dayjs(listened_at),
                track: track_name,
                artists: unique([artist_name, ...artist_names]),
                albumArtists,
                album: release_name,
                duration,
                meta: {
                    brainz: {
                        artist: artist_mbids !== undefined ? artist_mbids : undefined,
                        album: release_mbid,
                        albumArtist: release_group_mbid,
                        track: track_mbid
                    }
                }
            },
            meta: {
                nowPlaying,
            }
        }
    }

    static submitToPlayObj(submitObj: SubmitPayload, playObj: PlayObject): PlayObject {
        if (submitObj.payload.length > 0) {
            const respPlay = {
                ...playObj,
            };
            respPlay.data = {
                ...playObj.data,
                album: submitObj.payload[0].track_metadata?.release_name ?? playObj.data.album,
                track: submitObj.payload[0].track_metadata?.track_name ?? playObj.data.album,
            };
            return respPlay;
        }
        return playObj;
    }

    static formatPlayObj(obj: any, options: FormatPlayObjectOptions): PlayObject {
        return rockskyScrobbleToPlay(obj);
    }
}

interface UserScrobbleResponse {
    scrobbles: RockskyScrobble[]
}

export const rockskyScrobbleToPlay = (obj: RockskyScrobble): PlayObject => {
    const play: PlayObject = {
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

    return play;
}