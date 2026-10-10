import type { Response } from 'superagent';
import {type Credit, type OptionalCacheUsage, type PlayObject, type PlayObjectMinimal, type TrackData, type URLData} from "../../../../core/Atomic.ts";
import { DEVELOPER_CONTACT } from "../../infrastructure/Atomic.ts";
import { type AbstractApiOptions, type FormatPlayObjectOptions, MUSICBRAINZ_URL, type MusicbrainzApiConfigData } from "../../infrastructure/Atomic.ts";
import AbstractApiClient from "../AbstractApiClient.ts";
import { isPortReachableConnect, maxRequestsPerSecond, normalizeWebAddress } from '../../../utils/NetworkUtils.ts';
import type { MusicBrainzApi, IRecording, IRecordingList, IRelease, IReleaseList, IArtistList } from 'musicbrainz-api';
import { difference } from '../../../../core/DataUtils.ts';
import type { Cacheable } from "cacheable";
import { getRootCommon } from "../../../iocCommon.ts";
import { hashObject } from "../../../utils/StringUtils.ts";
import { playContentCacheHash } from "../../../utils/PlayComparisonUtils.ts";
import { creditIds, creditIsrc, creditMbid, isrcMeta, mbMeta } from "../../../../core/MusicMetadata.ts";
import { AsyncLocalStorage } from "async_hooks";
import { nanoid } from "nanoid";
import { stripIndents } from "common-tags";
import { SimpleError } from '../../errors/MSErrors.ts';
import { baseFormatPlayObj } from '../../../utils/PlayTransformUtils.ts';
import { creditToName, nameToCredit, creditsToNames } from "../../../../core/MusicMetadata.ts";
import { isrcNoHyphens } from '../../../../core/PlayUtils.ts';
import {ProxyWithCircuitBreaker, type CircuitBreakerProxy} from '@foxxmd/load-balancer-proxy';
import {ConsecutiveBreaker} from 'cockatiel';
import { MusicbrainzApiWrapped } from './MusicbrainzApi.ts';
import { formatNumber } from '../../../../core/DataUtils.ts';
import { buildFreetextQuery, buildLuceneQuery, cleanLuceneFields } from './LuceneUtils.ts';
import type { ArtistSearchQueryOpts, ReleaseSearchQueryOpts, TrackSearchQueryOpts, IRecordingMSList } from './MusicbrainzTypes.ts';
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
    protected url!: URLData;
    cache: Cacheable;
    protected asyncStore: AsyncLocalStorage<string | undefined>;

    constructor(name: any, config: MusicbrainzApiClientConfig, options: AbstractApiOptions & {cache?: Cacheable, logUrl?: boolean, reqQueueDuration?: number}) {
        super('Musicbrainz', name, config, options);

        this.asyncStore = new AsyncLocalStorage();
        this.cache = options.cache ?? getRootCommon().cache().cacheApi;
        const mbMap = getRootCommon().mbMap();
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
                    appVersion: getRootCommon().version,
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
            onFailure: ({reason, duration}: any) => {
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
            const cachedTransform = useCachedResult && cacheKey !== undefined ? await this.cache.get<T>(cacheKey) : undefined;
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

    searchByRecording = async(play: PlayObject, options?: SearchOptions & OptionalCacheUsage): Promise<IRecordingMSList> => {

        const {
            escapeCharacters = true,
            removeCharacters = false,
            using = ['album','artist','title'],
            freetext,
            useCachedResult
        } = options || {};

        const cacheKey = `mb-recSearch-${hashObject({play: playContentCacheHash(play), using})}`;

        this.logger.debug(`Starting search`);
        let q = '';
        // https://github.com/Borewit/musicbrainz-api?tab=readme-ov-file#search-function
        // https://wiki.musicbrainz.org/MusicBrainz_API/Search#Recording
        // https://beta.musicbrainz.org/doc/MusicBrainz_API/Search
        const res = await this.callApiPool<IRecordingList>((mb) => {
            const query: TrackSearchQueryOpts = {
            };

            const recordingMbid = creditMbid(play.data.track, 'recording'),
                trackMbid = creditMbid(play.data.track, 'track'),
                releaseMbid = creditMbid(play.data.album, 'release'),
                artistMbids = creditIds(play.data.artists, 'musicbrainz', 'artist');
            // output order of fields in the query string follows the order they are added here
            if(using.includes('title')) {
                query.recording = creditToName(play.data.track);
            }
            if(play.data.artists !== undefined && play.data.artists.length > 0 && using.includes('artist')) {
                query.artist = creditsToNames(play.data.artists);
            }
            if(play.data.album !== undefined && using.includes('album')) {
                query.release = creditToName(play.data.album);
            }
            const isrc = creditIsrc(play.data.track);
            if(isrc !== undefined && using.includes('isrc')) {
                query.isrc = isrcNoHyphens(isrc);
            }
            if(recordingMbid !== undefined && using.includes('mbidrecording')) {
                query.rid = recordingMbid;
            }
            if(trackMbid !== undefined && using.includes('mbidtrack')) {
                query.tid = trackMbid;
            }
            if(artistMbids.length > 0 && using.includes('mbidartist')) {
                query.arid = artistMbids;
            }
            if(releaseMbid !== undefined && using.includes('mbidrelease')) {
                query.reid = releaseMbid;
            }

            // only names are cleaned, MBIDs and ISRC are used verbatim
            const nameFields: (keyof TrackSearchQueryOpts)[] = ['recording', 'artist', 'release'];
            const cleaned = cleanLuceneFields(query, nameFields, {escapeCharacters, removeCharacters});
            q = freetext ? buildFreetextQuery(cleaned, nameFields) : buildLuceneQuery(cleaned, {preferAll: ['artist', 'arid']});

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

    searchByRelease = async(data: Pick<TrackData, 'album'> & Partial<Pick<TrackData, 'artists'>>, options?: SearchOptions & OptionalCacheUsage): Promise<IReleaseList> => {

        const {
            escapeCharacters = true,
            removeCharacters = false,
            using = ['album','artist'],
            freetext,
            useCachedResult
        } = options || {};

        const cacheKey = `mb-releaseSearch-${hashObject({play: hashObject(data), using})}`;

        this.logger.debug(`Starting search`);
        let q = '';
        // https://github.com/Borewit/musicbrainz-api?tab=readme-ov-file#search-function
        // https://wiki.musicbrainz.org/MusicBrainz_API/Search#Search_Fields_11
        // https://beta.musicbrainz.org/doc/MusicBrainz_API/Search
        const res = await this.callApiPool<IReleaseList>((mb) => {
            const query: ReleaseSearchQueryOpts = {
            };

            const releaseMbid = creditMbid(data.album, 'release'),
                releaseGroupMbid = creditMbid(data.album, 'release-group');
            // output order of fields in the query string follows the order they are added here
            if(data.album !== undefined && using.includes('album')) {
                query.release = creditToName(data.album);
            }
            if(data.artists !== undefined && data.artists.length > 0 && using.includes('artist')) {
                query.artistname = creditsToNames(data.artists);
            }
            if(using.includes('mbidrelease')) {
                if(releaseMbid !== undefined) {
                    query.reid = [releaseMbid];
                }
                query.rgid = releaseGroupMbid;
            }

            // only names are cleaned, MBIDs are used verbatim
            const nameFields: (keyof ReleaseSearchQueryOpts)[] = ['release', 'artistname'];
            const cleaned = cleanLuceneFields(query, nameFields, {escapeCharacters, removeCharacters});
            q = freetext ? buildFreetextQuery(cleaned, nameFields) : buildLuceneQuery(cleaned, {preferAll: ['artistname']});

            this.logger.debug(`Search Query => ${q}`);
            this.cache.set(`${cacheKey}-qs`, q);

            return mb.search('release', {
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

        if(res.releases === undefined) {
            this.logger.debug(res);
            await this.cache.delete(cacheKey);
            throw new Error('results returned but no releases list in response data, something handled incorrectly?');
        }

        return res;
    }

    searchByArtist = async(data: Pick<TrackData, 'artists'>, options?: SearchOptions & OptionalCacheUsage): Promise<IArtistList> => {
        const {
            escapeCharacters = true,
            removeCharacters = false,
            freetext,
            useCachedResult
        } = options || {};

        const cacheKey = `mb-artistSearch-${hashObject({play: hashObject(data)})}`;

        this.logger.debug(`Starting search`);
        let q = '';
        // https://github.com/Borewit/musicbrainz-api?tab=readme-ov-file#search-function
        // https://wiki.musicbrainz.org/MusicBrainz_API/Search#Search_Fields_3
        // https://beta.musicbrainz.org/doc/MusicBrainz_API/Search
        const res = await this.callApiPool<IArtistList>((mb) => {
            const query: ArtistSearchQueryOpts = {
            };

            const artistMbids = creditIds(data.artists, 'musicbrainz', 'artist');
            // output order of fields in the query string follows the order they are added here
            if(data.artists !== undefined && data.artists.length > 0) {
                const artistNames = (creditsToNames(data.artists) ?? []).filter(x => x.trim() !== '');
                if(artistNames.length > 0) {
                    query.artist = artistNames;
                    query.primary_alias = query.artist;
                }

            }
            if(artistMbids.length > 0) {
                query.arid = artistMbids;
            }

            // only names are cleaned, MBIDs are used verbatim
            const cleaned = cleanLuceneFields(query, ['artist', 'primary_alias'], {escapeCharacters, removeCharacters});
            // each result is a single artist so fields are OR'd, a result only needs to match one of the given artists
            q = freetext ? buildFreetextQuery(cleaned, ['artist']) : buildLuceneQuery(cleaned, {operator: 'OR'});

            this.logger.debug(`Search Query => ${q}`);
            this.cache.set(`${cacheKey}-qs`, q);

            return mb.search('artist', {
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

        if(res.artists === undefined) {
            this.logger.debug(res);
            await this.cache.delete(cacheKey);
            throw new Error('results returned but no artists list in response data, something handled incorrectly?');
        }

        return res;
    }

    testConnection = async () => {
        for(const a of this.config.apis) {
            try {
                const u = normalizeWebAddress(a.url ?? MUSICBRAINZ_URL);
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

    let album: IRelease | undefined;

    let albumArtists: Credit[] | undefined;
    const artists = (data["artist-credit"] ?? []).map(x => nameToCredit(x.name, mbMeta(x.artist.id, 'artist')));
    if(data.releases !== undefined && data.releases.length > 0) {
        album = data.releases[0];
        if(album["artist-credit"] !== undefined) {
            if(difference(album["artist-credit"].map(x => x.artist.id), (data["artist-credit"] ?? []).map(x => x.artist.id)).length > 0) {
                albumArtists = album["artist-credit"].map(x => nameToCredit(x.artist.name, mbMeta(x.artist.id, 'artist')));
            }
            if(albumArtists !== undefined && ignoreVA && creditsToNames(albumArtists).includes('Various Artists')) {
                albumArtists = undefined;
            }
        }
    }

    const play: PlayObjectMinimal = {
        data: {
            track: nameToCredit(data.title, mbMeta(data.id, 'recording'), isrcMeta(data.isrcs !== undefined && data.isrcs.length > 0 ? data.isrcs[0] : undefined)),
            artists,
            album: nameToCredit(album?.title, mbMeta(album?.id, 'release'), mbMeta(album?.["release-group"]?.id, 'release-group')),
            albumArtists,
            // recording length is in milliseconds
            duration: data.length !== undefined ? Math.round(data.length / 1000) : undefined,
        },
        meta: {
            source: 'musicbrainz',
            trackId: data.id
        }
    }

    return baseFormatPlayObj(data, play);
}
