import { type ArtistCredit, DEFAULT_ROCKSKY_MISSING_TYPES, type LifecycleInput, type OptionalCacheUsage, type PlayObject, rockskyMissingFields, type RockskyMissingField, type TrackMeta, type TransformerCommon, type TransformOptions } from "../../../core/Atomic.ts";
import { isWhenCondition, testWhenConditions } from "../../utils/PlayTransformUtils.ts";
import type {WebhookPayload} from "../infrastructure/config/health/webhooks.ts";
import type {ExternalMetadataTerm, PlayTransformMetadataStage} from "../../../core/Transform.ts";
import AtomicPartsTransformer from "./AtomicPartsTransformer.ts";
import type {TransformerOptions} from "./AbstractTransformer.ts";
import { ARTIST_WEIGHT, TITLE_WEIGHT } from "../infrastructure/Atomic.ts";
import { DELIMITERS } from '../../../core/Atomic.ts';
import { MaybeLogger } from '../MaybeLogger.ts';
import { childLogger } from "@foxxmd/logging";
import { type UsingTypes } from "../vendor/musicbrainz/MusicbrainzApiClientPool.ts";
import { difference } from "../../utils.ts";
import { removeUndefinedKeys } from '../../../core/DataUtils.ts';
import { SimpleError, SkipTransformStageError, StagePrerequisiteError, StageTransformError } from "../errors/MSErrors.ts";
import { scoreNormalizedStringsWeighted } from "../../utils/StringUtils.ts";
import clone from "clone";
import type { Cacheable } from "cacheable";
import { artistCreditsToNames, splitByFirstRegexFound } from "../../../core/StringUtils.ts";
import { nativeParse } from "./NativeTransformer.ts";
import { comparePlayArtistsNormalized, scoreTrackWeightedAndNormalized } from "../../utils/PlayComparisonUtils.ts";
import * as z from 'zod';
import { hasRequiredScrobbleFields, hasScrobbleConfidenceFields, songViewToPlay } from "../vendor/RockSkyApiClient.ts";
import { RockskyError, type SongMatchView, type SongViewDetailed } from "@rocksky/sdk";
import { RockskyClientPool } from "../vendor/rocksky/RockskyClientWrapped.ts";
import type { RockskyApiClientConfig } from "../vendor/rocksky/interfaces.ts";

const searchType = z.enum(['basic','basicorids','mbid','isrc','artist']);
export type SearchType = z.infer<typeof searchType>;

export const DEFAULT_SEARCHTYPE_ORDER: SearchType[] = ['isrc','basic'];

export interface RockskyTransformerData {
    searchWhenMissing?: RockskyMissingField[]
    forceSearch?: boolean
    score?: number
    allowNoMatch?: boolean
    logPreMbid?: boolean
    searchOrder?: SearchType[]
    searchArtistMethod?: ('naive' | 'native')

    /** Ignore album artist if it is "Various Artists"
     * 
     * @default true
     */
    ignoreVA?: boolean

    titleWeight?: number | true
    artistWeight?: number | true
    albumWeight?: number | true
}

export interface RockskyTransformerDataStrong extends RockskyTransformerData {
    searchWhenMissing: RockskyMissingField[]

    titleWeight?: number
    artistWeight?: number
    albumWeight?: number
}

export interface RockskyTransformerDataStage extends RockskyTransformerDataStrong,PlayTransformMetadataStage {
}

export type RockskyTransformerConfig = TransformerCommon<RockskyTransformerData, RockskyApiClientConfig> & {options?: TransformOptions & {logUrl?: boolean}}

interface SongViewDetailedMS extends SongViewDetailed {
    requestQuery: string
    requestQueries?: LifecycleInput[]
    mbArtists?: {name: string, mbid: string}[]
}

export const parseStageConfig = (data: RockskyTransformerData | undefined = {}, logger: MaybeLogger = new MaybeLogger()): RockskyTransformerDataStrong => {

    if (data === null || typeof data !== 'object') {
        throw new Error('Musicbrainz Transformer data should be an object or not defined.');
    }

    const {
        searchWhenMissing,
        searchArtistMethod,
        searchOrder = [],
        titleWeight,
        albumWeight,
        artistWeight,
        ...rest
    } = data;

    const config: RockskyTransformerDataStrong = {
        searchWhenMissing: DEFAULT_ROCKSKY_MISSING_TYPES,
        score: 90,
        ...rest,
    };

    if(searchWhenMissing !== undefined) {
        config.searchWhenMissing = searchWhenMissing.map(x => rockskyMissingFields.parse(x.toLocaleLowerCase().trim()));
    }

    logger.debug(`Will search if missing: ${config.searchWhenMissing.join(', ')} | Match if (default) score is >= ${config.score}`);

    const soSet = searchOrder.length > 0 ? new Set<SearchType>(searchOrder.map((x) => searchType.parse(x.toLocaleLowerCase()))) : new Set<SearchType>();

    if(soSet.has('artist') && config.searchArtistMethod === undefined) {
        const cleanFallback = (searchArtistMethod ?? 'native');
        if(!['native','naive'].includes(cleanFallback)) {
            throw new Error(`searchArtistMethod must be one of 'native' or 'naive', given: ${cleanFallback}`);
        }
        config.searchArtistMethod = cleanFallback;
        logger.debug(`Artist search using${searchArtistMethod === undefined ? ' default' : ''} '${config.searchArtistMethod}' method`);
    }

    const so = Array.from(soSet);
    const soHint: string[] = [];
    for(const s of so) {
        if(s === 'artist') {
            soHint.push(`artist (${config.searchArtistMethod})`);
        } else {
            soHint.push(s);
        }
    }
    if(so.length > 0) {
        logger.debug(`Search Order => ${soHint.join(' | ')}`);
        config.searchOrder = so;
    } else {
        logger.debug(`Search Order => default (isrc, basic) or stage default`);
    }

    for(const [k,v] of Object.entries(config)) {
        if(k.includes('release') && v !== undefined) {
            logger.debug(`${k}: ${Array.isArray(v) ? v.join(' | ') : v}`);
        }
    }

    if(titleWeight !== undefined) {
        config.titleWeight = titleWeight === true ? TITLE_WEIGHT : titleWeight;
    }
    if(artistWeight !== undefined) {
        config.artistWeight = artistWeight === true ? ARTIST_WEIGHT : artistWeight;
    }
    if(albumWeight !== undefined) {
        config.albumWeight = albumWeight === true ? 0.3 : albumWeight;
    }

    if(albumWeight !== undefined || titleWeight !== undefined || artistWeight !== undefined) {
        logger.debug(`Ranking matches based on scrobble text. Weights => Title ${config.titleWeight} | Artist ${config.artistWeight} | Album ${config.albumWeight}`);
    }

    return config;
}

export default class RockskyTransformer extends AtomicPartsTransformer<ExternalMetadataTerm, PlayObject, RockskyTransformerDataStage> {

    declare config: RockskyTransformerConfig;

    protected defaults: RockskyTransformerDataStrong;

    protected api: RockskyClientPool;
    protected clientCache?: Cacheable;

    public constructor(config: RockskyTransformerConfig, options: TransformerOptions & {clientCache?: Cacheable}) {
        super(config, options);
        this.clientCache = options.clientCache;
        this.staggerOpts = {
            initialInterval: 0,
            maxRandomStagger: 100
        }
    }

    protected async doBuildInitData(): Promise<true | string | undefined> {
        this.defaults = parseStageConfig(this.config.defaults, childLogger(this.logger, 'Defaults'));

        this.api = new RockskyClientPool(this.config.name, this.config.data, {logger: this.logger, cache: this.clientCache});   
        // new MusicbrainzApiClientPool(this.config.name, {apis: this.config.data.apis}, {
        //     logger: this.logger,
        //     cache: this.clientCache,
        //     logUrl: this.config.options?.logUrl
        // });

        return true;
    }

    protected doParseConfig(data: RockskyTransformerDataStage) {
        if (data.type !== 'rocksky') {
            throw new Error(`Rocksky Transformer is only usable with 'rocksky' type stages`);
        }

        const stage: RockskyTransformerDataStage = {
            ...data,
            ...parseStageConfig(data),
            type: 'rocksky'
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

    public async handlePreFetch(play: PlayObject, stageConfig: RockskyTransformerDataStage): Promise<void> {
        const {
            searchWhenMissing = this.defaults.searchWhenMissing,
            forceSearch = this.defaults.forceSearch ?? false,
            logPreMbid = this.defaults.logPreMbid ?? false
        } = stageConfig;

        if(logPreMbid) {
            const a = play.data.meta?.brainz?.artist;
            const parts: string[] = [
                `Recording ${play.data.meta?.brainz?.recording ?? '(None)'}`,
                `Release ${play.data.meta?.brainz?.album ?? '(None)'}`,
                `Artists ${a === undefined || a.length === 0 ? '(None)' : a.join(', ')}`,
                `ISRC ${play.data.isrc ?? '(None)'}`
            ];
            this.logger.debug(`Original MBIDS => ${parts.join(' | ')}`);
        }


        const found: RockskyMissingField[] = hasRequiredScrobbleFields(play).concat(hasScrobbleConfidenceFields(play));
        if(play.data.duration !== undefined && play.data.duration !== 0) {
            found.push('duration');
        }
        const missing = difference(searchWhenMissing, found);
        if(missing.length > 0) {
            this.logger.debug(`Play is missing desired fields: ${missing.join(', ')}`);
        } else if(forceSearch) {
            this.logger.debug(`All desired fields exist but forceSearch = true`);
        } else {
            throw new SkipTransformStageError(`No desired fields (${searchWhenMissing.join(',')}) are missing`, {shortStack: true});
        }
    }

    public async getTransformerData(play: PlayObject, stageConfig: RockskyTransformerDataStage, opts?: OptionalCacheUsage): Promise<SongViewDetailedMS> {
        
        const {
            // preserve order of search from before searchOrder
            searchOrder = this.defaults.searchOrder ?? ['isrc', 'basic'],
            score = this.defaults.score ?? 90,
            allowNoMatch = true,
        } = stageConfig;
        
        let results: SongViewDetailedMS;
        const queries: LifecycleInput[] = [];

        for(const searchType of searchOrder) {
            try {
                switch(searchType) {
                    case 'isrc':
                        results = await this.searchByIsrc(play, stageConfig, opts);
                        break;
                    case 'artist':
                        results = await this.searchByArtist(play, stageConfig, opts);
                        break;
                    case 'basic':
                        results = await this.searchByBasicFields(play, stageConfig, opts);
                        break;
                    case 'basicorids':
                        results = await this.searchByBasicFieldsOrIDs(play, stageConfig, opts);
                        break;
                    case 'mbid':
                        results = await this.searchByRecordingMbid(play, stageConfig, opts);
                        break;
                }
                queries.push({type: `rsQuery-${searchType}${results.matches.length === 0 ? '-resultButNoMatch'  : ''}`, input: results.requestQuery});
                if((results.matches ?? []).length === 0 && !allowNoMatch) {
                    this.logger.debug(`'${searchType}' search type returned result but no matches`);
                    continue;
                }
                if((results.matches ?? []).length > 0 && !results.matches.some(x => x.score >= score)) {
                    this.logger.debug(`'${searchType}' search type returned no matches with score >= ${score}`);
                    continue;
                }
                break;
            } catch (e) {
                if(e instanceof SearchPrerequisiteError) {
                    queries.push({type: `rsQuery-${searchType}-prereqFailure`, input: `Search type ${searchType} did not meet prerequesites: ${e.message}`});
                    this.logger.debug(`Search type ${searchType} did not meet prerequesites: ${e.message}`);
                } else {
                    if(e instanceof RockskyError && e.status === 500) {
                        // thrown when there is no match? don't like that
                        queries.push({type: `rsQuery-${searchType}-empty`, input: 'requestQuery' in e ? (e.requestQuery as string) : undefined});
                        continue;
                    }
                    // we should be catching any unrecoverable errors in api calls
                    // so we should only get here if something truly bad has happened
                    // and we probably don't want to try additional api calls
                    throw new StageTransformError('Search Error', 'Unexpected error occurred while getting Rocksky song matches', {cause: e, inputs: queries});
                }
            }
        }

        return {...(results ?? {requestQuery: undefined}), requestQueries: queries};
    }

    public async searchByBasicFields(play: PlayObject, stageConfig: RockskyTransformerDataStage, opts: OptionalCacheUsage = {}): Promise<SongViewDetailedMS> {
        this.logger.debug({ labels: ['Basic Search'] }, 'Searching by artist/album/track');
        const requestQuery = JSON.stringify({
            title: play.data.track,
            artitst: artistCreditsToNames(play.data.artists).join(', '),
            album: play.data.album
        });
        try {
            const res = await this.api.rsProxy.matchSong(play.data.track, artistCreditsToNames(play.data.artists).join(', '), undefined, undefined, play.data.album);
            return {
                requestQuery,
                ...res
            };
        } catch (e) {
            e.requestQuery = requestQuery;
            throw e;
        }
    }

    public async searchByBasicFieldsOrIDs(play: PlayObject, stageConfig: RockskyTransformerDataStage, opts: OptionalCacheUsage = {}): Promise<SongViewDetailedMS> {
        const using: UsingTypes[] = [];
        const {
            data: {
                meta: {
                    brainz = {}
                } = {}
            } = {}
        } = play;

        if(brainz.recording !== undefined) {
            using.push('mbidrecording');
        } else {
            using.push('title');
        }
        using.push('album');
        using.push('artist');
        if(play.data.isrc) {
            using.push('isrc');
        }

        this.logger.debug({labels: ['Basic Or MBID Search']}, `Searching using ${using.join(', ')}}`);
        const requestQuery = JSON.stringify({
            title: play.data.track,
            artitst: artistCreditsToNames(play.data.artists).join(', '),
            album: play.data.album,
            mbid: brainz.recording
        });
        try {
            const res = await this.api.rsProxy.matchSong(play.data.track, artistCreditsToNames(play.data.artists).join(', '), brainz.recording, play.data.isrc, play.data.album);
            return {
                requestQuery,
                ...res
            };
        } catch (e) {
            e.requestQuery = requestQuery;
            throw e;
        }
    }

    public async searchByIsrc(play: PlayObject, stageConfig: RockskyTransformerDataStage, opts: OptionalCacheUsage = {}): Promise<SongViewDetailedMS> {
        if(play.data.isrc !== undefined) {
            this.logger.debug({labels: ['ISRC Search']},'Searching with ISRC');
            const requestQuery =JSON.stringify({
                title: play.data.track,
                artitst: artistCreditsToNames(play.data.artists).join(', '),
                isrc: play.data.isrc
            });
            try{
                const res = await this.api.rsProxy.matchSong(play.data.track, artistCreditsToNames(play.data.artists).join(', '), undefined, play.data.isrc);
                return {
                    requestQuery,
                    ...res
                };
            } catch (e) {
                e.requestQuery = requestQuery;
                throw e;
            }
        }
        throw new SearchPrerequisiteError('Play does not have ISRC');
    }

    public async searchByRecordingMbid(play: PlayObject, stageConfig: RockskyTransformerDataStage, opts: OptionalCacheUsage = {}): Promise<SongViewDetailedMS> {
        if(play.data.meta?.brainz?.recording !== undefined) {
            this.logger.debug({labels: ['MBID Search']},'Searching with Recording MBID');
            const requestQuery = JSON.stringify({
                title: play.data.track,
                artitst: artistCreditsToNames(play.data.artists).join(', '),
                mbid: play.data.meta?.brainz?.recording
            });
            try {
                const res = await this.api.rsProxy.matchSong(play.data.track, artistCreditsToNames(play.data.artists).join(', '), play.data.meta?.brainz?.recording, undefined, undefined);
                return {
                    requestQuery,
                    ...res
                };
            } catch (e) {
                e.requestQuery = requestQuery;
                throw e;
            }
        }
        throw new SearchPrerequisiteError('Play does not have recording MBID');
    }

    public async searchByArtist(play: PlayObject, stageConfig: RockskyTransformerDataStage, opts: OptionalCacheUsage = {}): Promise<SongViewDetailedMS> {
        const {
            searchArtistMethod = this.defaults.searchArtistMethod,
        } = stageConfig;
            // if only one artist
            // then its likely artist string is combined
            if(play.data.artists !== undefined && play.data.artists.length === 1) {

                if(searchArtistMethod === 'naive') {
                    // try a naive split using any common delimiter found and use the first value as artist
                    // -- this will likely result in a less accurate match but at least it might find something
                    // -- usually the "primary artist" is listed first in a combined artist string so cross your fingers this works
                    const naiveSplit = splitByFirstRegexFound(play.data.artists[0], [play.data.artists[0]]).map(x => x.trim());
                    if(naiveSplit.length > 1) {
                        this.logger.debug({labels: ['Parsed Artist Search']},'Searching with track + first value from artist string split');
                        const requestQuery = JSON.stringify({
                            title: play.data.track,
                            artitst: naiveSplit[0],
                        });
                        try {
                            const res = await this.api.rsProxy.matchSong(play.data.track, naiveSplit[0]);
                            return {
                                requestQuery,
                                ...res
                            };
                        } catch (e) {
                            e.requestQuery = requestQuery;
                            throw e;
                        }
                    } else {
                        throw new SearchPrerequisiteError('Naive parsing did not produce multiple artists');
                    }
                } else if(searchArtistMethod === 'native') {
                    // use MS native parsing to extract artists from artist string and title
                    // -- cleaning title is aggressive but at this point MB has not found anything which means its likely not "proper"
                    // IE "My Track (Cool Remix)" is a proper recording name but "My Track (feat. Someone)" is not bc MB would have removed the joiner from the name
                    // so we do the same to hopefully get a match
                    //
                    // ...additionally, since MB hasn't found anything with single artist string its likely the artist name does not have a common delimiter as part of their proper name
                    // IE "Crosby, Stills, Nash & Young" is a proper artist name with delimiters included but "My Artist & My Feat Artists" is not
                    // so we split out all artists by all found delimiters
                    const nativePlay = nativeParse(play, {titleClean: true, delimiters: DELIMITERS});
                    this.logger.debug({labels: ['Parsed Artist Search']},'Searching with aggressive native parsing');
                    const requestQuery = JSON.stringify({
                        title: nativePlay.data.track,
                        artitst: artistCreditsToNames(nativePlay.data.artists).join(', '),
                    });
                    try {
                        const res = await this.api.rsProxy.matchSong(nativePlay.data.track, artistCreditsToNames(nativePlay.data.artists).join(', '));
                        return {
                            requestQuery,
                            ...res
                        };
                    } catch(e) {
                        e.requestQuery = requestQuery;
                        throw e; 
                    }
                }
            }

            if(play.data.artists === undefined) {
                throw new SearchPrerequisiteError('Play does not have any artists');
            }
            if(play.data.artists.length > 1) {
                throw new SearchPrerequisiteError('Play has more than one artist already');
            }
    }

    public async handlePostFetch(play: PlayObject, transformData: SongViewDetailedMS, stageConfig: RockskyTransformerDataStage): Promise<PlayObject> {
        const {
            score = this.defaults.score ?? 90,
            allowNoMatch = true,
        } = stageConfig;
        // if all searches fail prereqs then no recording lists are assigned to results
        if(transformData === undefined) {
            throw new StagePrerequisiteError('All search prerequisites failed, Rocksky API could not be searched with the given searchOrder options',
                {
                    shortStack: true,
                    inputs: transformData.requestQueries
                });
        }
        if((transformData.matches ?? []).length === 0 && !allowNoMatch) {
            throw new StagePrerequisiteError('No matches returned from Rocksky API', {shortStack: true, inputs: transformData.requestQueries});
        }

        let filteredList: SongMatchView[] = transformData.matches.filter(x => x.score >= score);
        if(filteredList.length === 0) {
             throw new StagePrerequisiteError(`All ${transformData.matches} candidate matches associated with this match had a score < ${score}, best match was ${transformData.matches[0].score}`, {shortStack: true});
        }
        const mergedConfig = Object.assign({}, removeUndefinedKeys({...this.defaults}), removeUndefinedKeys({...stageConfig}));
        filteredList = rankSongMatchesByPriority(filteredList, mergedConfig, play);

        this.logger.debug(`${filteredList.length} of ${transformData.matches} were valid, filtered matches. Using match with best score of ${filteredList[0].score}`);

        const mergedSongView = {
            ...transformData,
            title: filteredList[0].title ?? transformData.title,
            artist: filteredList[0].artist ?? transformData.artist,
            album: filteredList[0].album ?? transformData.album,
            isrc: filteredList[0].isrc ?? transformData.isrc
        };

        const songViewPlay = songViewToPlay(mergedSongView);
        songViewPlay.meta.lifecycleInputs = [...(songViewPlay.meta.lifecycleInputs ?? []), ...(transformData.requestQueries ?? []), {type: 'rockskySongView', input: transformData}];
        return songViewPlay;
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
                    this.logger.debug('When condition for duration not met, returning original duration');
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

const scoreMatchWithPlay = (weights: Pick<RockskyTransformerDataStage, 'albumWeight' | 'titleWeight' | 'artistWeight'>, view: SongMatchView, play: PlayObject): {titleScore, artistScore, albumScore} => {
    let artistScore = 0,
    titleScore = 0,
    albumScore = 0;

    if(weights.artistWeight !== undefined && view.artist !== undefined) {
            const artistRes = comparePlayArtistsNormalized(play, {data: {artists: [{name: view.artist}]}, meta:{}});
            artistScore = artistRes[0] * (weights.artistWeight + (artistRes[1] > 0 ? 0.05 : 0));
    }
    if(weights.titleWeight !== undefined && view.title !== undefined) {
        titleScore = weights.titleWeight === 0 ? 0 : scoreTrackWeightedAndNormalized(play.data.track, view.title, weights.titleWeight, {exact: 0.05, naive: 0.03})[0];
    }
    if(weights.albumWeight !== undefined && view.album !== undefined) {
        albumScore = scoreNormalizedStringsWeighted(play.data.album, view.album, weights.albumWeight, weights.albumWeight !== 0 ? 0.05 : 0);
    }

    return {artistScore, titleScore, albumScore};
}

export const rankSongMatchesByPriority = (list: SongMatchView[], stageConfig: RockskyTransformerDataStage, play: PlayObject, logger: MaybeLogger = new MaybeLogger()): SongMatchView[] => {
        const {
        albumWeight = 0,
        titleWeight = 0,
        artistWeight = 0
    } = stageConfig;

    // reverse order so that "highest" priority (first in user list) ends up with the highest index, that we use as score

    const cList = clone(list) as SongMatchView[];
    cList.sort((a, b) => {
        const aScores = scoreMatchWithPlay({albumWeight, titleWeight, artistWeight}, a, play);
        const bScores = scoreMatchWithPlay({albumWeight, titleWeight, artistWeight}, b, play);
        return (bScores.albumScore + bScores.artistScore + bScores.titleScore) - (aScores.albumScore + aScores.artistScore + aScores.titleScore);
    })
    return cList;
};

export const DEFAULTS_NATIVE: RockskyTransformerData = {
    "searchArtistMethod": "native",
    "searchOrder": ["artist"]
}

export const DEFAULTS_FIELDS_BIAS = {
    "titleWeight": 0.33,
    "albumWeight": 0.33,
    "artistWeight": 0.33
}

export const DEFAULTS_PRESET: RockskyTransformerData = {
    "searchOrder": ["isrc", "basic"]
}

export const DEFAULTS_ID: RockskyTransformerData = {
    "searchOrder": ["isrc", "mbid", "basicorids", "basic"]
};

const PRESETS: Record<string, RockskyTransformerData> = {
    default: DEFAULTS_PRESET,
    sensible: DEFAULTS_ID,
    native: DEFAULTS_NATIVE,
    fields: {...DEFAULTS_FIELDS_BIAS, ...DEFAULTS_PRESET},
    'id': DEFAULTS_ID
}

export const configFromEnv = (logger: MaybeLogger = new MaybeLogger()) => {
    const rsEnv = process.env.RS_PRESETS;
    let rsConfig: RockskyTransformerConfig;
    if (rsEnv !== undefined && rsEnv.trim() !== '') {
        rsConfig = {
            type: 'rocksky',
            name: 'MSRockskyDefault',
        data: {
                apis: [
                    {
                        enable: true
                    }
                ]
            },
            defaults: {

            }
        }
        const presets = rsEnv.split(',').map(x => x.trim().toLocaleLowerCase());
        const soSet = new Set<SearchType>();
        for (const pName of presets) {
            const p = PRESETS[pName];
            if(p === undefined) {
                logger.warn(`No preset with name '${p}'`);
                continue;
            }
            const { searchOrder = [], ...rest } = p;
            rsConfig.defaults = {
                ...rsConfig.defaults,
                ...rest,
            }
            for (const o of searchOrder) {
                soSet.add(o);
            }
        }
        
        if(soSet.size > 0) {
            rsConfig.defaults.searchOrder = Array.from(soSet);
        }
        logger.debug(`Using presets: ${presets.join(',')}`);
    }

    return rsConfig;
}

export class SearchPrerequisiteError extends SimpleError {
    name = 'Search Prerequistie Failure';
}