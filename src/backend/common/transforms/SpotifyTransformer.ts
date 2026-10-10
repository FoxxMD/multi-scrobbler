import { childLogger } from "@foxxmd/logging";
import type { Cacheable } from "cacheable";
import type { WebhookPayload } from "../infrastructure/config/health/webhooks.ts";
import {
    type Credit,
    type LifecycleInput,
    type MusicServicesBase,
    musicServicesBaseSchema,
    type OptionalCacheUsage,
    type PlayObject, type TrackMetaIsrc } from "../../../core/Atomic.ts";
import { ARTIST_WEIGHT, TITLE_WEIGHT } from "../infrastructure/Atomic.ts";
import { removeUndefinedKeys } from '../../../core/DataUtils.ts';
import type { ExternalMetadataTerm, PlayTransformMetadataStage } from "../../../core/Transform.ts";
import { isWhenCondition } from "../../utils/PlayTransformUtils.ts";
import { parseArrayFromMaybeString } from "../../utils/StringUtils.ts";
import { compareArtistCreditsNormalized, scorePlaySameness, type ScoreParts } from "../../utils/PlayComparisonUtils.ts";
import { intersect } from '../../../core/DataUtils.ts';
import { chooseImageByResolution, isCompilation, SpotifyApiClient, trackToPlay } from "../vendor/spotify/SpotifyApiClient.ts";
import { MaybeLogger } from '../MaybeLogger.ts';
import { SimpleError, SkipTransformStageError, StagePrerequisiteError, StageTransformError } from "../errors/MSErrors.ts";
import AtomicPartsTransformer from "./AtomicPartsTransformer.ts";
import { creditId, creditIds, creditIsrc, type CreditRules, nameToCredit, resolveCredit, resolveCredits, spotifyMeta, withImage } from "../../../core/MusicMetadata.ts";
import type { TransformerOptions } from "./AbstractTransformer.ts";
import { SearchPrerequisiteError } from "./MusicbrainzTransformer.ts";
import {
    DEFAULT_SPOTIFY_MISSING_TYPES,
    DEFAULT_SPOTIFY_SEARCH_ORDER,
    spotifyMissingTypes,
    spotifySearchTypes,
    type SpotifyMissingType,
    type SpotifySearchType,
    type SpotifyTransformerConfig,
    type SpotifyTransformerData } from "./spotify/SpotifyTransformerUtil.ts";
import { type AlbumSearchResult, type ArtistSearchResult, type TrackDataCreditBase, trackDataCreditBaseSchema, type TrackSearchResult } from "../../../core/Api.ts";
import { creditToResult, trackDataToResult } from "../metadataProviders/MetadataProviderUtils.ts";
import { compareNormalizedStrings } from "../../../core/StringUtils.ts";

/** How much to subtract from a candidate's match score when it belongs to a compilation album and deprioritizeCompilations is enabled */
export const COMPILATION_PENALTY = 0.15;

export interface SpotifyTransformerDataStrong extends SpotifyTransformerData {
    searchWhenMissing: SpotifyMissingType[]

    titleWeight?: number
    artistWeight?: number
    albumWeight?: number
}

export interface SpotifyTransformerDataStage extends SpotifyTransformerDataStrong, PlayTransformMetadataStage {
}

export interface SpotifyTrackSearchResult {
    tracks: SpotifyApi.TrackObjectFull[]
    requestQueries: LifecycleInput[]
    /** Which search type produced `tracks`. When 'isrc' the ISRC itself is treated as confirmation of the match --
     * fuzzy title/artist/album scoring is only used to disambiguate between multiple candidates (EX the same ISRC
     * appearing on more than one album/release) and is not used to reject the match, since an ISRC-identified
     * recording may legitimately have very different title/artist text on Spotify (localized titles, "feat." credits,
     * movie/theatrical edition suffixes, etc) than the scrobbling source. */
    searchType?: SpotifySearchType
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
        searchWhenMissing: DEFAULT_SPOTIFY_MISSING_TYPES,
        score: 0.6,
        ...rest };

    if (searchWhenMissing !== undefined) {
        config.searchWhenMissing = searchWhenMissing.map((x) => spotifyMissingTypes.parse(x.toLocaleLowerCase().trim()));
    }

    logger.debug(`Will search if missing: ${config.searchWhenMissing.join(', ')} | Match if (default) score is >= ${config.score}`);

    if (searchOrder !== undefined) {
        const so = parseArrayFromMaybeString(searchOrder as unknown as string[], { lower: true }).map<SpotifySearchType>((x) => spotifySearchTypes.parse(x.trim()));
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
export const missingSpotifyTypes = (play: PlayObject): SpotifyMissingType[] => {
    const missing: SpotifyMissingType[] = [];

    const {
        track,
        album,
        artists: dataArtists,
        duration
    } = play.data;

    const albumArt = album?.image;

    const artistIds = creditIds(dataArtists, 'spotify', 'artist');
    if (creditId(track, 'spotify', 'track') === undefined
        || creditId(album, 'spotify', 'album') === undefined
        || artistIds.length === 0
        || artistIds.length !== (dataArtists ?? []).length) {
        missing.push('ids');
    }

    if (track === undefined) {
        missing.push('title');
    }
    if (album === undefined) {
        missing.push('album');
    }
    if (dataArtists === undefined || (dataArtists ?? []).length === 0) {
        missing.push('artists');
    }
    if(duration === undefined) {
        missing.push('duration');
    }
    if(creditIsrc(play.data.track) === undefined) {
        missing.push('isrc');
    }
    if(albumArt === undefined) {
        missing.push('art');
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
export const rankTracksBySimilarity = (tracks: SpotifyApi.TrackObjectFull[], play: PlayObject, stageConfig: SpotifyTransformerDataStage & {parts?: ScoreParts[]}): RankedSpotifyTrack[] => {
    const {
        titleWeight = TITLE_WEIGHT,
        artistWeight = ARTIST_WEIGHT,
        albumWeight = 0.3,
        deprioritizeCompilations = false } = stageConfig;

    const ranked = tracks.map((track) => {
        const candidate = trackToPlay(track);
        let [matchScore] = scorePlaySameness(play, candidate, {
            weights: {
                track: titleWeight,
                artist: artistWeight,
                album: albumWeight
            },
            parts: stageConfig.parts
        });

        if (deprioritizeCompilations && isCompilation(track)) {
            matchScore = matchScore - COMPILATION_PENALTY;
        }

        return { track, matchScore };
    });

    ranked.sort((a, b) => b.matchScore - a.matchScore);
    return ranked;
}

/** Returns the id when metadata is a spotify id usable as the given type, or undefined when it is for a service spotify cannot look up */
const spotifyIdFor = (meta: MusicServicesBase, type: 'track' | 'album' | 'artist'): string | undefined => {
    if(meta.name !== 'spotify') {
        return undefined;
    }
    if(meta.idType !== undefined && meta.idType !== type) {
        throw new SimpleError(`Metadata type not valid as a search parameter '${meta.idType}'`);
    }
    return meta.id;
}

export default class SpotifyTransformer extends AtomicPartsTransformer<ExternalMetadataTerm, PlayObject, SpotifyTransformerDataStage> {

    declare config: SpotifyTransformerConfig;

    protected defaults!: SpotifyTransformerDataStrong;

    protected api!: SpotifyApiClient;
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
            rate
        } = this.config.data ?? {};

        if (clientId === undefined || clientSecret === undefined) {
            throw new Error(`Spotify Transformer requires 'clientId' and 'clientSecret' to be set in 'data'`);
        }

        this.api = new SpotifyApiClient(this.config.name, { clientId, clientSecret, rate }, {
            logger: this.logger,
            cache: this.clientCache
        });

        return true;
    }

    protected doParseConfig(data: SpotifyTransformerDataStage) {
        if (data.type.toLocaleLowerCase().trim() !== 'spotify') {
            throw new Error(`Spotify Transformer is only usable with 'spotify' type stages`);
        }

        const stage: SpotifyTransformerDataStage = {
            ...data,
            ...parseStageConfig(data),
            type: 'spotify'
        }

        for (const k of ['artists', 'albumArtists', 'title', 'album', 'meta', 'duration', 'art'] as const) {
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
            forceSearch = this.defaults.forceSearch ?? false } = stageConfig;

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
                queries.push({ type: `spotifyQuery-${searchType}${tracks.length === 0 ? '-empty' : ''}`, input: `${searchType} search for '${play.data.track?.name}'` });
                if (tracks.length === 0) {
                    this.logger.debug(`'${searchType}' search type returned no matches`);
                } else {
                    return { tracks, requestQueries: queries, searchType };
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
        const isrc = creditIsrc(play.data.track);
        if (isrc === undefined) {
            throw new SearchPrerequisiteError('Play does not have ISRC');
        }
        this.logger.debug({ labels: ['ISRC Search'] }, 'Searching with ISRC');
        const {
            market = this.defaults.market,
            locale = this.defaults.locale
        } = stageConfig;
        return await this.api.searchTracksByIsrc(isrc, { market, locale, useCachedResult: opts.useCachedResult });
    }

    public async searchByBasicFields(play: PlayObject, stageConfig: SpotifyTransformerDataStage, opts: OptionalCacheUsage = {}): Promise<SpotifyApi.TrackObjectFull[]> {
        if (play.data.track === undefined) {
            throw new SearchPrerequisiteError('Play does not have a title');
        }
        this.logger.debug({ labels: ['Basic Search'] }, 'Searching by artist/album/track');
        const {
            market = this.defaults.market,
            locale = this.defaults.locale
        } = stageConfig;
        return await this.api.searchTracksByFields(play, { market, locale, useCachedResult: opts.useCachedResult });
    }

    async getTrackResults(query: TrackDataCreditBase | MusicServicesBase): Promise<TrackSearchResult[] | false> {
        let ranked: RankedSpotifyTrack[] = [];
        const data = trackDataCreditBaseSchema.required({track: true}).safeParse(query);
        if(data.success) {
            const surrogatePlay: PlayObject = {data: data.data, meta: {}};
            const {track, artists = [], album} = surrogatePlay.data;

            const spotifyId = creditId(track, 'spotify');
            if(spotifyId !== undefined) {
                const found = await this.api.getTrack(spotifyId, this.defaults);
                if(found !== undefined) {
                    ranked = [{track: found, matchScore: 1}];
                }
            }
            if(ranked.length === 0) {
                let tracks: SpotifyApi.TrackObjectFull[] = [];
                let searchType: SpotifySearchType = 'isrc';
                if(creditIsrc(track) !== undefined) {
                    try {
                        tracks = await this.searchByIsrc(surrogatePlay, {type: 'spotify', ...this.defaults});
                    } catch (e) {
                        this.logger.warn(new SimpleError('could not search metadata results by isrc', {cause: e}));
                    }
                }
                if(tracks.length === 0 && track !== undefined && track.name.trim() !== '') {
                    searchType = 'basic';
                    tracks = await this.searchByBasicFields(surrogatePlay, {type: 'spotify', ...this.defaults});
                }

                // only score against what was queried for, with weights scaled so a perfect match is still out of 100
                const weights: [ScoreParts, number][] = [['track', this.defaults.titleWeight ?? TITLE_WEIGHT]];
                if(artists.length > 0) {
                    weights.push(['artist', this.defaults.artistWeight ?? ARTIST_WEIGHT]);
                }
                if(album !== undefined) {
                    weights.push(['album', this.defaults.albumWeight ?? 0.3]);
                }
                const total = weights.reduce((acc, [, w]) => acc + w, 0);
                const scaled = Object.fromEntries(weights.map(([part, w]) => [part, total === 0 ? 1 : w / total]));

                ranked = this.rankTrackMatches(surrogatePlay, {tracks, searchType, requestQueries: []}, {
                    type: 'spotify',
                    ...this.defaults,
                    parts: weights.map(([part]) => part),
                    titleWeight: scaled.track,
                    artistWeight: scaled.artist,
                    albumWeight: scaled.album
                });
            }
        } else {
            const metadata = musicServicesBaseSchema.safeParse(query);
            if(!metadata.success) {
                throw new AggregateError([data.error, metadata.error],'query was not a TrackDataCreditBase or MusicServicesBase type');
            }
            let tracks: SpotifyApi.TrackObjectFull[] = [];
            if(metadata.data.name === 'isrc') {
                tracks = await this.api.searchTracksByIsrc(metadata.data.id, this.defaults);
            } else {
                const spotifyId = spotifyIdFor(metadata.data, 'track');
                if(spotifyId === undefined) {
                    // service type was not applicable
                    return [];
                }
                const found = await this.api.getTrack(spotifyId, this.defaults);
                if(found !== undefined) {
                    tracks = [found];
                }
            }
            // id identifies the exact track so there is nothing to score against
            ranked = tracks.map((x) => ({track: x, matchScore: 1}));
        }

        const results = ranked.slice(0, 5).map((x) => trackDataToResult(trackToPlay(x.track).data, {
            service: 'spotify',
            score: x.matchScore  * 100,
            albumCount: 1,
            id: x.track.id.toString(),
        }, {
            albumType: x.track.album.album_type,
            date: x.track.album.release_date
        }));
        results.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
        return results;
    }

    async getArtistResults(query: TrackDataCreditBase | MusicServicesBase): Promise<ArtistSearchResult[] | false> {
        let ranked: (SpotifyApi.ArtistObjectFull & {score: number})[] = [];
        const data = trackDataCreditBaseSchema.required({artists: true}).safeParse(query);
        if(data.success) {
            const {artists = []} = data.data;
            if(artists.length === 0) {
                throw new SimpleError(`Must include 'artist' credit`);
            }
            const spotifyIds = creditIds(artists, 'spotify');
            if(spotifyIds.length > 0) {
                ranked = (await this.api.getArtists(spotifyIds, this.defaults)).map((x) => ({...x, score: 100}));
            }
            // spotify search only takes one artist so only the first is used
            const surrogateArtist: Credit = artists[0];
            if(ranked.length === 0 && surrogateArtist.name.trim() !== '') {
                const scoreThreshold = this.defaults.score ?? 0.6;
                const res = await this.api.searchArtists(surrogateArtist, this.defaults);
                ranked = res.map((x) => ({...x, score: compareArtistCreditsNormalized([surrogateArtist], [{name: x.name}])[0] * 100}))
                .sort((a, b) => b.score - a.score)
                .filter(x => x.score >= scoreThreshold);
            }
        } else {
            const metadata = musicServicesBaseSchema.safeParse(query);
            if(!metadata.success) {
                throw new AggregateError([data.error, metadata.error],'query was not a TrackDataCreditBase or MusicServicesBase type');
            }
            const spotifyId = spotifyIdFor(metadata.data, 'artist');
            if(spotifyId === undefined) {
                // service type was not applicable
                return [];
            }
            const found = await this.api.getArtist(spotifyId, this.defaults);
            if(found !== undefined) {
                ranked = [{...found, score: 100}];
            }
        }
        const results: ArtistSearchResult[] = ranked.slice(0, 5).map((x) => ({
            ...withImage(nameToCredit(x.name, spotifyMeta(x.id, 'artist')), chooseImageByResolution(x.images, {fallbackBest: true}).url),
            score: x.score,
            service: 'spotify',
            id: x.id
        }));
        return results;
    }
    async getAlbumResults(query: TrackDataCreditBase | MusicServicesBase): Promise<AlbumSearchResult[] | false> {
        let ranked: (SpotifyApi.AlbumObjectSimplified & {score: number})[] = [];
        const data = trackDataCreditBaseSchema.required({album: true}).safeParse(query);
        if(data.success) {
            const {album, artists} = data.data;
            if(album === undefined) {
                throw new SimpleError(`Must include 'album' credit`);
            }
            const spotifyId = creditId(album, 'spotify');
            if(spotifyId !== undefined) {
                const found = await this.api.getAlbum(spotifyId, this.defaults);
                if(found !== undefined) {
                    ranked = [{...found, score: 100}];
                }
            }
            if(ranked.length === 0 && album.name.trim() !== '') {
                const scoreThreshold = this.defaults.score ?? 0.6;
                const res = await this.api.searchAlbums({album, artists}, this.defaults);
                ranked = res.map((x) => {
                    const sameness = compareNormalizedStrings(album.name, x.name);
                    return {...x, score: Math.min(sameness.highScore, 100)}
                })
                .sort((a, b) => b.score - a.score)
                .filter(x => x.score >= scoreThreshold);
            }
        } else {
            const metadata = musicServicesBaseSchema.safeParse(query);
            if(!metadata.success) {
                throw new AggregateError([data.error, metadata.error],'query was not a TrackDataCreditBase or MusicServicesBase type');
            }
            const spotifyId = spotifyIdFor(metadata.data, 'album');
            if(spotifyId === undefined) {
                // service type was not applicable
                return [];
            }
            const found = await this.api.getAlbum(spotifyId, this.defaults);
            if(found !== undefined) {
                ranked = [{...found, score: 100}];
            }
        }
        const results: AlbumSearchResult[] = ranked.slice(0, 5).map((x) => ({
            ...withImage(nameToCredit(x.name, spotifyMeta(x.id, 'album')), chooseImageByResolution(x.images, {fallbackBest: true}).url),
            albumType: x.album_type,
            date: x.release_date,
            artists: (x.artists ?? []).length === 0 ? undefined : x.artists.map((y) => creditToResult(nameToCredit(y.name, spotifyMeta(y.id, 'artist')), 'spotify')),
            score: x.score,
            service: 'spotify',
            id: x.id
        }));
        return results;
    }

    public async handlePostFetch(play: PlayObject, transformData: SpotifyTrackSearchResult, stageConfig: SpotifyTransformerDataStage): Promise<PlayObject> {

        const {
            tracks = [],
            requestQueries = [],
            searchType
        } = transformData ?? {};

        if (tracks.length === 0) {
            throw new StagePrerequisiteError('No matches returned from the Spotify API', { shortStack: true, inputs: requestQueries });
        }

        const {
            score = this.defaults.score ?? 0.6
        } = stageConfig;

        const mergedConfig = Object.assign({}, removeUndefinedKeys({ ...this.defaults }), removeUndefinedKeys({ ...stageConfig }));

        const ranked = rankTracksBySimilarity(tracks, play, mergedConfig);

        let filtered = this.rankTrackMatches(play, transformData, stageConfig);
        if (searchType !== 'isrc') {
            filtered = ranked.filter(x => x.matchScore >= score);
            if (filtered.length === 0) {
                throw new StagePrerequisiteError(`All ${tracks.length} fetched matches had a score < ${score}, best match was ${ranked[0]?.matchScore.toFixed(3)}`, { shortStack: true, inputs: requestQueries });
            }
            this.logger.debug(`${filtered.length} of ${tracks.length} fetched matches were valid. Using match with best score of ${filtered[0].matchScore.toFixed(3)}`);
        }
        const spotifyPlay = trackToPlay(filtered[0].track);
        spotifyPlay.meta.lifecycleInputs = [...(spotifyPlay.meta.lifecycleInputs ?? []), ...requestQueries, { type: 'spotifyTrack', input: filtered[0].track.id }];
        return spotifyPlay;
    }

    protected rankTrackMatches(play: PlayObject,transformData: SpotifyTrackSearchResult, stageConfig: SpotifyTransformerDataStage & {parts?: ScoreParts[]}): RankedSpotifyTrack[] {
        const {
            tracks = [],
            searchType
        } = transformData ?? {};

        if (tracks.length === 0) {
            return [];
        }

        const {
            score = this.defaults.score ?? 0.6
        } = stageConfig;

        const mergedConfig = Object.assign({}, removeUndefinedKeys({ ...this.defaults }), removeUndefinedKeys({ ...stageConfig }));

        const ranked = rankTracksBySimilarity(tracks, play, {...mergedConfig, parts: stageConfig.parts});

        let filtered: RankedSpotifyTrack[];
        if (searchType === 'isrc') {
            // an ISRC match already identifies the exact recording -- fuzzy scoring here is only used to pick
            // between multiple candidates (the same ISRC on more than one album/release), not to reject the match.
            // Title/artist text can legitimately diverge (localized titles, movie/theatrical edition suffixes, etc)
            // for a track that is nonetheless the correct recording.
            filtered = ranked;
            this.logger.debug(`Using ISRC-confirmed match, skipping score threshold. Best match score of ${ranked[0].matchScore.toFixed(3)} from ${tracks.length} candidate(s)`);
        } else {
            filtered = ranked.filter(x => x.matchScore >= score);
        }

        return filtered;
    }

    protected override readonly hydratesCredits = true;

    protected async handleTitle(play: PlayObject, parts: ExternalMetadataTerm, transformData: PlayObject, rules: CreditRules): Promise<Credit | undefined> {
        return resolveCredit(play.data.track, transformData.data.track, rules);
    }
    protected async handleArtists(play: PlayObject, parts: ExternalMetadataTerm, transformData: PlayObject, rules: CreditRules): Promise<Credit[] | undefined> {
        return resolveCredits(play.data.artists, transformData.data.artists, rules);
    }
    protected async handleAlbumArtists(play: PlayObject, parts: ExternalMetadataTerm, transformData: PlayObject, rules: CreditRules): Promise<Credit[] | undefined> {
        return resolveCredits(play.data.albumArtists, transformData.data.albumArtists, rules);
    }
    protected async handleAlbum(play: PlayObject, parts: ExternalMetadataTerm, transformData: PlayObject, rules: CreditRules): Promise<Credit | undefined> {
        return resolveCredit(play.data.album, transformData.data.album, rules);
    }
    protected async handleDuration(play: PlayObject, parts: ExternalMetadataTerm, transformData: PlayObject): Promise<number | undefined> {
        return transformData.data.duration ?? play.data.duration;
    }
    protected async handleMeta(play: PlayObject, parts: ExternalMetadataTerm, transformData: PlayObject): Promise<TrackMetaIsrc | undefined> {
        const {meta} = transformData.data;
        return removeUndefinedKeys<TrackMetaIsrc>({...meta});
    }

    public async notify(payload: WebhookPayload): Promise<void> {
    }
}
