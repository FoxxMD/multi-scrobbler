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

export interface SearchOptions {
    escapeCharacters?: boolean
    removeCharacters?: boolean,
    using?: ('artist' | 'album' | 'title')[]
    ttl?: string
}

export class MusicbrainzApiClient extends AbstractApiClient {

    declare config: MusicbrainzApiClientConfig;
    protected rrApis: SequentialRoundRobin<MusicbrainzApiConfig>;
    protected url: URLData;
    cache: Cacheable;

    constructor(name: any, config: MusicbrainzApiClientConfig, options: AbstractApiOptions & {cache?: Cacheable}) {
        super('Musicbrainz', name, config, options);
        this.rrApis = new SequentialRoundRobin(this.config.apis);
        this.cache = options.cache ?? getRoot().items.cache().cacheMetadata;

        this.logger.debug(`Round Robin API calls using hosts: ${config.apis.map(x => x.url ?? MUSICBRAINZ_URL).join(' | ')}`);
    }

    callApi = async <T = Response>(func: (mb: MusicBrainzApi) => Promise<any>, options?: { timeout?: number, ttl?: string, cacheKey?: string }): Promise<T> => {

        const apiConfig = this.rrApis.next().value;

        const {
            timeout = 30000,
            ttl = apiConfig.ttl ?? '1hr',
            cacheKey
        } = options || {};

        try {
            const res = await Promise.race([
                func(apiConfig.api),
                sleep(timeout)
            ]);
            if (res === undefined) {
                throw new Error('Timeout occurred while waiting for Musicbrainz API rate limit');
            }
            if(`error` in res) {
                throw Error(res.error);
            }
            if(cacheKey !== undefined) {
                await this.cache.set(cacheKey, res, ttl);
            }
            return res as T;
        } catch (e) {
            if(e.message.includes('Timeout occurred')) {
                throw e;
            }
            throw new UpstreamError('Error occurred in Musicbrainz API', { cause: e });
        }
    }

    searchByRecording = async(play: PlayObject, options?: SearchOptions): Promise<IRecordingList | undefined> => {

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

        const {
            escapeCharacters = true,
            removeCharacters = false,
            using = ['album','artist','title'],
            ttl
        } = options || {};

        this.logger.debug(`Starting search`);
        // https://github.com/Borewit/musicbrainz-api?tab=readme-ov-file#search-function
        // https://wiki.musicbrainz.org/MusicBrainz_API/Search#Recording
        // https://beta.musicbrainz.org/doc/MusicBrainz_API/Search
        const res = await this.callApi<IRecordingList>((mb) => {
            const query: Record<string, any> = {
                };
            
            
            if(using.includes('title')) {
                query.recording = play.data.track;
            }
            if(play.data.artists !== undefined && play.data.artists.length > 0 && using.includes('artist')) {
                query.artist = play.data.artists[0];
            }
            if(play.data.album !== undefined && using.includes('album')) {
                query.release = play.data.album;
            }
            if(escapeCharacters) {
                for(const [k,v] of Object.entries(query)) {
                    query[k] = escapeLuceneSpecialChars(v);
                }
            }
            if(removeCharacters) {
                 for(const [k,v] of Object.entries(query)) {
                    query[k] = removeNonWordCharacters(v);
                }
            }
            return mb.search('recording', {
                query
            });
        }, {
            ttl,
            cacheKey
        });

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


export const LUCENE_SPECIAL_CHARACTER_REGEX: string[] = ['\\','+','-','&&','||','!','(',')','{','}','[',']','^','"','~','*','?',':','/'];
/** 
 * https://lucene.apache.org/core/7_7_2/queryparser/org/apache/lucene/queryparser/classic/package-summary.html#package.description 
 * https://beta.musicbrainz.org/doc/MusicBrainz_API/Search
 * */
export const escapeLuceneSpecialChars = (str: string): string => {
    let cleaned = str;
    for(const char of LUCENE_SPECIAL_CHARACTER_REGEX) {
        cleaned = cleaned.replaceAll(char, `\\$&`);
    }
    return cleaned;
}

const NON_WORD_ADJACENT_BOUNDARY_REGEX: RegExp = new RegExp(/\w([^a-zA-Z\d\s])\w/g);
const NON_WORDWHITESPACE_REGEX: RegExp = new RegExp(/[^a-zA-Z\d\s]/g);
export const removeNonWordCharacters = (str: string): string => {
    // replace any non-alphanumeric, non-whitespace characters that are surrounded by non-whitespace characters
    // with a whitespace EX "My Cool-Fun Title" => "My Cool Fun Title"
    let cleaned = str.replaceAll(NON_WORD_ADJACENT_BOUNDARY_REGEX, ' ');

    // remove any non-alphanumeric, non-whitespace characters
    // with a whitespace EX "My Cool (Title)" => "My Cool Title"
    cleaned = str.replaceAll(NON_WORDWHITESPACE_REGEX, '');
    return cleaned;
}