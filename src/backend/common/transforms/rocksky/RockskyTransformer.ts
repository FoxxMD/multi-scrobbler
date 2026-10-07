import { type Credit, DEFAULT_ROCKSKY_MISSING_TYPES, type LifecycleInput, type OptionalCacheUsage, type PlayObject, type RockskyMissingField, type TrackMetaIsrc } from "../../../../core/Atomic.ts";
import { isWhenCondition } from "../../../utils/PlayTransformUtils.ts";
import type {WebhookPayload} from "../../infrastructure/config/health/webhooks.ts";
import type {ExternalMetadataTerm, PlayTransformMetadataStage} from "../../../../core/Transform.ts";
import AtomicPartsTransformer from "../AtomicPartsTransformer.ts";
import { creditMbid, type CreditRules, creditsToNames, nameToCredit, resolveCredit, resolveCredits, serviceMeta, withImage } from "../../../../core/MusicMetadata.ts";
import type {TransformerOptions} from "../AbstractTransformer.ts";
import { DELIMITERS } from '../../../../core/Atomic.ts';
import { MaybeLogger } from '../../MaybeLogger.ts';
import { childLogger } from "@foxxmd/logging";
import { type UsingTypes } from "../../vendor/musicbrainz/MusicbrainzApiClientPool.ts";
import { difference } from "../../../utils.ts";
import { SimpleError, SkipTransformStageError, StagePrerequisiteError, StageTransformError } from "../../errors/MSErrors.ts";
import type { Cacheable } from "cacheable";
import { compareNormalizedStrings, splitByFirstRegexFound } from "../../../../core/StringUtils.ts";
import { creditToName } from "../../../../core/MusicMetadata.ts";
import { nativeParse } from "../NativeTransformer.ts";
import { hasRequiredScrobbleFields, hasScrobbleConfidenceFields, type SongViewDetailedMS, songViewToPlay } from "../../vendor/RockSkyApiClient.ts";
import { type AlbumViewBasic, type ArtistViewBasic, RockskyError, type SongMatchView } from "@rocksky/sdk";
import { RockskyClientPool } from "../../vendor/rocksky/RockskyClientWrapped.ts";
import type { RockskyTransformerConfig, RockskyTransformerData } from "../../vendor/rocksky/interfaces.ts";
import { DEFAULT_ROCKSKY_SEARCH_ORDER, type SearchType, searchType } from "./RockskyTransformerUtil.ts";
import type { MetadataProvider } from "../../metadataProviders/MetadataProviderUtils.ts";
import type { AlbumSearchResult, ArtistSearchResult, TrackSearchResult } from "../../../../core/Api.ts";

export const DEFAULT_SEARCHTYPE_ORDER: SearchType[] = ['isrc','basic'];

export interface RockskyTransformerDataStrong extends RockskyTransformerData {
    searchWhenMissing: RockskyMissingField[]
}

export interface RockskyTransformerDataStage extends RockskyTransformerDataStrong,PlayTransformMetadataStage {
}

export const parseStageConfig = (data: RockskyTransformerData | undefined = {}, logger: MaybeLogger = new MaybeLogger()): RockskyTransformerDataStrong => {

    if (data === null || typeof data !== 'object') {
        throw new Error('Musicbrainz Transformer data should be an object or not defined.');
    }

    const {
        searchWhenMissing,
        searchArtistMethod,
        searchOrder = [],
        ...rest
    } = data;

    const config: RockskyTransformerDataStrong = {
        searchWhenMissing: DEFAULT_ROCKSKY_MISSING_TYPES,
        score: 90,
        ...rest,
    };

    if(searchWhenMissing !== undefined) {
        config.searchWhenMissing = DEFAULT_ROCKSKY_MISSING_TYPES;
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

    return config;
}

export default class RockskyTransformer extends AtomicPartsTransformer<ExternalMetadataTerm, PlayObject, RockskyTransformerDataStage> implements MetadataProvider {

    declare config: RockskyTransformerConfig;

    protected defaults!: RockskyTransformerDataStrong;

    protected api!: RockskyClientPool;
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

        this.api = new RockskyClientPool(this.config.name, this.config.data ?? {}, {logger: this.logger, cache: this.clientCache});   
        // new MusicbrainzApiClientPool(this.config.name, {apis: this.config.data.apis}, {
        //     logger: this.logger,
        //     cache: this.clientCache,
        //     logUrl: this.config.options?.logUrl
        // });

        return true;
    }

    protected doParseConfig(data: RockskyTransformerDataStage) {
        if (data.type.toLocaleLowerCase().trim() !== 'rocksky') {
            throw new Error(`Rocksky Transformer is only usable with 'rocksky' type stages`);
        }

        const stage: RockskyTransformerDataStage = {
            ...data,
            ...parseStageConfig(data),
            type: 'rocksky'
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

    public async handlePreFetch(play: PlayObject, stageConfig: RockskyTransformerDataStage): Promise<void> {
        const {
            searchWhenMissing = this.defaults.searchWhenMissing,
            forceSearch = this.defaults.forceSearch ?? false,
        } = stageConfig;

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
            searchOrder = this.defaults.searchOrder ?? DEFAULT_ROCKSKY_SEARCH_ORDER,
            score = this.defaults.score ?? 90,
            allowNoMatch = true,
        } = stageConfig;
        
        let results: SongViewDetailedMS | undefined;
        const queries: LifecycleInput[] = [];

        for(const searchType of searchOrder) {
            try {
                let searchResult: SongViewDetailedMS | undefined;
                switch(searchType) {
                    case 'isrc':
                        searchResult = await this.searchByIsrc(play, stageConfig, opts);
                        break;
                    case 'artist':
                        searchResult = await this.searchByArtist(play, stageConfig, opts);
                        break;
                    case 'basic':
                        searchResult = await this.searchByBasicFields(play, stageConfig, opts);
                        break;
                    case 'basicorids':
                        searchResult = await this.searchByBasicFieldsOrIDs(play, stageConfig, opts);
                        break;
                    case 'mbid':
                        searchResult = await this.searchByRecordingMbid(play, stageConfig, opts);
                        break;
                }
                if(searchResult === undefined) {
                    this.logger.warn(`Unknown search type '${searchType}'`);
                    continue;
                }
                results = searchResult;
                const matches = results.matches ?? [];
                queries.push({type: `rsQuery-${searchType}${matches.length === 0 ? '-resultButNoMatch'  : ''}`, input: results.requestQuery});
                if(matches.length === 0 && !allowNoMatch) {
                    this.logger.debug(`'${searchType}' search type returned result but no matches`);
                    continue;
                }
                if(matches.length > 0 && !matches.some(x => x.score !== undefined && x.score >= score)) {
                    this.logger.debug(`'${searchType}' search type returned no matches with score >= ${score}`);
                    continue;
                }
                break;
            } catch (e) {
                if(e instanceof SearchPrerequisiteError) {
                    queries.push({type: `rsQuery-${searchType}-prereqFailure`, input: `Search type ${searchType} did not meet prerequesites: ${e.message}`});
                    this.logger.debug(`Search type ${searchType} did not meet prerequesites: ${e.message}`);
                } else {
                    if(isNoMatchError(e)) {
                        // thrown when there is no match? don't like that
                        queries.push({type: `rsQuery-${searchType}-empty`, input: 'requestQuery' in e ? (e.requestQuery as string) : ''});
                        continue;
                    }
                    // we should be catching any unrecoverable errors in api calls
                    // so we should only get here if something truly bad has happened
                    // and we probably don't want to try additional api calls
                    throw new StageTransformError('Search Error', 'Unexpected error occurred while getting Rocksky song matches', {cause: e, inputs: queries});
                }
            }
        }

        return {...(results ?? {requestQuery: undefined}), requestQueries: queries} as SongViewDetailedMS;
    }

    public async searchByBasicFields(play: PlayObject, stageConfig: RockskyTransformerDataStage, opts: OptionalCacheUsage = {}): Promise<SongViewDetailedMS> {
        this.logger.debug({ labels: ['Basic Search'] }, 'Searching by artist/album/track');
        const requestQuery = JSON.stringify({
            title: creditToName(play.data.track),
            artitst: creditsToNames(play.data.artists).join(', '),
            album: creditToName(play.data.album)
        });
        try {
            const res = await this.api.rsProxy.matchSong(requireTrack(play), creditsToNames(play.data.artists).join(', '), undefined, undefined, creditToName(play.data.album));
            return {
                requestQuery,
                ...res
            };
        } catch (e: any) {
            e.requestQuery = requestQuery;
            throw e;
        }
    }

    public async searchByBasicFieldsOrIDs(play: PlayObject, stageConfig: RockskyTransformerDataStage, opts: OptionalCacheUsage = {}): Promise<SongViewDetailedMS> {
        const using: UsingTypes[] = [];
        const recordingMbid = creditMbid(play.data.track, 'recording');

        if(recordingMbid !== undefined) {
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
            title: creditToName(play.data.track),
            artitst: creditsToNames(play.data.artists).join(', '),
            album: creditToName(play.data.album),
            mbid: recordingMbid
        });
        try {
            const res = await this.api.rsProxy.matchSong(requireTrack(play), creditsToNames(play.data.artists).join(', '), recordingMbid, play.data.isrc, creditToName(play.data.album));
            return {
                requestQuery,
                ...res
            };
        } catch (e: any) {
            e.requestQuery = requestQuery;
            throw e;
        }
    }

    public async searchByIsrc(play: PlayObject, stageConfig: RockskyTransformerDataStage, opts: OptionalCacheUsage = {}): Promise<SongViewDetailedMS> {
        if(play.data.isrc !== undefined) {
            this.logger.debug({labels: ['ISRC Search']},'Searching with ISRC');
            const requestQuery =JSON.stringify({
                title: creditToName(play.data.track),
                artitst: creditsToNames(play.data.artists).join(', '),
                isrc: play.data.isrc
            });
            try{
                const res = await this.api.rsProxy.matchSong(requireTrack(play), creditsToNames(play.data.artists).join(', '), undefined, play.data.isrc);
                return {
                    requestQuery,
                    ...res
                };
            } catch (e: any) {
                e.requestQuery = requestQuery;
                throw e;
            }
        }
        throw new SearchPrerequisiteError('Play does not have ISRC');
    }

    public async searchByRecordingMbid(play: PlayObject, stageConfig: RockskyTransformerDataStage, opts: OptionalCacheUsage = {}): Promise<SongViewDetailedMS> {
        const recordingMbid = creditMbid(play.data.track, 'recording');
        if(recordingMbid !== undefined) {
            this.logger.debug({labels: ['MBID Search']},'Searching with Recording MBID');
            const requestQuery = JSON.stringify({
                title: creditToName(play.data.track),
                artitst: creditsToNames(play.data.artists).join(', '),
                mbid: recordingMbid
            });
            try {
                const res = await this.api.rsProxy.matchSong(requireTrack(play), creditsToNames(play.data.artists).join(', '), recordingMbid, undefined, undefined);
                return {
                    requestQuery,
                    ...res
                };
            } catch (e: any) {
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
        if(play.data.artists === undefined) {
            throw new SearchPrerequisiteError('Play does not have any artists');
        }
        if(play.data.artists.length > 1) {
            throw new SearchPrerequisiteError('Play has more than one artist already');
        }
        if(play.data.artists.length === 0) {
            throw new SearchPrerequisiteError('Play does not have any artists');
        }  
        // if only one artist
        // then its likely artist string is combined
        if(searchArtistMethod === 'naive') {
            // try a naive split using any common delimiter found and use the first value as artist
            // -- this will likely result in a less accurate match but at least it might find something
            // -- usually the "primary artist" is listed first in a combined artist string so cross your fingers this works
            const naiveSplit = splitByFirstRegexFound(play.data.artists[0].name, [play.data.artists[0].name]).map(x => x.trim()); 
            if(naiveSplit.length > 1) {
                this.logger.debug({labels: ['Parsed Artist Search']},'Searching with track + first value from artist string split');
                const requestQuery = JSON.stringify({
                    title: creditToName(play.data.track),
                    artitst: naiveSplit[0],
                });
                try {
                    const res = await this.api.rsProxy.matchSong(requireTrack(play), naiveSplit[0]);
                    return {
                        requestQuery,
                        ...res
                    };
                } catch (e: any) {
                    e.requestQuery = requestQuery;
                    throw e;
                }
            }
            throw new SearchPrerequisiteError('Naive parsing did not produce multiple artists');
        }
        if(searchArtistMethod === 'native') {
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
                title: creditToName(nativePlay.data.track),
                artitst: creditsToNames(nativePlay.data.artists).join(', '),
            });
            try {
                const res = await this.api.rsProxy.matchSong(requireTrack(nativePlay), creditsToNames(nativePlay.data.artists).join(', '));
                return {
                    requestQuery,
                    ...res
                };
            } catch (e: any) {
                e.requestQuery = requestQuery;
                throw e; 
            }
        }
        throw new SearchPrerequisiteError(`Unknown searchArtistMethod '${searchArtistMethod}'`);
    }

    /** Returns candidate matches with a valid score. An empty list is only returned if the song view has no candidates and allowNoMatch is true */
    public async handlePostFetchMatches(transformData: SongViewDetailedMS, stageConfig: RockskyTransformerDataStage): Promise<SongMatchView[]> {
        const {
            score = this.defaults.score ?? 90,
            allowNoMatch = true,
        } = stageConfig;
        // if all searches fail prereqs then no recording lists are assigned to results
        if(transformData === undefined) {
            throw new StagePrerequisiteError('All search prerequisites failed, Rocksky API could not be searched with the given searchOrder options', {shortStack: true});
        }
        const matches = transformData.matches ?? [];
        if(matches.length === 0) {
            if(!allowNoMatch) {
                throw new StagePrerequisiteError('No matches returned from Rocksky API', {shortStack: true, inputs: transformData.requestQueries});
            }
            return [];
        }
        const filteredList: SongMatchView[] = matches.filter(x => x.score !== undefined && x.score >= score);
        if(filteredList.length === 0) {
            throw new StagePrerequisiteError(`All ${matches.length} candidate matches associated with this match had a score < ${score}, best match was ${matches[0].score}`, {shortStack: true});
        }
        //const mergedConfig = Object.assign({}, removeUndefinedKeys({...this.defaults}), removeUndefinedKeys({...stageConfig}));
        //filteredList = rankSongMatchesByPriority(filteredList, mergedConfig, play);

        return filteredList;
    }

    public async handlePostFetch(play: PlayObject, transformData: SongViewDetailedMS, stageConfig: RockskyTransformerDataStage): Promise<PlayObject> {
        const matches = await this.handlePostFetchMatches(transformData, stageConfig);
        let mergedSongView: SongViewDetailedMS = transformData;
        if(matches.length > 0) {
            this.logger.debug(`${matches.length} of ${(transformData.matches ?? []).length} were valid, filtered matches. Using match with best score of ${matches[0].score}`);
            mergedSongView = mergeSongMatch(transformData, matches[0]);
        }

        const songViewPlay = songViewToPlay(mergedSongView);
        songViewPlay.meta.lifecycleInputs = [...(songViewPlay.meta.lifecycleInputs ?? []), ...(transformData.requestQueries ?? []), {type: 'rockskySongView', input: transformData}];
        return songViewPlay;
    }

    async getTrackResults(query: string): Promise<TrackSearchResult[] | false> {
        let res: SongViewDetailedMS;
        try {
            // matchSong requires an artist and the sdk drops empty strings, a blank one matches on title only
            res = {requestQuery: query, ...(await this.api.rsProxy.matchSong(query, ' '))};
        } catch (e) {
            // thrown when there is no match
            if(isNoMatchError(e)) {
                return [];
            }
            throw e;
        }
        // match scores are computed against title *and* artist, with no artist given even exact title matches
        // score well below the transform threshold, so rank by score instead of filtering by it
        const matches = await this.handlePostFetchMatches(res, {type: 'rocksky', ...this.defaults, score: 0});

        return matches.slice(0, 5).map((x, index): TrackSearchResult => {
            // the song view only has full metadata (mbids, album artist) for the best match, same as a transform would use
            const view: SongViewDetailedMS = x === res.matches?.[0]
                ? mergeSongMatch(res, x)
                : {requestQuery: query, title: x.title, artist: x.artist, album: x.album, albumArt: x.albumArt, isrc: x.isrc, duration: x.durationMs};
            return {
                ...songViewToPlay(view).data,
                service: 'rocksky',
                id: String(x.id ?? index),
                score: Math.round(x.score ?? 0)
            };
        });
    }

    async getArtistResults(query: string): Promise<ArtistSearchResult[] | false> {
        const hits = await this.searchIndex<ArtistViewBasic>(query, 'artists', x => x.name);
        return hits.map((x): ArtistSearchResult => ({
            ...withImage(nameToCredit(x.name as string, serviceMeta('rocksky', x.id, 'artist')), x.picture),
            score: x.score,
            service: 'rocksky',
            id: x.id as string
        }));
    }

    async getAlbumResults(query: string): Promise<AlbumSearchResult[] | false> {
        const hits = await this.searchIndex<AlbumViewBasic>(query, 'albums', x => x.title);
        return hits.map((x): AlbumSearchResult => ({
            ...withImage(nameToCredit(x.title as string, serviceMeta('rocksky', x.id, 'album')), x.albumArt),
            date: x.releaseDate ?? x.year?.toString(),
            artists: x.artist === undefined ? undefined : [nameToCredit(x.artist)],
            score: x.score,
            service: 'rocksky',
            id: x.id as string
        }));
    }

    /** Rocksky search is one query across all entity types and hits have no score, so keep only hits from the given index and rank by name similarity to the query */
    protected async searchIndex<T extends {id?: string}>(query: string, index: 'artists' | 'albums', getName: (hit: T) => string | undefined): Promise<(T & {score: number})[]> {
        const res = await this.api.rsProxy.search(query);
        // sdk types hits as a union of views but it is a mixed list tagged with the index each hit came from
        const hits = (res.hits ?? []) as unknown as (T & {_federation?: {indexUid?: string}})[];
        return hits
            .filter(x => x._federation?.indexUid === index && x.id !== undefined && getName(x) !== undefined)
            .map(x => ({...x, score: Math.round(Math.min(compareNormalizedStrings(query, getName(x) as string).highScore, 100))}))
            .sort((a, b) => b.score - a.score)
            .slice(0, 5);
    }

    protected override readonly hydratesCredits = true;

    /**
     * rocksky only returns brainz recording mbid right now
     * so check for loss of fidelity or known bad sources before using its metadata
     */
    protected metaTrusted(play: PlayObject): boolean {
        const {track, album, artists = [], albumArtists = []} = play.data;
        const existingMbidTypes = new Set([track, album, ...artists, ...albumArtists]
            .flatMap(x => x?.metadata ?? [])
            .filter(x => x.name === 'musicbrainz')
            .map(x => x.idType));

        // only one (or none) mbids from original so likely no loss of fidelity by only using
        // recording mbid from rocksky
        return play.meta.source === 'lastfm' || existingMbidTypes.size <= 1;
    }

    protected rockskyCreditRules(play: PlayObject, rules: CreditRules, name: boolean): CreditRules {
        return {name: rules.name && name, meta: rules.meta && this.metaTrusted(play), art: rules.art};
    }

    protected async handleTitle(play: PlayObject, parts: ExternalMetadataTerm, transformData: PlayObject, rules: CreditRules): Promise<Credit | undefined> {
        // metadata needs more development on the rocksky side
        // only use it if we have no track information here
        const useName = play.data.track === undefined || play.data.track.name.trim() === '';
        return resolveCredit(play.data.track, transformData.data.track, this.rockskyCreditRules(play, rules, useName));
    }
    protected async handleArtists(play: PlayObject, parts: ExternalMetadataTerm, transformData: PlayObject, rules: CreditRules): Promise<Credit[] | undefined> {
        const existingCount = (play.data.artists ?? []).length;
        // artist data needs development on the rocksky side
        // only use it if we have no artist information here
        // or there is a clear imbalance of fidelity biased *towards* rocksky
        const useNames = !['spotify','listenbrainz','koito','maloja','endpointlz'].includes(play.meta?.source as string)
            && (
                // source provides no artists so anything is better than nothing
                existingCount === 0
                // source provided only one artist but rocksky has real, separated artists
                || (existingCount === 1 && (transformData.data.artists ?? []).length > 1)
            );
        return resolveCredits(play.data.artists, transformData.data.artists, this.rockskyCreditRules(play, rules, useNames));

        // // try to determine if new artist is a concatenated string of separate artists
        // // using the original artist data
        // if((play.data.artists ?? []).length > 1 && (transformData.data.artists ?? []).length === 1) {
        //     // possible our original data is more accurate
        //     // or is the same set of artists but in a nice list instead of a single string.
        //     // if this is the case then keep the original so we don't lose fidelity

        //     // since we aren't using MB mappings we should be conservative and assume artist string with & are proper names (not joiner)
        //     const parsed = parseArtistCredits(transformData.data.artists[0].name, [',', '/', '\\']);
        //     if(parsed !== undefined) {
        //         let parsedCredits: Credit[] = [{name: parsed.primary}];
        //         if(parsed.secondary !== undefined) {
        //             parsedCredits = parsedCredits.concat(parsed.secondary.map(x => ({name: x})));
        //         }
        //         const [score, wholeMatches] = compareArtistCreditsNormalized(play.data.artists, parsedCredits);
        //         if(score > 90) {
        //             // enough confidence to say artists are the same as the original
        //             return play.data.artists;
        //         }
        //     }
        // }

        // return transformData.data.artists;
    }
    protected async handleAlbumArtists(play: PlayObject, parts: ExternalMetadataTerm, transformData: PlayObject, rules: CreditRules): Promise<Credit[] | undefined> {
        // metadata needs more development on the rocksky side
        // it does not separate albumArtists into individual entities at all, at the moment
        // so don't use albumArtists names at all, for now
        return resolveCredits(play.data.albumArtists, transformData.data.albumArtists, this.rockskyCreditRules(play, rules, false));
    }
    protected async handleAlbum(play: PlayObject, parts: ExternalMetadataTerm, transformData: PlayObject, rules: CreditRules): Promise<Credit | undefined> {
        // metadata needs more development on the rocksky side
        // only use it if we have no album information here
        const useName = play.data.album === undefined || play.data.album.name.trim() === '';
        return resolveCredit(play.data.album, transformData.data.album, this.rockskyCreditRules(play, rules, useName));
    }
    protected async handleDuration(play: PlayObject, parts: ExternalMetadataTerm, transformData: PlayObject): Promise<number | undefined> {
        return transformData.data.duration ?? play.data.duration;
    }
    protected async handleMeta(play: PlayObject, parts: ExternalMetadataTerm, transformData: PlayObject): Promise<TrackMetaIsrc | undefined> {
        return this.metaTrusted(play) ? transformData.data.meta : undefined;
    }

    public async notify(payload: WebhookPayload): Promise<void> {
    }

}

// const scoreMatchWithPlay = (weights: Pick<RockskyTransformerDataStage, 'albumWeight' | 'titleWeight' | 'artistWeight'>, view: SongMatchView, play: PlayObject): {titleScore, artistScore, albumScore} => {
//     let artistScore = 0,
//     titleScore = 0,
//     albumScore = 0;

//     if(weights.artistWeight !== undefined && view.artist !== undefined) {
//             const artistRes = comparePlayArtistsNormalized(play, {data: {artists: [{name: view.artist}]}, meta:{}});
//             artistScore = artistRes[0] * (weights.artistWeight + (artistRes[1] > 0 ? 0.05 : 0));
//     }
//     if(weights.titleWeight !== undefined && view.title !== undefined) {
//         titleScore = weights.titleWeight === 0 ? 0 : scoreTrackWeightedAndNormalized(play.data.track, view.title, weights.titleWeight, {exact: 0.05, naive: 0.03})[0];
//     }
//     if(weights.albumWeight !== undefined && view.album !== undefined) {
//         albumScore = scoreNormalizedStringsWeighted(play.data.album, view.album, weights.albumWeight, weights.albumWeight !== 0 ? 0.05 : 0);
//     }

//     return {artistScore, titleScore, albumScore};
// }

// export const rankSongMatchesByPriority = (list: SongMatchView[], stageConfig: RockskyTransformerDataStage, play: PlayObject, logger: MaybeLogger = new MaybeLogger()): SongMatchView[] => {
//         const {
//         albumWeight = 0,
//         titleWeight = 0,
//         artistWeight = 0
//     } = stageConfig;

//     // reverse order so that "highest" priority (first in user list) ends up with the highest index, that we use as score

//     const cList = clone(list) as SongMatchView[];
//     cList.sort((a, b) => {
//         const aScores = scoreMatchWithPlay({albumWeight, titleWeight, artistWeight}, a, play);
//         const bScores = scoreMatchWithPlay({albumWeight, titleWeight, artistWeight}, b, play);
//         return (bScores.albumScore + bScores.artistScore + bScores.titleScore) - (aScores.albumScore + aScores.artistScore + aScores.titleScore);
//     })
//     return cList;
// };

export class SearchPrerequisiteError extends SimpleError {
    name = 'Search Prerequistie Failure';
}

// api has signalled no match with a 500 and, more recently, a 400 NotFound
const isNoMatchError = (e: unknown): e is RockskyError => e instanceof RockskyError && (e.status === 500 || e.kind === 'NotFound');

const mergeSongMatch = (view: SongViewDetailedMS, match: SongMatchView): SongViewDetailedMS => ({
    ...view,
    title: match.title ?? view.title,
    artist: match.artist ?? view.artist,
    album: match.album ?? view.album,
    isrc: match.isrc ?? view.isrc
});

const requireTrack = (play: PlayObject): string => {
    if(play.data.track === undefined) {
        throw new SearchPrerequisiteError('Play does not have a track title');
    }
    return play.data.track.name;
}
