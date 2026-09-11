import type { Response } from 'superagent';
import {type ArtistCredit, type OptionalCacheUsage, type PlayObject, type PlayObjectMinimal, type URLData} from "../../../../core/Atomic.ts";
import { DEVELOPER_CONTACT } from "../../infrastructure/Atomic.ts";
import { type AbstractApiOptions, type FormatPlayObjectOptions, MUSICBRAINZ_URL, type MusicbrainzApiConfigData } from "../../infrastructure/Atomic.ts";
import AbstractApiClient from "../AbstractApiClient.ts";
import { isPortReachableConnect, maxRequestsPerSecond, normalizeWebAddress } from '../../../utils/NetworkUtils.ts';
import type { MusicBrainzApi, IRecording, IRecordingList, IRelease } from 'musicbrainz-api';
import { difference } from "../../../utils.ts";
import type { Cacheable } from "cacheable";
import { getRoot } from "../../../ioc.ts";
import { hashObject } from "../../../utils/StringUtils.ts";
import { playContentInvariantTransform } from "../../../utils/PlayComparisonUtils.ts";
import { AsyncLocalStorage } from "async_hooks";
import { nanoid } from "nanoid";
import { stripIndents } from "common-tags";
import { SimpleError } from '../../errors/MSErrors.ts';
import { baseFormatPlayObj } from '../../../utils/PlayTransformUtils.ts';
import type {IRecordingMSList} from '../../transforms/MusicbrainzTransformer.ts';
import { artistCreditsToNames } from '../../../../core/StringUtils.ts';
import { isrcNoHyphens } from '../../../../core/PlayUtils.ts';
import {ProxyWithCircuitBreaker, type CircuitBreakerProxy} from '@foxxmd/load-balancer-proxy';
import {ConsecutiveBreaker} from 'cockatiel';
import { MusicbrainzApiWrapped } from './MusicbrainzApi.ts';
import { formatNumber } from '../../../../core/DataUtils.ts';
export interface SubmitResponse {
    payload?: {
        ignored_listens: number
        submitted_listens: number
    },
    status: string
}

export interface MusicbrainzApiClientConfig {
    apis: MusicbrainzApiConfigData[]
}

export type UsingTypes = 'artist' | 'album' | 'title' | 'isrc' | 'mbidrecording' | 'mbidrelease' | 'mbidartist' | 'mbidtrack';

export interface SearchOptions {
    escapeCharacters?: boolean
    removeCharacters?: boolean,
    using?: UsingTypes[]
    freetext?: boolean
}

export class MusicbrainzApiClientPool extends AbstractApiClient {

    declare config: MusicbrainzApiClientConfig;
    protected rrProxy: CircuitBreakerProxy<MusicbrainzApiWrapped>
    protected url: URLData;
    cache: Cacheable;
    protected asyncStore: AsyncLocalStorage<string>;

    constructor(name: any, config: MusicbrainzApiClientConfig, options: AbstractApiOptions & {cache?: Cacheable, logUrl?: boolean, reqQueueDuration?: number}) {
        super('Musicbrainz', name, config, options);

        this.asyncStore = new AsyncLocalStorage();
        this.cache = options.cache ?? getRoot().items.cache().cacheApi;
        const mbMap = getRoot().items.mbMap();
        const apis: MusicbrainzApiWrapped[] = [];
        for(const mbConfig of this.config.apis) {
            if((mbConfig.enable ?? true) === false) {
                this.logger.verbose(`Not using config for ${mbConfig.url ?? MUSICBRAINZ_URL} because it is disabled`);
                continue;
            }
            const {
                rate = {},
                url
            } = mbConfig;
            const u = normalizeWebAddress((url ?? MUSICBRAINZ_URL).toLocaleLowerCase());
            const mb = mbMap.get(u.url.hostname);
            let points: number,
            duration: number;
            if(mb === undefined) {
                switch (u.url.hostname) {
                    case 'musicbrainz.org': {
                        points = rate.requests ?? 1;
                        duration = rate.perTime ?? 1;
                        const reqRate = maxRequestsPerSecond(points, duration);
                        if (reqRate > 1) {
                            this.logger.warn(`Cannot use a rate greater than 1req/s for musicbrainz.org. Reverting to 1req/s | Given: ${formatNumber(reqRate)}req/s`);
                            points = 1;
                            duration = 1;
                        }
                    } break;
                    case 'api.brainzmash.cc': {
                        points = rate.requests ?? 4;
                        duration = rate.perTime ?? 1;
                        const reqRate = maxRequestsPerSecond(points, duration);
                        if (reqRate > 4) {
                            this.logger.warn(`Cannot use a rate greater than 4req/s for brainzmash.cc. Reverting to 4req/s | Given: ${formatNumber(reqRate)}req/s`);
                            points = 4;
                            duration = 1;
                        }
                    } break;
                    default:
                        points = rate.requests ?? 1;
                        duration = rate.perTime ?? 1;
                        break;
                }
                const api = new MusicbrainzApiWrapped({
                    appName: 'multi-scrobbler',
                    appVersion: getRoot().items.version,
                    appContactInfo: mbConfig.contact ?? DEVELOPER_CONTACT,
                    baseUrl: u.url.toString(),
                    preRequest: (method, url, headers) => {
                        const cacheKey = this.asyncStore.getStore() ?? nanoid();
                        this.cache.set(`${cacheKey}-url`, `${method} - ${url}`);
                        // if(mbConfig.apiKey !== undefined) {
                        //     headers.set('X-Api-key', mbConfig.apiKey);
                        // }
                        return [method, url, headers];
                    },
                    rate: {points, duration},
                    hostname: u.url.hostname,
                    asyncStore: this.asyncStore,
                    requestTimeout: mbConfig.requestTimeout ?? 6000,
                    retryLimit: 2,
                    logger: this.logger,
                });
                mbMap.set(u.url.hostname, api);
                apis.push(api);
                this.logger.verbose(`Created Musicbrainz API for ${api.hostname} with Rate Limit ${points}req/${duration}s`);
            } else {
                apis.push(mb);
            }
        }

        this.rrProxy = ProxyWithCircuitBreaker.create<MusicbrainzApiWrapped>(apis,() => ({
            halfOpenAfter: 30000,
            breaker: new ConsecutiveBreaker(3),
            onFailure: ({reason, duration}) => {
                this.logger.warn(new SimpleError(`Error occurred after ${duration}ms, will try next host`, {cause: reason, shortStack: true}));
            },
        }), {
            comparer: async (a, b) => await b.rateLimiterQueue.getTokensRemaining() - await a.rateLimiterQueue.getTokensRemaining()
        })
        this.logger.debug(`Rate limit prioritized API calls using hosts: ${apis.map(x => x.hostname).join(' | ')}`);
    }

    protected getIdentifier(): string {
        return 'API';
    }

    callApiPool = async <T = Response>(func: (mb: MusicBrainzApi) => Promise<any>, options?: { timeout?: number, cacheKey?: string } & OptionalCacheUsage): Promise<T> => {

        const {
            cacheKey,
            useCachedResult = true
        } = options || {};

        try {
            const cachedTransform = useCachedResult ? await this.cache.get<T>(cacheKey) : undefined;
            if (cachedTransform !== undefined) {
                const cacheUrl = await this.cache.get<string>(`${cacheKey}-url`);
                const cacheQs = await this.cache.get<string>(`${cacheKey}-qs`);
                this.logger.debug(stripIndents`Cache hit =>
                    Query String: ${cacheQs}
                    URL: ${cacheUrl}`);

                return cachedTransform;
            }
        } catch (e) {
            this.logger.warn(new Error('Could not fetch cache keys', { cause: e }));
        }

        try {
            const res = await this.rrProxy.callApi(func, options);
            if (cacheKey !== undefined) {
                await this.cache.set(cacheKey, res);
            }
            return res as T;
        } catch (e) {
            throw e;
        } finally {
            const cacheUrl = await this.cache.get<string>(`${cacheKey}-url`);
            const debugUrlData = [];
            if (cacheUrl !== undefined) {
                debugUrlData.push(`URL: ${cacheUrl}`);
            }
            if (debugUrlData.length > 0) {
                this.logger.trace({ labels: ['Call Info'] }, `\n${debugUrlData.join('\n')}`);
            }
        }
    }

    searchByRecording = async(play: PlayObject, options?: SearchOptions & OptionalCacheUsage): Promise<IRecordingMSList | undefined> => {

        const {
            escapeCharacters = true,
            removeCharacters = false,
            using = ['album','artist','title'],
            freetext,
            useCachedResult
        } = options || {};

        const cacheKey = `mb-recSearch-${hashObject({...playContentInvariantTransform(play), using})}`;

        this.logger.debug(`Starting search`);
        let q = '';
        // https://github.com/Borewit/musicbrainz-api?tab=readme-ov-file#search-function
        // https://wiki.musicbrainz.org/MusicBrainz_API/Search#Recording
        // https://beta.musicbrainz.org/doc/MusicBrainz_API/Search
        const res = await this.callApiPool<IRecordingList>((mb) => {
            const query: {
                recording_mbid?: string
                track_mbid?: string
                release_mbid?: string
                artist_mbids?: string[]
                isrc?: string
                recording?: string
                artist?: string[]
                release?: string
            } = {
            };

            if(play.data?.meta?.brainz?.recording !== undefined && using.includes('mbidrecording')) {
                query.recording_mbid = play.data.meta.brainz.recording
            }
            if(play.data?.meta?.brainz?.track !== undefined && using.includes('mbidtrack')) {
                query.track_mbid = play.data.meta.brainz.track
            }
            if(play.data?.meta?.brainz?.album !== undefined && using.includes('mbidrelease')) {
                query.release_mbid = play.data.meta.brainz.album
            }
            if(play.data?.meta?.brainz?.artist !== undefined && play.data?.meta?.brainz?.artist.length > 0 && using.includes('mbidartist')) {
                query.artist_mbids = play.data.meta.brainz.artist
            }
            if(play.data.isrc !== undefined && using.includes('isrc')) {
                query.isrc = isrcNoHyphens(play.data.isrc);
            }
            if(using.includes('title')) {
                query.recording = play.data.track;
            }
            if(play.data.artists !== undefined && play.data.artists.length > 0 && using.includes('artist')) {
                query.artist = artistCreditsToNames(play.data.artists);
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
                if(query.isrc !== undefined) {
                    if(q !== '') {
                        q += ' AND ';
                    }
                    q+= `isrc:${query.isrc}`;
                }
                if(query.recording_mbid !== undefined) {
                    if(q !== '') {
                        q += ' AND ';
                    }
                    q += `rid:"${query.recording_mbid}"`
                }
                if(query.track_mbid !== undefined) {
                    if(q !== '') {
                        q += ' AND ';
                    }
                    q += `tid:"${query.track_mbid}"`
                }
                if(query.artist_mbids !== undefined) {
                    q += `(arid:(${query.artist_mbids.map(x => `"${x}"`).join(' AND ')}) OR arid:(${query.artist_mbids.map(x => `"${x}"`).join(' OR ')}))`
                }
                if(query.release_mbid !== undefined) {
                    if(q !== '') {
                        q += ' AND ';
                    }
                    q += `reid:"${query.release_mbid}"`
                }
            }


            this.logger.debug(`Search Query => ${q}`);
            this.cache.set(`${cacheKey}-qs`, q);

            return mb.search('recording', {
                query: q
            });
        }, {
            cacheKey,
            useCachedResult
        });

        if(res === undefined) {
            await this.cache.delete(cacheKey);
            throw new Error('results were unexpectedly undefined! API should have thrown...');
        }

        if(res.recordings === undefined) {
            this.logger.debug(res);
            await this.cache.delete(cacheKey);
            throw new Error('results returned but no recordings list in response data, something handled incorrectly?');
        }

        (res as IRecordingMSList).requestQuery = `${q}\n${await this.cache.get(`${cacheKey}-url`)}`;

        return res as IRecordingMSList;
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

    let albumArtists: ArtistCredit[];
    let albumArtistIds: string[];
    const artists = (data["artist-credit"] ?? []).map(x => ({ name: x.name, mbid: x.artist.id}));
    if(data.releases !== undefined && data.releases.length > 0) {
        album = data.releases[0];
        if(album["artist-credit"] !== undefined) {
            if(difference(album["artist-credit"].map(x => x.artist.id), (data["artist-credit"] ?? []).map(x => x.artist.id)).length > 0) {
                albumArtists = album["artist-credit"].map(x => ({name: x.artist.name, mbid: x.artist.id}));
                albumArtistIds = album["artist-credit"].map(x => x.artist.id);
            }
            if(albumArtists !== undefined && ignoreVA && albumArtists.map(x => x.name).includes('Various Artists')) {
                albumArtists = undefined;
                albumArtistIds = undefined;
            }
        }
    }

    const play: PlayObjectMinimal = {
        data: {
            track: data.title,
            artists,
            album: album !== undefined ? album.title : undefined,
            albumArtists,
            // recording length is in milliseconds
            duration: data.length !== undefined ? Math.round(data.length / 1000) : undefined,
            isrc: data.isrcs !== undefined && data.isrcs.length > 0 ? data.isrcs[0] : undefined,
            meta: {
                brainz: {
                    recording: data.id,
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

    return baseFormatPlayObj(data, play);
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
    cleaned = cleaned.replaceAll(NON_WORDWHITESPACE_REGEX, '');
    return cleaned;
}
