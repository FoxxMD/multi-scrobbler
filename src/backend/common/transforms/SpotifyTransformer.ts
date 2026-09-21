import { childLogger } from "@foxxmd/logging";
import type { Cacheable } from "cacheable";
import type { WebhookPayload } from "../infrastructure/config/health/webhooks.ts";
import {
    DEFAULT_MISSING_MBIDS_TYPES,
    DEFAULT_MISSING_TYPES,
    type ArtistCredit,
    type LifecycleInput,
    type MissingMbidType,
    type OptionalCacheUsage,
    type PlayObject,
    type TrackMeta,
} from "../../../core/Atomic.ts";
import { ARTIST_WEIGHT, TITLE_WEIGHT } from "../infrastructure/Atomic.ts";
import { removeUndefinedKeys } from '../../../core/DataUtils.ts';
import type { ExternalMetadataTerm, PlayTransformMetadataStage } from "../../../core/Transform.ts";
import { isWhenCondition, testWhenConditions } from "../../utils/PlayTransformUtils.ts";
import { parseArrayFromMaybeString } from "../../utils/StringUtils.ts";
import { scorePlaySameness } from "../../utils/PlayComparisonUtils.ts";
import { intersect } from "../../utils.ts";
import { isCompilation, SpotifyApiClient, trackToPlay } from "../vendor/spotify/SpotifyApiClient.ts";
import { MaybeLogger } from '../MaybeLogger.ts';
import { SkipTransformStageError, StagePrerequisiteError, StageTransformError } from "../errors/MSErrors.ts";
import AtomicPartsTransformer from "./AtomicPartsTransformer.ts";
import type { TransformerOptions } from "./AbstractTransformer.ts";
import { asMissingMbid, SearchPrerequisiteError } from "./MusicbrainzTransformer.ts";
import {
    DEFAULT_SPOTIFY_SEARCH_ORDER,
    type SpotifySearchType,
    type SpotifyTransformerConfig,
    type SpotifyTransformerData,
} from "./spotify/SpotifyTransformerUtil.ts";

export const asSpotifySearchType = (str: string): SpotifySearchType => {
    const clean = str.trim().toLocaleLowerCase();
    if (clean === 'isrc' || clean === 'basic') {
        return clean;
    }
    throw new Error(`SearchType must be one of 'isrc' or 'basic', given: ${clean}`);
}

/** How much to subtract from a candidate's match score when it belongs to a compilation album and deprioritizeCompilations is enabled */
export const COMPILATION_PENALTY = 0.15;

export interface SpotifyTransformerDataStrong extends SpotifyTransformerData {
    searchWhenMissing: MissingMbidType[]

    titleWeight?: number
    artistWeight?: number
    albumWeight?: number
}

export interface SpotifyTransformerDataStage extends SpotifyTransformerDataStrong, PlayTransformMetadataStage {
}

export interface SpotifyTrackSearchResult {
    tracks: SpotifyApi.TrackObjectFull[]
    requestQueries: LifecycleInput[]
}

export interface RankedSpotifyTrack {
    track: SpotifyApi.TrackObjectFull
    matchScore: number
}

export const parseStageConfig = (data: SpotifyTransformerData | undefined = {}, logger: MaybeLogger = new MaybeLogger()): SpotifyTransformerDataStrong => {

    if (data === null || typeof data !== 'object') {
        throw new Error('Spotify Transformer data should be an object or not defined.');
    }

    const {
        searchWhenMissing,
        searchOrder,
        titleWeight,
        albumWeight,
        artistWeight,
        ...rest
    } = data;

    const config: SpotifyTransformerDataStrong = {
        searchWhenMissing: DEFAULT_MISSING_TYPES,
        score: 0.6,
        ...rest,
    };

    if (searchWhenMissing !== undefined) {
        config.searchWhenMissing = searchWhenMissing.map(asMissingMbid);
    }

    logger.debug(`Will search if missing: ${config.searchWhenMissing.join(', ')} | Match if (default) score is >= ${config.score}`);

    if (searchOrder !== undefined) {
        const so = parseArrayFromMaybeString(searchOrder as unknown as string[], { lower: true }).map(asSpotifySearchType);
        if (so.length > 0) {
            config.searchOrder = so;
            logger.debug(`Search Order => ${so.join(' | ')}`);
        }
    }

    if (titleWeight !== undefined) {
        config.titleWeight = titleWeight === true ? TITLE_WEIGHT : titleWeight;
    }
    if (artistWeight !== undefined) {
        config.artistWeight = artistWeight === true ? ARTIST_WEIGHT : artistWeight;
    }
    if (albumWeight !== undefined) {
        config.albumWeight = albumWeight === true ? 0.3 : albumWeight;
    }

    return config;
}

/** Analogous to musicbrainz's missingMbidTypes but checks the presence of Spotify IDs on the Play instead of MBIDs */
export const missingSpotifyTypes = (play: PlayObject): MissingMbidType[] => {
    let missing: MissingMbidType[] = [];

    if (play.data.duration === undefined) {
        missing.push('duration');
    }

    if (play.data.meta?.spotify === undefined) {
        missing = missing.concat(DEFAULT_MISSING_MBIDS_TYPES);
        return missing;
    }

    const {
        track,
        album,
        artist
    } = play.data.meta.spotify;

    if (track === undefined) {
        missing.push('title');
    }
    if (album === undefined) {
        missing.push('album');
    }
    if (artist === undefined || (artist ?? []).length !== (play.data.artists ?? []).length) {
        missing.push('artists');
    }

    return missing;
}

/** Ranks candidate Spotify tracks by fuzzy similarity to the original scrobble.
 *
 * Unlike Musicbrainz (which returns its own relevance score from its search backend) Spotify's search results
 * do not carry a comparable score, so fuzzy matching against the original Play's title/artist(s)/album is always
 * used to both disambiguate results (EX an ISRC present on more than one album) and to determine whether a match
 * is confident enough to use at all.
 */
export const rankTracksBySimilarity = (tracks: SpotifyApi.TrackObjectFull[], play: PlayObject, stageConfig: SpotifyTransformerDataStage): RankedSpotifyTrack[] => {
    const {
        titleWeight = TITLE_WEIGHT,
        artistWeight = ARTIST_WEIGHT,
        albumWeight = 0.3,
        deprioritizeCompilations = false,
    } = stageConfig;

    const ranked = tracks.map((track) => {
        const candidate = trackToPlay(track);
        let matchScore = scorePlaySameness(play, candidate, {
            weights: {
                track: titleWeight,
                artist: artistWeight,
                album: albumWeight
            }
        });

        if (deprioritizeCompilations && isCompilation(track)) {
            matchScore = matchScore - COMPILATION_PENALTY;
        }

        return { track, matchScore };
    });

    ranked.sort((a, b) => b.matchScore - a.matchScore);
    return ranked;
}

export default class SpotifyTransformer extends AtomicPartsTransformer<ExternalMetadataTerm, PlayObject, SpotifyTransformerDataStage> {

    declare config: SpotifyTransformerConfig;

    protected defaults: SpotifyTransformerDataStrong;

    protected api: SpotifyApiClient;
    protected clientCache?: Cacheable;

    public constructor(config: SpotifyTransformerConfig, options: TransformerOptions & { clientCache?: Cacheable }) {
        super(config, options);
        this.clientCache = options.clientCache;
        this.staggerOpts = {
            initialInterval: 0,
            maxRandomStagger: 100
        }
    }

    protected async doBuildInitData(): Promise<true | string | undefined> {
        this.defaults = parseStageConfig(this.config.defaults, childLogger(this.logger, 'Defaults'));

        const {
            clientId,
            clientSecret,
            market,
            rate
        } = this.config.data ?? {};

        if (clientId === undefined || clientSecret === undefined) {
            throw new Error(`Spotify Transformer requires 'clientId' and 'clientSecret' to be set in 'data'`);
        }

        this.api = new SpotifyApiClient(this.config.name, { clientId, clientSecret, market, rate }, {
            logger: this.logger,
            cache: this.clientCache
        });

        return true;
    }

    protected doParseConfig(data: SpotifyTransformerDataStage) {
        if (data.type !== 'spotify') {
            throw new Error(`Spotify Transformer is only usable with 'spotify' type stages`);
        }

        const stage: SpotifyTransformerDataStage = {
            ...data,
            ...parseStageConfig(data),
            type: 'spotify'
        }

        for (const k of ['artists', 'albumArtists', 'title', 'album', 'meta', 'duration']) {
            if (!(k in stage)) {
                stage[k] = true;
                continue;
            }
            if (Array.isArray(stage[k])) {
                throw new Error(`${k} must be a boolean or when object`);
            }
            if (typeof stage[k] === 'boolean') {
                continue;
            }
            if (typeof stage[k] === 'object' && !isWhenCondition(stage[k])) {
                throw new Error(`${k} is not a valid when object`);
            }
        }
        return stage;
    }

    public async handlePreFetch(play: PlayObject, stageConfig: SpotifyTransformerDataStage): Promise<void> {
        const {
            searchWhenMissing = this.defaults.searchWhenMissing,
            forceSearch = this.defaults.forceSearch ?? false,
        } = stageConfig;

        const missing = missingSpotifyTypes(play);
        if (intersect(searchWhenMissing, missing).length > 0) {
            this.logger.debug(`Desired Spotify data for ${searchWhenMissing.join(',')} and Play is missing: ${missing.join(', ')}`);
        } else if (forceSearch) {
            this.logger.debug(`All desired Spotify data (${searchWhenMissing.join(',')}) exist but forceSearch = true`);
        } else {
            throw new SkipTransformStageError(`No desired Spotify data (${searchWhenMissing.join(',')}) are missing`, { shortStack: true });
        }
    }

    public async getTransformerData(play: PlayObject, stageConfig: SpotifyTransformerDataStage, opts?: OptionalCacheUsage): Promise<SpotifyTrackSearchResult> {

        const {
            searchOrder = this.defaults.searchOrder ?? DEFAULT_SPOTIFY_SEARCH_ORDER
        } = stageConfig;

        let tracks: SpotifyApi.TrackObjectFull[] = [];
        const queries: LifecycleInput[] = [];

        for (const searchType of searchOrder) {
            try {
                switch (searchType) {
                    case 'isrc':
                        tracks = await this.searchByIsrc(play, stageConfig, opts);
                        break;
                    case 'basic':
                        tracks = await this.searchByBasicFields(play, stageConfig, opts);
                        break;
                }
                queries.push({ type: `spotifyQuery-${searchType}${tracks.length === 0 ? '-empty' : ''}`, input: `${searchType} search for '${play.data.track}'` });
                if (tracks.length === 0) {
                    this.logger.debug(`'${searchType}' search type returned no matches`);
                } else {
                    break;
                }
            } catch (e) {
                if (e instanceof SearchPrerequisiteError) {
                    queries.push({ type: `spotifyQuery-${searchType}-prereqFailure`, input: `Search type ${searchType} did not meet prerequisites: ${e.message}` });
                    this.logger.debug(`Search type ${searchType} did not meet prerequisites: ${e.message}`);
                } else {
                    // we should be catching any unrecoverable errors in api calls
                    // so we should only get here if something truly bad has happened
                    throw new StageTransformError('Search Error', 'Unexpected error occurred while searching the Spotify API', { cause: e, inputs: queries });
                }
            }
        }

        return { tracks, requestQueries: queries };
    }

    public async searchByIsrc(play: PlayObject, stageConfig: SpotifyTransformerDataStage, opts: OptionalCacheUsage = {}): Promise<SpotifyApi.TrackObjectFull[]> {
        if (play.data.isrc === undefined) {
            throw new SearchPrerequisiteError('Play does not have ISRC');
        }
        this.logger.debug({ labels: ['ISRC Search'] }, 'Searching with ISRC');
        const {
            market = this.defaults.market
        } = stageConfig;
        return await this.api.searchByIsrc(play.data.isrc, { market, useCachedResult: opts.useCachedResult });
    }

    public async searchByBasicFields(play: PlayObject, stageConfig: SpotifyTransformerDataStage, opts: OptionalCacheUsage = {}): Promise<SpotifyApi.TrackObjectFull[]> {
        if (play.data.track === undefined) {
            throw new SearchPrerequisiteError('Play does not have a title');
        }
        this.logger.debug({ labels: ['Basic Search'] }, 'Searching by artist/album/track');
        const {
            market = this.defaults.market
        } = stageConfig;
        return await this.api.searchByFields(play, { market, useCachedResult: opts.useCachedResult });
    }

    public async handlePostFetch(play: PlayObject, transformData: SpotifyTrackSearchResult, stageConfig: SpotifyTransformerDataStage): Promise<PlayObject> {

        const {
            tracks = [],
            requestQueries = []
        } = transformData ?? {};

        if (tracks.length === 0) {
            throw new StagePrerequisiteError('No matches returned from the Spotify API', { shortStack: true, inputs: requestQueries });
        }

        const {
            score = this.defaults.score ?? 0.6
        } = stageConfig;

        const mergedConfig = Object.assign({}, removeUndefinedKeys({ ...this.defaults }), removeUndefinedKeys({ ...stageConfig }));

        const ranked = rankTracksBySimilarity(tracks, play, mergedConfig);

        const filtered = ranked.filter(x => x.matchScore >= score);
        if (filtered.length === 0) {
            throw new StagePrerequisiteError(`All ${tracks.length} fetched matches had a score < ${score}, best match was ${ranked[0]?.matchScore.toFixed(3)}`, { shortStack: true, inputs: requestQueries });
        }

        this.logger.debug(`${filtered.length} of ${tracks.length} fetched matches were valid. Using match with best score of ${filtered[0].matchScore.toFixed(3)}`);

        const spotifyPlay = trackToPlay(filtered[0].track);
        spotifyPlay.meta.lifecycleInputs = [...(spotifyPlay.meta.lifecycleInputs ?? []), ...requestQueries, { type: 'spotifyTrack', input: filtered[0].track.id }];
        return spotifyPlay;
    }

    protected async handleTitle(play: PlayObject, parts: ExternalMetadataTerm, transformData: PlayObject): Promise<string | undefined> {
        if (parts === false) {
            return play.data.track;
        }
        if (typeof parts === 'object') {
            if (parts.when !== undefined) {
                if (!testWhenConditions(parts.when, play, { testMaybeRegex: this.regex.testMaybeRegex })) {
                    this.logger.debug('When condition for track not met, returning original track');
                    return play.data.track;
                }
            }
        }
        return transformData.data.track;
    }

    protected async handleArtists(play: PlayObject, parts: ExternalMetadataTerm, transformData: PlayObject): Promise<ArtistCredit[] | undefined> {
        if (parts === false) {
            return play.data.artists;
        }
        if (typeof parts === 'object') {
            if (parts.when !== undefined) {
                if (!testWhenConditions(parts.when, play, { testMaybeRegex: this.regex.testMaybeRegex })) {
                    this.logger.debug('When condition for artists not met, returning original artists');
                    return play.data.artists;
                }
            }
        }
        return transformData.data.artists;
    }

    protected async handleAlbumArtists(play: PlayObject, parts: ExternalMetadataTerm, transformData: PlayObject): Promise<ArtistCredit[] | undefined> {
        if (parts === false) {
            return play.data.albumArtists;
        }
        if (typeof parts === 'object') {
            if (parts.when !== undefined) {
                if (!testWhenConditions(parts.when, play, { testMaybeRegex: this.regex.testMaybeRegex })) {
                    this.logger.debug('When condition for albumArtists not met, returning original artists');
                    return play.data.albumArtists;
                }
            }
        }
        return transformData.data.albumArtists;
    }

    protected async handleAlbum(play: PlayObject, parts: ExternalMetadataTerm, transformData: PlayObject): Promise<string | undefined> {
        if (parts === false) {
            return play.data.album;
        }
        if (typeof parts === 'object') {
            if (parts.when !== undefined) {
                if (!testWhenConditions(parts.when, play, { testMaybeRegex: this.regex.testMaybeRegex })) {
                    this.logger.debug('When condition for album not met, returning original album');
                    return play.data.album;
                }
            }
        }
        return transformData.data.album;
    }

    protected async handleDuration(play: PlayObject, parts: ExternalMetadataTerm, transformData: PlayObject): Promise<number | undefined> {
        if (parts === false || transformData.data.duration === undefined) {
            return play.data.duration;
        }
        if (typeof parts === 'object') {
            if (parts.when !== undefined) {
                if (!testWhenConditions(parts.when, play, { testMaybeRegex: this.regex.testMaybeRegex })) {
                    this.logger.debug('When condition for duration not met, returning original duration');
                    return play.data.duration;
                }
            }
        }
        return transformData.data.duration;
    }

    protected async handleMeta(play: PlayObject, parts: ExternalMetadataTerm, transformData: PlayObject): Promise<TrackMeta | undefined> {
        if (parts === false) {
            return play.data.meta;
        }
        if (typeof parts === 'object') {
            if (parts.when !== undefined) {
                if (!testWhenConditions(parts.when, play, { testMaybeRegex: this.regex.testMaybeRegex })) {
                    this.logger.debug('When condition for meta not met, returning original meta');
                    return play.data.meta;
                }
            }
        }
        return transformData.data.meta;
    }

    public notify(payload: WebhookPayload): Promise<void> {
        return;
    }
}
