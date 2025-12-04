import dayjs from "dayjs";
import request, { Request, Response } from 'superagent';
import { PlayObject, URLData } from "../../../../core/Atomic.js";
import { buildTrackString, nonEmptyStringOrDefault } from "../../../../core/StringUtils.js";
import { UpstreamError } from "../../errors/UpstreamError.js";
import { AbstractApiOptions, DEFAULT_RETRY_MULTIPLIER, FormatPlayObjectOptions, MUSICBRAINZ_URL, MusicbrainzApiConfigData } from "../../infrastructure/Atomic.js";
import AbstractApiClient from "../AbstractApiClient.js";
import { isPortReachableConnect, joinedUrl, normalizeWebAddress } from '../../../utils/NetworkUtils.js';
import { MusicBrainzApi, IRecording, ISearchResult, IRecordingList, ISearchQuery, IRecordingMatch, IRelease } from 'musicbrainz-api';
import { difference, sleep } from "../../../utils.js";
import {SequentialRoundRobin} from 'round-robin-js';
import { Cacheable } from "cacheable";
import { getRoot } from "../../../ioc.js";
import { hashObject } from "../../../utils/StringUtils.js";
import { playContentInvariantTransform } from "../../../utils/PlayComparisonUtils.js";

export interface SubmitResponse {
    payload?: {
        ignored_listens: number
        submitted_listens: number
    },
    status: string
}

export interface MusicbrainzApiConfig extends MusicbrainzApiConfigData {
    api: MusicBrainzApi
}

export interface MusicbrainzApiClientConfig {
    apis: MusicbrainzApiConfig[]
}

export class MusicbrainzApiClient extends AbstractApiClient {

    declare config: MusicbrainzApiClientConfig;
    protected apis: MusicBrainzApi[];
    protected rrApis: SequentialRoundRobin<MusicBrainzApi>;
    protected url: URLData;
    cache: Cacheable;

    constructor(name: any, config: MusicbrainzApiClientConfig, options: AbstractApiOptions & {cache?: Cacheable}) {
        super('Musicbrainz', name, config, options);
        this.apis = config.apis.map(x => x.api);
        this.rrApis = new SequentialRoundRobin(this.apis);
        this.cache = options.cache ?? getRoot().items.cache().cacheMetadata;

        this.logger.debug(`Round Robin API calls using hosts: ${config.apis.map(x => x.url ?? MUSICBRAINZ_URL).join(' | ')}`);
    }

    callApi = async <T = Response>(func: (mb: MusicBrainzApi) => Promise<any>, options?: { timeout?: number }): Promise<T> => {
        const {
            timeout = 30000
        } = options || {};

        try {
            const res = await Promise.race([
                func(this.rrApis.next().value),
                sleep(timeout)
            ]);
            if (res === undefined) {
                throw new Error('Timeout occurred while waiting for Musicbrainz API rate limit');
            }
            if(`error` in res) {
                throw Error(res.error);
            }
            return res as T;
        } catch (e) {
            if(e.message.includes('Timeout occurred')) {
                throw e;
            }
            throw new UpstreamError('Error occurred in Musicbrainz API', { cause: e });
        }
    }

    searchByRecording = async(play: PlayObject): Promise<IRecordingList | undefined> => {

        const cacheKey = `mb-recSearch-${hashObject(playContentInvariantTransform(play))}`;

        try {
            const cachedTransform = await this.cache.get<IRecordingList>(cacheKey);
            if(cachedTransform !== undefined) {
                this.logger.debug('Cache hit');
                return cachedTransform;
            }
        } catch (e) {
            this.logger.warn(new Error('Could not fetch cache key', {cause: e}));
        }


        this.logger.debug(`Starting search`);
        const res = await this.callApi<IRecordingList>((mb) => {
            const query: Record<string, any> = {
                recording: play.data.track
            };
            if(play.data.artists !== undefined && play.data.artists.length > 0) {
                query.artist = play.data.artists[0];
            }
            if(play.data.album !== undefined) {
                query.release = play.data.album;
            }
            return mb.search('recording', {
                query
            });
        });

        await this.cache.set(cacheKey, res, '1hr');
        return res;
    }

    testConnection = async () => {
        for(const a of this.config.apis) {
            try {
                const u = normalizeWebAddress(a.url);
                await isPortReachableConnect(u.port, { host: u.url.hostname });
            } catch (e) {
                throw new Error('Could not reach API URL endpoint', { cause: e });
            }
            return true;
        }
    }

    static formatPlayObj(obj: any, options: FormatPlayObjectOptions): PlayObject {
        return recordingToPlay(obj);
    }
}

export const recordingToPlay = (data: IRecording, options?: {ignoreVA?: boolean}): PlayObject => {

    const {
        ignoreVA = true,
    } = options || {};

    let album: IRelease;

    let albumArtists: string[];
    let albumArtistIds: string[];
    const artists = (data["artist-credit"] ?? []).map(x => x.name);
    if(data.releases !== undefined && data.releases.length > 0) {
        album = data.releases[0];
        if(album["artist-credit"] !== undefined) {
            if(difference(album["artist-credit"].map(x => x.artist.id), (data["artist-credit"] ?? []).map(x => x.artist.id)).length > 0) {
                albumArtists = album["artist-credit"].map(x => x.artist.name);
                albumArtistIds = album["artist-credit"].map(x => x.artist.id);
            }
            if(albumArtists !== undefined && ignoreVA && albumArtists.includes('Various Artists')) {
                albumArtists = undefined;
                albumArtistIds = undefined;
            }
        }
    }

    const play: PlayObject = {
        data: {
            track: data.title,
            artists,
            album: album !== undefined ? album.title : undefined,
            albumArtists,
            meta: {
                brainz: {
                    track: data.id,
                    artist: data["artist-credit"] !== undefined ? data["artist-credit"].map(x => x.artist.id) : undefined,
                    albumArtist: albumArtistIds,
                    album: album !== undefined ? album.id : undefined,
                    releaseGroup: album !== undefined ? album["release-group"]?.id : undefined
                }
            }
        },
        meta: {
            source: 'musicbrainz',
            trackId: data.id
        }
    }

    return play;
}