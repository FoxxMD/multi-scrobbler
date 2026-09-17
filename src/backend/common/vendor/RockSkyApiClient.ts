import dayjs from "dayjs";
import type { Request, Response } from 'superagent';
import request from 'superagent';
import type {ArtistCredit, PlayObject, PlayObjectMinimal, ScrobbleActionResult, URLData} from "../../../core/Atomic.ts";
import { artistCreditsToNames, artistNamesToCredits, nonEmptyStringOrDefault } from "../../../core/StringUtils.ts";
import { UpstreamError } from "../errors/UpstreamError.ts";
import type {AbstractApiOptions, FormatPlayObjectOptions} from "../infrastructure/Atomic.ts";
import type {RockSkyClientData, RockSkyData, RockSkyOptions} from "../infrastructure/config/client/rocksky.ts";
import AbstractApiClient from "./AbstractApiClient.ts";
import { isPortReachableConnect, joinedUrl, normalizeWebAddress } from '../../utils/NetworkUtils.ts';
import type {ListenResponse, ListenType, SubmitPayload} from '../../../core/vendor/listenbrainz/interfaces.ts';
import { playToListenPayload } from './listenbrainz/lzUtils.ts';
import type {RockskyScrobble} from './rocksky/interfaces.ts';
import type {Handle} from "@atcute/lexicons";
import { getATProtoIdentifier, identifierToAtProtoHandle } from './atproto/atUtils.ts';
import { baseFormatPlayObj } from "../../utils/PlayTransformUtils.ts";
import { AuthError, ScrobbleSubmitError } from "../errors/MSErrors.ts";
import { tryApiCall } from "../../utils/RequestUtils.ts";
import { type CreateScrobbleInput, RockskyClient, Agent, type SongViewDetailed, type ScrobbleInput } from "@rocksky/sdk";
import { getRoot } from "../../ioc.ts";
import type { MSCache } from "../Cache.ts";
import type {HandleData} from "../infrastructure/config/client/atproto.ts";
import { parseRegexSingle } from "@foxxmd/regex-buddy-core";
import { removeUndefinedKeys } from "../../../core/DataUtils.ts";
import { isrcNoHyphens } from '../../../core/PlayUtils.ts';
import { findCauseByFunc } from "../../utils/ErrorUtils.ts";
import { isSuperAgentResponseError } from "../errors/ErrorUtils.ts";
import { hashObject } from "../../utils/StringUtils.ts";
import { stringSameness } from "@foxxmd/string-sameness";
import clone from "clone";

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
    rsAgent?: Agent;

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

        this.rsClient = new RockskyClient(token);
    }

    isLzMode = () => this.config.key !== undefined && this.config.token === undefined && this.rsAgent === undefined;

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
        this.userData = await getATProtoIdentifier({identifier: this.handle, did: this.config.did }, { logger: this.logger, cache: this.cache.cacheAuth });

        // authed write operations straight through PDS using xrpc
        if(this.userData !== undefined && this.config.appPassword !== undefined) {
            try {
                this.rsAgent = await Agent.login(this.userData.did, this.config.appPassword);
            } catch (e) {
                throw new AuthError('Could not login using handle/did and appPassword', {cause: e});
            }
        }

        // no agent and no rs client token
        if(this.isLzMode()) {
            try {
                const resp = await this.callLZApi(() => request.get(`${joinedUrl(this.lzUrl.url,'1/validate-token')}`));
                return true;
            } catch (e) {
                const cause = findCauseByFunc<request.ResponseError>(e, (ee) => isSuperAgentResponseError(ee));
                throw new AuthError('Failed to validate token for listenbrainz mode', {cause: e, unrecoverable: cause !== undefined && [401,403].includes(cause.status)});
            }
        }

        // if no lz key and no xrpc client then we need to test if the token for the rs client is valid
        // so we can use the client for write operations later
        if(this.rsAgent === undefined) {
            try {
                await this.rsClient.apikeys()
                // const req = request.get('https://api.rocksky.app/profile').set('Authorization', `Bearer ${this.config.token}`);
                // await req;
                return true;
            } catch (e) {
                const upstreamErr = new UpstreamError('Failed to get apikeys() to test auth validity of token', {cause: e});
                const cause = findCauseByFunc<request.ResponseError>(e, (ee) => isSuperAgentResponseError(ee));
                throw new AuthError('Failed to get /profile with given token', {cause: upstreamErr, unrecoverable: cause !== undefined && [401,403].includes(cause.status)});
            }
        }
    }

    getUserListens = async (maxTracks: number, user?: string): Promise<RockskyScrobble[]> => {
        try {

            const res = this.rsClient.scrobbles(user ?? this.userData.did ?? this.userData.handle, maxTracks, 0);
            // const res = await this.rsClient.actor.getActorScrobbles({
            //     limit: maxTracks,
            //     offset: 0,
            //     did: this.userData.did
            // });
            return res;
        } catch (e) {
            throw e;
        }
    }

    getRecentlyPlayed = async (maxTracks: number, user?: string): Promise<PlayObject[]> => {
        try {
            const resp = await this.getUserListens(maxTracks, user);
            return resp.map(x => rockskyScrobbleToPlay(x));
        } catch (e) {
            this.logger.error(`Error encountered while getting User listens | Error =>  ${e.message}`);
            return [];
        }
    }

    submitListen = async (play: PlayObject, options: SubmitOptions & {force?: boolean} = {}): Promise<ScrobbleActionResult> => {
        const { log = false, listenType = 'single', force = false} = options;

        const warnings: string[] = [];

        /**
         * First two paths are asynchronous, server-side validation of scrobbles
         * we don't recieve any real feedback about whether the scrobbles were accepted
         */
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
        }

        if(this.rsAgent === undefined) {
            const payload = removeUndefinedKeys(playToRockskyClientRecord(play));
            if(log) {
                this.logger.debug(`Submit Payload: ${JSON.stringify(payload)}`);
            }
            const resp = await this.rsClient.createScrobble(payload);
            return {payload, response: resp, createdAt: dayjs().toISOString()}
        }

        /**
         * Client writes directly to PDS and is responsible for validating scrobbles
         * We get immediate feedback since we do all the work
         */

        const missing = missingScrobbleFields(play);
        if(missing.length > 0) {
            throw new ScrobbleSubmitError(`Will not submit scrobble because required fields are missing from data: ${missing.join(', ')}`, {payload: playToRockskyClientRecord(play)});
        }

        const confidenceFields = hasScrobbleConfidenceFields(play);
        if(confidenceFields.length === 0) {
            if(force) {
                warnings.push('Scrobble data is missing all confidence fields (isrc, mbid, spotifyId) but user forced scrobble.');
            }
            throw new ScrobbleSubmitError(`Will not submit scrobble because no confidence fields were found (isrc, mbid, spotifyId). Retry/force scrobble if you are sure it is correct.`, {payload: playToRockskyClientRecord(play)});
        }

        const payload = playToRockskyAgentRecord(play);
        let merged: PlayObject;
        try {
            const res = await this.rsAgent.scrobble(payload);
            const uData = rockskyUriToData(res);
            if(uData !== undefined) {
                merged = clone(play);
                merged.meta.url = {
                    ...(merged.meta.url ?? {}),
                    web: uData.web
                };
                if(merged.meta.playId === undefined) {
                    merged.meta.playId = uData.playId;
                }
                if(merged.meta.user === undefined) {
                    merged.meta.user = uData.user;
                }
            }
            return removeUndefinedKeys({payload, response: res, mergedScrobble: merged, createdAt: dayjs().toISOString()});
        } catch (e) {
            throw new ScrobbleSubmitError(`Error occurred while writing scrobble to PDS`, {cause: e, payload: payload});
        }
    }

    getRockskySongMatch = async (play: PlayObject): Promise<SongViewDetailed> => {
        const input = playToMatchSongInput(play);
        const inputHash = hashObject(removeUndefinedKeys(input));
        const cacheKey = `rsMatchSong-${inputHash}`;
        let songDetailed: SongViewDetailed = await this.cache.cacheApi.get<SongViewDetailed>(cacheKey);
        if(songDetailed === undefined) {
            try {
                songDetailed = await this.rsClient.matchSong(input.title, input.artist, input.mbId, input.isrc, input.album);
                await this.cache.cacheApi.set(cacheKey, songDetailed);
            } catch (e) {
                throw new UpstreamError('Unable to match Play input with Rocksky song', {cause: e});
            }
        }

        return songDetailed;
    }

    static formatPlayObj(obj: any, options: FormatPlayObjectOptions): PlayObject {
        return rockskyScrobbleToPlay(obj);
    }
}

interface RsMatchSongInput {
    title: string,
    artist: string,
    mbId?: string
    isrc?: string
    album?: string
}

export const missingScrobbleFields = (play: PlayObject): string[] => {
    const missing: string[] = [];

    if(play.data.track === undefined || play.data.track.trim() === '') {
        missing.push('track');
    }
    if(play.data.artists === undefined || play.data.artists.length === 0) {
        missing.push('artists');
    }
    if(play.data.album === undefined || play.data.album.trim() === '') {
        missing.push('album');
    }
    return missing;
}

export const hasScrobbleConfidenceFields = (play: PlayObject): string[] => {
    const found: string[] = [];

    if(play.data.isrc) {
        found.push('isrc');
    }
    if(play.data.meta?.brainz?.recording) {
        found.push('mbid');
    }
    if(play.data.meta?.spotify?.track) {
        found.push('spotify');
    }
    return found;
}

const playToMatchSongInput = (play: PlayObject): RsMatchSongInput => ({
        title: play.data.track,
        artist: play.data.artists.map(x => x.name).join(', '),
        mbId: play.data.meta?.brainz?.track ?? play.data.meta?.brainz?.recording,
        isrc: play.data.isrc,
        album: play.data.album
})

const mergeSongViewWithPlay = (song: SongViewDetailed, play: PlayObject): PlayObject => {
    const svPlay = songViewToPlay(song);

    const mergedPlay: PlayObject = {
        data: {
            track: svPlay.data.track ?? play.data.track,
            album: svPlay.data.album ?? play.data.album,
            duration: svPlay.data.duration ?? play.data.duration,
            isrc: svPlay.data.isrc ?? play.data.isrc
        },
        meta: {...play.meta}
    };
    if(song.mbid !== undefined) {
        const {
            brainz,
            ...rest
        } = play.data.meta ?? {};
        mergedPlay.data.meta = {
           ...rest,
           brainz: {
            recording: song.mbid
           }
        }
    } else {
        mergedPlay.data.meta = {...play.data.meta};
    }

    return mergedPlay;
}

const songViewToPlay = (song: SongViewDetailed): PlayObject => {

    let artists: ArtistCredit[] = [],
    albumArtists: ArtistCredit[];
    if(song.artists !== undefined && song.artists.length > 0) {
        artists = song.artists.map(x => ({name: x.name}))
    } else if(song.artist !== undefined) {
        artists = [{name: song.artist}];
    }

    if(song.albumArtist !== undefined) {
        if(song.albumArtist === song.artist || stringSameness(song.albumArtist, artists.map(x => x.name).join(',')).highScore > 90) {
            albumArtists = artists;
        } else {
            albumArtists = [{name: song.albumArtist}]
        }
    } else {
        albumArtists = artists;
    }

    const play: PlayObject = {
        data: {
            track: song.title,
            artists,
            albumArtists,
            album: song.album !== '' ? song.album : undefined,
            duration: song.duration !== 0 ? song.duration / 1000 : undefined,
            isrc: song.isrc
        },
        meta: {
            trackId: song.id,
            source: 'Rocksky',
            url: {
                web: song.uri
            }
        }
    };
    if(song.mbid !== undefined) {
        play.data.meta = {
            brainz: {
                recording: song.mbid
            }
        }
    }

    return play;
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
            albumArtists: artistNamesToCredits(nonEmptyStringOrDefault(obj.albumArtist) ? [obj.albumArtist] : []),
            album: nonEmptyStringOrDefault(obj.album),
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
        const uData = rockskyUriToData( obj.uri);
        if(uData !== undefined) {
            if(web === undefined) {
                play.meta.url = {
                    web: uData.web
                }
            }
            if(playId === undefined) {
                play.meta.playId = uData.playId;
            }
            if(user === undefined) {
                play.meta.user = uData.user;
            }
        }
    }

    return baseFormatPlayObj(obj, play);
}

// TODO remove once albumArtist is correctly included in CreateScrobbleInput interface
type RealCreateScrobbleInput = CreateScrobbleInput & {albumArtist: string};

export const playToRockskyClientRecord = (play: PlayObject): RealCreateScrobbleInput => {
    const artistStr = artistCreditsToNames(play.data.artists).join(', ');

    const csi: RealCreateScrobbleInput = {
        title: play.data.track,
        artist: artistStr,
        // albumArtist is a required field on rocksky server-side
        // tsiry's advice is that if there really is no album artists then just use the same value as artist
        albumArtist: (play.data.albumArtists ?? []).length === 0 ? artistStr : artistCreditsToNames(play.data.albumArtists).join(', '),
        album: play.data.album,
        mbId: play.data.meta?.brainz?.recording,
        isrc: play.data.isrc !== undefined ? isrcNoHyphens(play.data.isrc) : undefined,
        duration: play.data.duration !== undefined ? play.data.duration * 1000 : 0,
        spotifyLink: play.meta.source === 'spotify' && play.meta.url?.web !== undefined ? play.meta.url?.web : undefined,
        timestamp: play.data.playDate.unix()
    }
    return csi;
}

export const playToRockskyAgentRecord = (play: PlayObject): ScrobbleInput => {
    const artistStr = artistCreditsToNames(play.data.artists).join(', ');

    const csi: ScrobbleInput = {
        title: play.data.track,
        artist: artistStr,
        // albumArtist is a required field on rocksky server-side
        // tsiry's advice is that if there really is no album artists then just use the same value as artist
        albumArtist: (play.data.albumArtists ?? []).length === 0 ? artistStr : artistCreditsToNames(play.data.albumArtists).join(', '),
        album: play.data.album,
        mbid: play.data.meta?.brainz?.recording,
        isrc: play.data.isrc !== undefined ? isrcNoHyphens(play.data.isrc) : undefined,
        duration: play.data.duration !== undefined ? play.data.duration * 1000 : 0,
        spotifyLink: play.meta.source === 'spotify' && play.meta.url?.web !== undefined ? play.meta.url?.web : undefined,
        createdAt: play.data.playDate.toISOString()
    }
    return csi;
}

const ATPROTO_URI_REGEX = new RegExp(/at:\/\/(?<resource>(?<did>did.*?)\/app\.rocksky\.scrobble\/(?<tid>.*))/);

const rockskyUriToData = (str: string): { web?: string, playId?: string, user?: string } | undefined => {
    const uriRes = parseRegexSingle(ATPROTO_URI_REGEX, str);
    if (uriRes !== undefined) {
        return {
            web: `https://atproto.at/viewer?uri=${uriRes.named.resource}`,
            playId: uriRes.named.tid,
            user: uriRes.named.did
        }
    }
    return undefined;
}