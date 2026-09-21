import SpotifyWebApi from "spotify-web-api-node";
import { RateLimiterMemory, RateLimiterQueue } from 'rate-limiter-flexible';
import type { Cacheable } from "cacheable";
import type { PlayObject, PlayObjectMinimal } from "../../../../core/Atomic.ts";
import { artistNameToCredit } from "../../../../core/StringUtils.ts";
import { isrcNoHyphens } from "../../../../core/PlayUtils.ts";
import { baseFormatPlayObj } from "../../../utils/PlayTransformUtils.ts";
import { hashObject } from "../../../utils/StringUtils.ts";
import { UpstreamError } from "../../errors/UpstreamError.ts";
import AbstractApiClient from "../AbstractApiClient.ts";
import type { AbstractApiOptions, FormatPlayObjectOptions } from "../../infrastructure/Atomic.ts";
import { getRoot } from "../../../ioc.ts";
import type { SpotifyTransformerApiConfigData } from "./SpotifyTypes.ts";

export interface SpotifySearchOptions {
    limit?: number
    market?: string
    useCachedResult?: boolean
}

const luceneQuoteIfNeeded = (val: string): string => {
    // spotify search field filters (track:"" artist:"" album:"") expect the value quoted
    // if it contains any whitespace, otherwise quoting is not required but also not harmful
    const escaped = val.replaceAll('"', '\\"');
    return `"${escaped}"`;
}

export class SpotifyApiClient extends AbstractApiClient {

    declare config: SpotifyTransformerApiConfigData;
    protected spotifyApi: SpotifyWebApi;
    protected rateLimiterQueue: RateLimiterQueue;
    protected cache: Cacheable;
    protected tokenExpiresAt: number = 0;

    constructor(name: any, config: SpotifyTransformerApiConfigData, options: AbstractApiOptions & { cache?: Cacheable }) {
        super('Spotify', name, config, options);
        this.cache = options.cache ?? getRoot().items.cache().cacheApi;

        const {
            requests = 10,
            perTime = 1
        } = config.rate || {};
        this.rateLimiterQueue = new RateLimiterQueue(new RateLimiterMemory({ points: requests, duration: perTime }), { maxQueueSize: 20 });

        this.spotifyApi = new SpotifyWebApi({ clientId: config.clientId, clientSecret: config.clientSecret });
    }

    protected ensureToken = async (): Promise<void> => {
        // refresh a little before actual expiration to avoid a race with an in-flight request
        if (this.spotifyApi.getAccessToken() !== undefined && Date.now() < this.tokenExpiresAt - 5000) {
            return;
        }
        try {
            const res = await this.spotifyApi.clientCredentialsGrant();
            this.spotifyApi.setAccessToken(res.body['access_token']);
            this.tokenExpiresAt = Date.now() + (res.body['expires_in'] * 1000);
        } catch (e) {
            throw new UpstreamError('Could not obtain a Spotify access token using the Client Credentials flow. Check clientId/clientSecret.', { cause: e, showStopper: true });
        }
    }

    protected callApi = async <T>(func: (api: SpotifyWebApi) => Promise<T>, options: { cacheKey?: string, useCachedResult?: boolean } = {}): Promise<T> => {
        const {
            cacheKey,
            useCachedResult = true
        } = options;

        if (cacheKey !== undefined && useCachedResult) {
            const cached = await this.cache.get<T>(cacheKey);
            if (cached !== undefined) {
                this.logger.debug(`Cache hit for ${cacheKey}`);
                return cached;
            }
        }

        await this.rateLimiterQueue.removeTokens(1);
        await this.ensureToken();

        try {
            const res = await func(this.spotifyApi);
            if (cacheKey !== undefined) {
                await this.cache.set(cacheKey, res);
            }
            return res;
        } catch (e) {
            throw new UpstreamError('Spotify API call failed', { cause: e });
        }
    }

    searchByIsrc = async (isrc: string, opts: SpotifySearchOptions = {}): Promise<SpotifyApi.TrackObjectFull[]> => {
        const { limit = 50, market = this.config.market, useCachedResult } = opts;
        const q = `isrc:${isrcNoHyphens(isrc)}`;
        const cacheKey = `spotify-search-${hashObject({ q, limit, market })}`;
        this.logger.debug({ labels: ['ISRC Search'] }, `Search Query => ${q}`);
        const res = await this.callApi((api) => api.searchTracks(q, { limit, market }), { cacheKey, useCachedResult });
        return res.body.tracks?.items ?? [];
    }

    searchByFields = async (play: PlayObject, opts: SpotifySearchOptions = {}): Promise<SpotifyApi.TrackObjectFull[]> => {
        const { limit = 50, market = this.config.market, useCachedResult } = opts;

        const parts: string[] = [];
        if (play.data.track !== undefined) {
            parts.push(`track:${luceneQuoteIfNeeded(play.data.track)}`);
        }
        if (play.data.artists !== undefined && play.data.artists.length > 0) {
            // use only the primary artist -- Spotify's search does not support matching multiple artist filters well
            // and a fuzzy rank pass happens afterwards to confirm the rest of the artist credits
            parts.push(`artist:${luceneQuoteIfNeeded(play.data.artists[0].name)}`);
        }
        // intentionally NOT filtering by album here -- unlike Musicbrainz's fuzzy Lucene backend, Spotify's field
        // search is literal, so ANDing album into the query causes near-total misses whenever the track's Spotify
        // album metadata differs even slightly from the scrobble (singles, re-releases, etc). Album confirmation
        // happens afterwards via fuzzy ranking instead.

        const q = parts.join(' ');
        const cacheKey = `spotify-search-${hashObject({ q, limit, market })}`;
        this.logger.debug({ labels: ['Basic Search'] }, `Search Query => ${q}`);
        const res = await this.callApi((api) => api.searchTracks(q, { limit, market }), { cacheKey, useCachedResult });
        return res.body.tracks?.items ?? [];
    }

    static formatPlayObj(obj: SpotifyApi.TrackObjectFull, options: FormatPlayObjectOptions = {}): PlayObject {
        return trackToPlay(obj);
    }
}

export const trackToPlay = (track: SpotifyApi.TrackObjectFull): PlayObject => {

    const {
        id,
        name,
        artists = [],
        album,
        duration_ms,
        external_ids: {
            isrc
        } = {}
    } = track;

    const albumArtists = album?.artists ?? [];

    let actualAlbumArtists: SpotifyApi.ArtistObjectSimplified[] = [];
    if ((artists.length !== albumArtists.length) || !artists.every(artist => albumArtists.some(albumArtist => artist.id === albumArtist.id))) {
        // only include album artists if they are not the EXACT same as the track artists
        actualAlbumArtists = albumArtists;
    }

    const play: PlayObjectMinimal = {
        data: {
            track: name,
            artists: artists.map(x => artistNameToCredit(x.name)),
            albumArtists: actualAlbumArtists.map(x => artistNameToCredit(x.name)),
            album: album?.name,
            duration: duration_ms !== undefined ? Math.round(duration_ms / 1000) : undefined,
            isrc,
            meta: {
                spotify: {
                    track: id,
                    artist: artists.map(x => x.id),
                    albumArtist: actualAlbumArtists.map(x => x.id),
                    album: album?.id
                }
            }
        },
        meta: {
            source: 'spotify',
            trackId: id
        }
    }

    return baseFormatPlayObj(track, play);
}

export const isCompilation = (track: SpotifyApi.TrackObjectFull): boolean => track.album?.album_type === 'compilation';
