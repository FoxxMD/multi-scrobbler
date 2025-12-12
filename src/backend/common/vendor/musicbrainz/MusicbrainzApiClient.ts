import { Response } from 'superagent';
import { PlayObject, URLData } from "../../../../core/Atomic.js";
import { UpstreamError } from "../../errors/UpstreamError.js";
import { AbstractApiOptions, FormatPlayObjectOptions, MUSICBRAINZ_URL, MusicbrainzApiConfigData } from "../../infrastructure/Atomic.js";
import AbstractApiClient from "../AbstractApiClient.js";
import { isPortReachableConnect, normalizeWebAddress } from '../../../utils/NetworkUtils.js';
import { MusicBrainzApi, IRecording, IRecordingList, IRelease } from 'musicbrainz-api';
import { difference, isDebugMode, sleep } from "../../../utils.js";
import {SequentialRoundRobin} from 'round-robin-js';
import { Cacheable } from "cacheable";
import { getRoot, version } from "../../../ioc.js";
import { hashObject } from "../../../utils/StringUtils.js";
import { playContentInvariantTransform } from "../../../utils/PlayComparisonUtils.js";
import { childLogger } from "@foxxmd/logging";;
import { AsyncLocalStorage } from "async_hooks";
import { nanoid } from "nanoid";
import { stripIndents } from "common-tags";
import { getNodeNetworkException, hasNodeNetworkException, isNodeNetworkException } from '../../errors/NodeErrors.js';
import { SimpleError } from '../../errors/MSErrors.js';

export interface SubmitResponse {
    payload?: {
        ignored_listens: number
        submitted_listens: number
    },
    status: string
}

export interface MusicbrainzApiConfig extends MusicbrainzApiConfigData {
    api: MusicBrainzApi,
    hostname: string
}

export interface MusicbrainzApiClientConfig {
    apis: MusicbrainzApiConfigData[]
}

export interface SearchOptions {
    escapeCharacters?: boolean
    removeCharacters?: boolean,
    using?: ('artist' | 'album' | 'title')[]
    ttl?: string,
    freetext?: boolean
}

export class MusicbrainzApiClient extends AbstractApiClient {

    declare config: MusicbrainzApiClientConfig;
    protected rrApis: SequentialRoundRobin<MusicbrainzApiConfig>;
    protected url: URLData;
    cache: Cacheable;
    protected asyncStore: AsyncLocalStorage<string>;

    constructor(name: any, config: MusicbrainzApiClientConfig, options: AbstractApiOptions & {cache?: Cacheable, logUrl?: boolean}) {
        super('Musicbrainz', name, config, options);

        this.asyncStore = new AsyncLocalStorage();
        this.cache = options.cache ?? getRoot().items.cache().cacheMetadata;
        const mbMap = getRoot().items.mbMap();
        const mbApis: Record<string, MusicbrainzApiConfig> = {};
        for(const mbConfig of this.config.apis) {
            const u = normalizeWebAddress(mbConfig.url ?? MUSICBRAINZ_URL);
            let mb = mbMap.get(u.url.hostname);
            if(mb === undefined) {
                const api = new MusicBrainzApi({
                    appName: 'multi-scrobbler',
                    appVersion: version,
                    appContactInfo: mbConfig.contact,
                    baseUrl: u.url.toString(),
                    rateLimit: mbConfig.rateLimit ?? [1,1],
                    preRequest: options.logUrl === true || isDebugMode() ? (method, url, headers) => {
                        const cacheKey = this.asyncStore.getStore() ?? nanoid();
                        this.cache.set(`${cacheKey}-url`, `${method} - ${url}`, mbConfig.ttl ?? '1hr');
                        if(mbConfig.apiKey !== undefined) {
                            headers.set('X-Api_key', mbConfig.apiKey);
                        }
                        return [method, url, headers];
                    } : undefined,
                    requestTimeout: mbConfig.requestTimeout ?? 6000,
                    retryLimit: 2
                });
                mbApis[u.url.hostname] = {api, ...mbConfig, hostname: u.url.hostname};
                mbMap.set(u.url.hostname, api);
                mb = api;
            } else if(mbApis[u.url.hostname] === undefined) {
                mbApis[u.url.hostname] = {api: mb, ...mbConfig, hostname: u.url.hostname};
            }
        }

        this.rrApis = new SequentialRoundRobin(Object.values(mbApis));
        this.logger.debug(`Round Robin API calls using hosts: ${config.apis.map(x => x.url ?? MUSICBRAINZ_URL).join(' | ')}`);
    }

    protected getIdentifier(): string {
        return 'API';
    }

    callApi = async <T = Response>(func: (mb: MusicBrainzApi) => Promise<any>, options?: { timeout?: number, ttl?: string, cacheKey?: string }): Promise<T> => {

        let apiConfig = this.rrApis.next().value;

        const {
            timeout = 30000,
            ttl = apiConfig.ttl ?? '1hr',
            cacheKey
        } = options || {};

        try {
            const cachedTransform = await this.cache.get<T>(cacheKey);
            if(cachedTransform !== undefined) {
                const cacheUrl = await this.cache.get<string>(`${cacheKey}-url`);
                const cacheQs = await this.cache.get<string>(`${cacheKey}-qs`);
                this.logger.debug(stripIndents`Cache hit =>
                    Query String: ${cacheQs}
                    URL: ${cacheUrl}`);

                return cachedTransform;
            }
        } catch (e) {
            this.logger.warn(new Error('Could not fetch cache keys', {cause: e}));
        }

        const triedHosts: string[] = [];
        while(!triedHosts.includes(apiConfig.hostname)) {

            try {
                const res = await this.callApiEndpoint(apiConfig.api, func, options);
                if(cacheKey !== undefined) {
                    await this.cache.set(cacheKey, res, ttl);
                }
                return res as T;
            } catch (e) {
                if(this.rrApis.count() > 1) {
                    this.logger.warn(`Error occurred for ${apiConfig.hostname}, will try next host`);
                    this.logger.warn(e);
                } else {
                    throw e;
                }
            } finally {
                const cacheUrl = await this.cache.get<string>(`${cacheKey}-url`);
                const debugUrlData = [];
                if(cacheUrl !== undefined) {
                    debugUrlData.push(`URL: ${cacheUrl}`);
                }
                if(debugUrlData.length > 0) {
                    this.logger.debug({labels: ['Call Info']}, `\n${debugUrlData.join('\n')}`);
                }
            }

            triedHosts.push(apiConfig.hostname);
            apiConfig = this.rrApis.next().value;
        }

        if(triedHosts.length > 1) {
            throw new Error('All hosts failed to return a response');
        }
    }

    protected callApiEndpoint = async<T = Response>(mbApi: MusicBrainzApi, func: (mb: MusicBrainzApi) => Promise<any>, options?: { timeout?: number, cacheKey?: string }): Promise<T> => {
        const {
            timeout = 30000,
            cacheKey
        } = options || {};

        try {
            const res = await this.asyncStore.run(cacheKey, async () => {
                return await Promise.race([
                    func(mbApi),
                    sleep(timeout)
                ]);
            });
            if (res === undefined) {
                throw new SimpleError('Timeout occurred while waiting for Musicbrainz API rate limit');
            }
            if(`error` in res) {
                throw Error(res.error);
            }
            return res as T;
        } catch (e) {
            if(e instanceof SimpleError) {
                throw e;
            }
            if(e.name === 'TimeoutError') {
                throw new UpstreamError('Network error: timeout triggered while waiting for response from API',{cause: e, showStopper: true});
            }
            if(hasNodeNetworkException(e)) {
                throw new UpstreamError('Network error occurred', {cause: e, showStopper: true})
            }
            throw new UpstreamError('Error occurred in Musicbrainz API', { cause: e, showStopper: false });
        }
    }

    searchByRecording = async(play: PlayObject, options?: SearchOptions): Promise<IRecordingList | undefined> => {

        const {
            escapeCharacters = true,
            removeCharacters = false,
            using = ['album','artist','title'],
            ttl,
            freetext
        } = options || {};

        const cacheKey = `mb-recSearch-${hashObject({...playContentInvariantTransform(play), using})}`;

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
                query.artist = play.data.artists;
            }
            if(play.data.album !== undefined && using.includes('album')) {
                query.release = play.data.album;
            }
            if(escapeCharacters) {
                for(const [k,v] of Object.entries(query)) {
                    query[k] = Array.isArray(v) ? v.map(escapeLuceneSpecialChars) : escapeLuceneSpecialChars(v);
                }
            }
            if(removeCharacters) {
                 for(const [k,v] of Object.entries(query)) {
                    query[k] = Array.isArray(v) ? v.map(removeNonWordCharacters) : removeNonWordCharacters(v);
                }
            }

            let q = '';

            if(freetext) {

                q += `${query.recording ?? ''} `;
                if(query.artist !== undefined) {
                    q += `${(Array.isArray(query.artist) ? query.artist : [query.artist]).join(' ')} `;
                }
                q += `${query.release ?? ''}`
                
            } else {
                if(query.recording !== undefined) {
                    q += `recording:"${query.recording}"`;
                }
                if(query.artist !== undefined) {
                    if(q !== '') {
                        q += ' AND ';
                    }
                    if(Array.isArray(query.artist) && query.artist.length > 1) {
                        q += `(artist:(${query.artist.map(x => `"${x}"`).join(' AND ')}) OR artist:(${query.artist.map(x => `"${x}"`).join(' OR ')}))`
                    } else if(query.artist !== undefined) {
                        q += `artist:"${Array.isArray(query.artist) ? query.artist[0] : query.artist}"`;
                    }
                }
                if(query.release !== undefined) {
                    if(q !== '') {
                        q += ' AND ';
                    }
                    q += `release:"${query.release}"`
                }
            }


            this.logger.debug(`Search Query => ${q}`);
            this.cache.set(`${cacheKey}-qs`, q, '1hr');

            return mb.search('recording', {
                query: q
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
            duration: data.length,
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