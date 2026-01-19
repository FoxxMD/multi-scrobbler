import { asMBReleasePrimaryGroupType, asMBReleaseSecondaryGroupType, asMBReleaseStatus, DEFAULT_MISSING_TYPES, isMBReleasePrimaryGroupType, MBReleaseGroupPrimaryType, MBReleaseGroupSecondaryType, MBReleaseStatus, MissingMbidType, PlayObject, TrackMeta, TransformerCommon, TransformOptions } from "../../../core/Atomic.js";
import { isWhenCondition, testWhenConditions } from "../../utils/PlayTransformUtils.js";
import { WebhookPayload } from "../infrastructure/config/health/webhooks.js";
import { ExternalMetadataTerm, PlayTransformMetadataStage } from "../infrastructure/Transform.js";
import AtomicPartsTransformer from "./AtomicPartsTransformer.js";
import { TransformerOptions } from "./AbstractTransformer.js";
import { ARTIST_WEIGHT, DELIMITERS, MUSICBRAINZ_URL, MusicbrainzApiConfigData, TITLE_WEIGHT } from "../infrastructure/Atomic.js";
import { MaybeLogger } from "../logging.js";
import { childLogger, Logger } from "@foxxmd/logging";
import { MusicbrainzApiClient, MusicbrainzApiConfig, recordingToPlay, UsingTypes } from "../vendor/musicbrainz/MusicbrainzApiClient.js";
import { IRecordingList, IRecordingMatch, IRelease, MusicBrainzApi } from "musicbrainz-api";
import { intersect, isDebugMode, missingMbidTypes, removeUndefinedKeys } from "../../utils.js";
import { SimpleError, SkipTransformStageError, StagePrerequisiteError } from "../errors/MSErrors.js";
import { parseArrayFromMaybeString, scoreNormalizedStringsWeighted } from "../../utils/StringUtils.js";
import clone from "clone";
import { Cacheable } from "cacheable";
import { splitByFirstRegexFound } from "../../../core/StringUtils.js";
import { nativeParse } from "./NativeTransformer.js";
import { comparePlayArtistsNormalized, scoreTrackWeightedAndNormalized } from "../../utils/PlayComparisonUtils.js";

export const asMissingMbid = (str: string): MissingMbidType => {
    const clean = str.trim().toLocaleLowerCase();
    switch(clean) {
        case 'track':
        case 'title':
            return 'title';
        case 'artist':
        case 'artists':
            return 'artists';
        case 'album':
            return 'album';
        case 'duration':
            return 'duration'
    }
    throw new Error(`MissingMbidType must be one of 'artist' or 'title' or 'album' or 'duration', given: ${clean}`);
}

export const asSearchType = (str: string): SearchType => {
    const clean = str.trim().toLocaleLowerCase();
    switch(clean) {
        case 'artist':
        case 'artists':
            return 'artist';
        case 'album':
            return 'album';
        case 'freetext':
            return 'freetext';
        case 'basic':
            return 'basic';
        case 'isrc':
            return 'isrc';
        case 'mbidrecording':
            return 'mbidrecording';
        case 'basicorid':
        case 'basicorids':
            return 'basicorids';
    }
    throw new Error(`SearchType must be one of 'freetext' | 'album' | 'artist' | 'basic' | 'basicOrids' | 'isrc' | 'mbidRecording' -- given: ${clean}`);
}

export type SearchType = 'freetext' | 'album' | 'artist' | 'basic' | 'basicorids' | 'isrc' | 'mbidrecording';

export const DEFAULT_SEARCHTYPE_ORDER: SearchType[] = ['isrc','basic'];

export interface MusicbrainzTransformerData {
    searchWhenMissing?: MissingMbidType[]
    forceSearch?: boolean
    score?: number
    fallbackArtistSearch?: ('naive' | 'native')
    fallbackFreeText?: boolean
    fallbackAlbumSearch?: boolean
    logPreMbid?: boolean
    searchOrder?: SearchType[]
    searchArtistMethod?: ('naive' | 'native')

    /** Ignore album artist if it is "Various Artists"
     * 
     * @default true
     */
    ignoreVA?: boolean
    
    /** Allow only releases with release groups with these primary types 
     * 
     * @see https://wiki.musicbrainz.org/Release_Group/Type#Primary_types
    */
    releaseGroupPrimaryTypeAllow?: string[]
    /** Filter out any releases with release groups with these primary types 
     * 
     * @see https://wiki.musicbrainz.org/Release_Group/Type#Primary_types
    */
    releaseGroupPrimaryTypeDeny?: string[]
   /** Prioritise releases to use based on the order of these release group types
     * 
     * @see https://wiki.musicbrainz.org/Release_Group/Type#Primary_types
    */
    releaseGroupPrimaryTypePriority?: string[]

    /** Allow only releases with release groups with these secondary types 
     * 
     * @see https://wiki.musicbrainz.org/Release_Group/Type#Secondary_types
    */
    releaseGroupSecondaryTypeAllow?: string[]
    /** Filter out any releases with release groups with these secondary types 
     * 
     * @see https://wiki.musicbrainz.org/Release_Group/Type#Secondary_types
    */
    releaseGroupSecondaryTypeDeny?: string[]
    /** Prioritise releases to use based on the order of these release group secondary types
     * 
     * @see https://wiki.musicbrainz.org/Release_Group/Type#Secondary_types
    */
    releaseGroupSecondaryTypePriority?: string[]

    /** Allow only releases with these statuses
     * 
     * @see https://wiki.musicbrainz.org/Release#Status
    */
    releaseStatusAllow?: string[]
    /** Filter out any releases with these statuses
     * 
     * @see https://wiki.musicbrainz.org/Release#Status
    */
    releaseStatusDeny?: string[]
    /** Prioritise releases to used based on the order of these statuses
     * 
     * @see https://wiki.musicbrainz.org/Release#Status
    */
    releaseStatusPriority?: string[]

        /** Allow only releases from these ISO2 countries
     * 
     * @see https://beta.musicbrainz.org/doc/Release/Country
    */
    releaseCountryAllow?: string[]
    /** Filter out any releases rom these ISO2 countries
     * 
     * @see https://beta.musicbrainz.org/doc/Release/Country
    */
    releaseCountryDeny?: string[]
    /** Prioritise releases to used based on the order of these ISO2 countries
     * 
     * @see https://beta.musicbrainz.org/doc/Release/Country
    */
    releaseCountryPriority?: string[]

    /** Do not filter out a recording if it initially has no releases
     * 
     * Use in conjunction with release filters by setting to `true`
     * to prevent recordings from being filtered out solely becauase they don't have any releases to begin with
     * 
     */
    releaseAllowEmpty?: boolean

    titleWeight?: number | true
    artistWeight?: number | true
    albumWeight?: number | true
}

export interface MusicbrainzTransformerDataStrong extends MusicbrainzTransformerData {
    searchWhenMissing: MissingMbidType[]

    releaseGroupPrimaryTypeAllow?: MBReleaseGroupPrimaryType[]
    releaseGroupPrimaryTypeDeny?: MBReleaseGroupPrimaryType[]
    releaseGroupPrimaryTypePriority?: MBReleaseGroupPrimaryType[]

    releaseGroupSecondaryTypeAllow?: MBReleaseGroupSecondaryType[]
    releaseGroupSecondaryTypeDeny?: MBReleaseGroupSecondaryType[]
    releaseGroupSecondaryTypePriority?: MBReleaseGroupSecondaryType[]

    releaseStatusAllow?: MBReleaseStatus[]
    releaseStatusDeny?: MBReleaseStatus[]
    releaseStatusPriority?: MBReleaseStatus[]

    titleWeight?: number
    artistWeight?: number
    albumWeight?: number
}

export interface MusicbrainzTransformerDataStage extends MusicbrainzTransformerDataStrong,PlayTransformMetadataStage {
}

export interface MusicbrainzTransformerDataConfig {
    apis: MusicbrainzApiConfigData[]
}

export type MusicbrainzBestMatch = {play: PlayObject, score: number};

export type MusicbrainzTransformerConfig = TransformerCommon<MusicbrainzTransformerData, MusicbrainzTransformerDataConfig> & {options?: TransformOptions & {logUrl?: boolean}}

export type RecordingRankedMatched = IRecordingMatch & {rankScore?: number, artistScore?: number, titleScore?: number, albumScore?: number}

export interface IRecordingMSList extends IRecordingList {
    recordings: RecordingRankedMatched[]
    freeText?: boolean
}

export const parseStageConfig = (data: MusicbrainzTransformerData | undefined = {}, logger: MaybeLogger = new MaybeLogger()): MusicbrainzTransformerDataStrong => {

    if (data === null || typeof data !== 'object') {
        throw new Error('Musicbrainz Transformer data should be an object or not defined.');
    }

    const {
        releaseGroupPrimaryTypeAllow,
        releaseGroupPrimaryTypeDeny,
        releaseGroupPrimaryTypePriority,
        releaseGroupSecondaryTypeAllow,
        releaseGroupSecondaryTypeDeny,
        releaseGroupSecondaryTypePriority,
        releaseStatusAllow,
        releaseStatusDeny,
        releaseStatusPriority,
        releaseCountryAllow,
        releaseCountryDeny,
        releaseCountryPriority,

        searchWhenMissing,
        fallbackArtistSearch,
        searchArtistMethod,
        fallbackFreeText,
        fallbackAlbumSearch,
        searchOrder = [],
        titleWeight,
        albumWeight,
        artistWeight,
        ...rest
    } = data;

    const config: MusicbrainzTransformerDataStrong = {
        searchWhenMissing: DEFAULT_MISSING_TYPES,
        score: 90,

        releaseGroupPrimaryTypeAllow: releaseGroupPrimaryTypeAllow !== undefined ? parseArrayFromMaybeString(releaseGroupPrimaryTypeAllow, {lower: true}).map(asMBReleasePrimaryGroupType) : undefined,
        releaseGroupPrimaryTypeDeny: releaseGroupPrimaryTypeDeny !== undefined  ?parseArrayFromMaybeString(releaseGroupPrimaryTypeDeny, {lower: true}).map(asMBReleasePrimaryGroupType) : undefined,
        releaseGroupPrimaryTypePriority: releaseGroupPrimaryTypePriority !== undefined ? parseArrayFromMaybeString(releaseGroupPrimaryTypePriority, {lower: true}).map(asMBReleasePrimaryGroupType) : undefined,

        releaseGroupSecondaryTypeAllow: releaseGroupSecondaryTypeAllow !== undefined ? parseArrayFromMaybeString(releaseGroupSecondaryTypeAllow, {lower: true}).map(asMBReleaseSecondaryGroupType) : undefined,
        releaseGroupSecondaryTypeDeny: releaseGroupSecondaryTypeDeny !== undefined ?  parseArrayFromMaybeString(releaseGroupSecondaryTypeDeny, {lower: true}).map(asMBReleaseSecondaryGroupType) : undefined,
        releaseGroupSecondaryTypePriority: releaseGroupSecondaryTypePriority !== undefined ?  parseArrayFromMaybeString(releaseGroupSecondaryTypePriority, {lower: true}).map(asMBReleaseSecondaryGroupType) : undefined,

        releaseStatusAllow: releaseStatusAllow !== undefined ? parseArrayFromMaybeString(releaseStatusAllow, {lower: true}).map(asMBReleaseStatus) : undefined,
        releaseStatusDeny: releaseStatusDeny !== undefined ?  parseArrayFromMaybeString(releaseStatusDeny, {lower: true}).map(asMBReleaseStatus) : undefined,
        releaseStatusPriority: releaseStatusPriority !== undefined ? parseArrayFromMaybeString(releaseStatusPriority, {lower: true}).map(asMBReleaseStatus) : undefined,

        releaseCountryAllow: releaseCountryAllow !== undefined ? parseArrayFromMaybeString(releaseCountryAllow, {lower: true}) : undefined,
        releaseCountryDeny:  releaseCountryDeny !== undefined ? parseArrayFromMaybeString(releaseCountryDeny, {lower: true}) : undefined,
        releaseCountryPriority:  releaseCountryPriority !== undefined ? parseArrayFromMaybeString(releaseCountryPriority, {lower: true}) : undefined,
        artistWeight: 0,
        titleWeight: 0,
        albumWeight: 0,

        ...rest,
    };

    if(searchWhenMissing !== undefined) {
        config.searchWhenMissing = searchWhenMissing.map(asMissingMbid);
    }

    logger.debug(`Will search if missing: ${config.searchWhenMissing.join(', ')} | Match if (default) score is >= ${config.score}`);

    let soSet = searchOrder.length > 0 ? new Set<SearchType>(searchOrder.map(asSearchType)) : new Set<SearchType>();
    const depSearch = [];

    // preserve order of search from before searchOrder
    // by adding fallback properties in same order they were in getTransformerData
    if(fallbackAlbumSearch === true) {
        soSet.add('album');
        depSearch.push('fallbackAlbumSearch');
    }

    if(fallbackArtistSearch !== undefined) {
        const cleanFallback = fallbackArtistSearch;
        if(!['native','naive'].includes(cleanFallback)) {
            throw new Error(`fallbackArtistSearch must be one of 'native' or 'naive', given: ${cleanFallback}`);
        }
        config.searchArtistMethod = cleanFallback;
        depSearch.push('fallbackArtistSearch');
        soSet.add('artist');
    }

    if(fallbackFreeText === true) {
        soSet.add('freetext');
        depSearch.push('fallbackFreeText');
    }

    if(depSearch.length > 0) {
        logger.warn(`fallback search options are DEPRECATED and will be removed in a future release. Please switch to 'searchOrder'. See Release 0.11.0 for migrating. Deprecated options used: ${depSearch.join(',')}`);
        if(depSearch.includes('fallbackArtistSearch')){
            logger.warn(`'fallbackArtistSearch' is DEPRECATED and will removed in a future release. Please switch to 'searchOrder' with 'artist', and 'searchArtistMethod' for naive/native. See Release 0.11.0 for migrating.`);
        }
        // preserve order of search from before searchOrder
        // where isrc/basic ran before fallbacks
        // -- only add here if we know any fallbacks were used
        soSet = new Set<SearchType>(['isrc','basic', ...soSet]);
    }

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

export default class MusicbrainzTransformer extends AtomicPartsTransformer<ExternalMetadataTerm, PlayObject, MusicbrainzTransformerDataStage> {

    declare config: MusicbrainzTransformerConfig;

    protected defaults: MusicbrainzTransformerDataStrong;

    protected api: MusicbrainzApiClient;
    protected clientCache?: Cacheable;

    public constructor(config: MusicbrainzTransformerConfig, options: TransformerOptions & {clientCache?: Cacheable}) {
        super(config, options);
        this.clientCache = options.clientCache;
    }

    protected async doBuildInitData(): Promise<true | string | undefined> {
        this.defaults = parseStageConfig(this.config.defaults, childLogger(this.logger, 'Defaults'));

        this.api = new MusicbrainzApiClient(this.config.name, {apis: this.config.data.apis}, {
            logger: this.logger,
            cache: this.clientCache,
            logUrl: this.config.options?.logUrl
        });

        return true;
    }

    protected doParseConfig(data: MusicbrainzTransformerDataStage) {
        if (data.type !== 'musicbrainz') {
            throw new Error(`Musicbrainz Transformer is only usable with 'musicbrinz' type stages`);
        }

        const stage: MusicbrainzTransformerDataStage = {
            ...data,
            ...parseStageConfig(data),
            type: 'musicbrainz'
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

    public async handlePreFetch(play: PlayObject, stageConfig: MusicbrainzTransformerDataStage): Promise<void> {
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

        const missing = missingMbidTypes(play);
        if(intersect(searchWhenMissing, missing).length > 0) {
            this.logger.debug(`Desired MBIDs for ${searchWhenMissing.join(',')} and Play is missing: ${missing.join(', ')}`);
        } else if(forceSearch) {
            this.logger.debug(`All desired MBIDs (${searchWhenMissing.join(',')}) exist but forceSearch = true`);
        } else {
            throw new SkipTransformStageError(`No desired MBIDs (${searchWhenMissing.join(',')}) are missing`, {shortStack: true});
        }
    }

    public async getTransformerData(play: PlayObject, stageConfig: MusicbrainzTransformerDataStage): Promise<IRecordingMSList> {
        
        const {
            // preserve order of search from before searchOrder
            searchOrder = this.defaults.searchOrder ?? ['isrc', 'basic']
        } = stageConfig;

        let results: IRecordingMSList;

        for(const searchType of searchOrder) {
            try {
                switch(searchType) {
                    case 'isrc':
                        results = await this.searchByIsrc(play, stageConfig);
                        break;
                    case 'album':
                        results = await this.searchByAlbum(play, stageConfig);
                        break;
                    case 'artist':
                        results = await this.searchByArtist(play, stageConfig);
                        break;
                    case 'basic':
                        results = await this.searchByBasicFields(play, stageConfig);
                        break;
                    case 'freetext':
                        results = await this.searchByFreeText(play, stageConfig);
                        break;
                    case 'basicorids':
                        results = await this.searchByBasicFieldsOrMBIDs(play, stageConfig);
                        break;
                    case 'mbidrecording':
                        results = await this.searchByRecordingMbid(play, stageConfig);
                        break;
                }
                if(results.recordings.length === 0) {
                    this.logger.debug(`'${searchType}' search type returned no matches`);
                } else {
                    break;
                }
            } catch (e) {
                if(e instanceof SearchPrerequisiteError) {
                    this.logger.debug(`Search type ${searchType} did not meet prerequesites: ${e.message}`);
                } else {
                    // we should be catching any unrecoverable errors in api calls
                    // so we should only get here if something truly bad has happened
                    // and we probably don't want to try additional api calls
                    throw e;
                }
            }
        }

        return results;
    }

    public async searchByBasicFields(play: PlayObject, stageConfig: MusicbrainzTransformerDataStage): Promise<IRecordingMSList> {
        this.logger.debug({labels: ['Basic Search']}, 'Searching by artist/album/track');
        return await this.api.searchByRecording(play);
    }

    public async searchByBasicFieldsOrMBIDs(play: PlayObject, stageConfig: MusicbrainzTransformerDataStage): Promise<IRecordingMSList> {
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
        } else if(brainz.track !== undefined) {
            using.push('mbidtrack');
        } else {
            using.push('title');
        }
        using.push(brainz.album !== undefined ? 'mbidrelease' : 'album');
        using.push((brainz.artist ?? []).length > 0 ? 'mbidartist' : 'artist');

        this.logger.debug({labels: ['Basic Or MBID Search']}, `Searching using ${using.join(', ')}}`);
        return await this.api.searchByRecording(play, {using});
    }

    public async searchByIsrc(play: PlayObject, stageConfig: MusicbrainzTransformerDataStage): Promise<IRecordingMSList> {
        if(play.data.isrc !== undefined) {
            this.logger.debug({labels: ['ISRC Search']},'Searching with ISRC');
            return await this.api.searchByRecording(play, {using: ['isrc']});
        }
        throw new SearchPrerequisiteError('Play does not have ISRC');
    }

    public async searchByRecordingMbid(play: PlayObject, stageConfig: MusicbrainzTransformerDataStage): Promise<IRecordingMSList> {
        if(play.data.meta?.brainz?.recording !== undefined) {
            this.logger.debug({labels: ['MBID Search']},'Searching with Recording MBID');
            return await this.api.searchByRecording(play, {using: ['mbidrecording']});
        }
        throw new SearchPrerequisiteError('Play does not have recording MBID');
    }

    public async searchByAlbum(play: PlayObject, stageConfig: MusicbrainzTransformerDataStage): Promise<IRecordingMSList> {
        // possibly the artist is incorrect (may be combined as one string)
        // if we have an album we can likely still get a decent hit w/o using artist
        if(play.data.album !== undefined && play.data.artists !== undefined && play.data.artists.length > 0) {
            this.logger.debug({labels: ['Album Search']},'Searching with only track+album');
            return await this.api.searchByRecording(play, {using: ['title','album']});
        }
        if(play.data.album === undefined) {
            throw new SearchPrerequisiteError('Play does not have an album');
        }
        if(play.data.artists === undefined) {
            throw new SearchPrerequisiteError('Play does not have any artists');
        }
        if(play.data.artists.length === 1) {
            throw new SearchPrerequisiteError('Play only has one artist');
        }
    }

    public async searchByArtist(play: PlayObject, stageConfig: MusicbrainzTransformerDataStage): Promise<IRecordingMSList> {
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
                        return await this.api.searchByRecording({...play, data: {
                            ...play.data,
                            artists: [naiveSplit[0]]
                        }}, {using: ['title','artist']});
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
                    return await this.api.searchByRecording(nativePlay, {using: ['title','artist']});
                }
            }

            if(play.data.artists === undefined) {
                throw new SearchPrerequisiteError('Play does not have any artists');
            }
            if(play.data.artists.length > 1) {
                throw new SearchPrerequisiteError('Play has more than one artist already');
            }
    }

    public async searchByFreeText(play: PlayObject, stageConfig: MusicbrainzTransformerDataStage): Promise<IRecordingMSList> {
        this.logger.debug({labels: ['Freetext Search']},'Trying freetext search');
        const results = await this.api.searchByRecording(play, {freetext: true}) as IRecordingMSList;
        results.freeText = true;
        return results;
    }

    public async handlePostFetch(play: PlayObject, transformData: IRecordingMSList, stageConfig: MusicbrainzTransformerDataStage): Promise<PlayObject> {
        if(transformData.recordings.length === 0) {
            throw new StagePrerequisiteError('No matches returned from Musicbrainz API', {shortStack: true});
        }

        const {
            score = this.defaults.score ?? 90
        } = stageConfig;

        // if brainz meta contains track MBID then we should be able to get the exact release
        let explicitList: IRecordingMatch[];
        let filtered = false;
        [explicitList, filtered] = filterByExplicitTrackMbid(transformData.recordings, play);
        if(filtered) {
            this.logger.debug(`Found exact release using track MBID`);
            return recordingToPlay(explicitList[0], {ignoreVA: stageConfig.ignoreVA});
        }
        [explicitList, filtered] = filterByExplicitReleaseMbid(transformData.recordings, play);
        if(filtered) {
            this.logger.debug(`Found exact release using release MBID`);
            return recordingToPlay(explicitList[0], {ignoreVA: stageConfig.ignoreVA});
        }

        let filteredList: RecordingRankedMatched[] = transformData.recordings.filter(x => x.score >= score);
        if(filteredList.length === 0) {
             throw new StagePrerequisiteError(`All ${transformData.count} fetched matches had a score < ${score}, best match was ${transformData.recordings[0].score}`, {shortStack: true});
        }
        const mergedConfig = Object.assign({}, removeUndefinedKeys({...this.defaults}), removeUndefinedKeys({...stageConfig}));
        filteredList = filterByValidReleaseStatus(filteredList, mergedConfig);
        filteredList = filterByValidReleaseGroupPrimary(filteredList, mergedConfig);
        filteredList = filterByValidReleaseGroupSecondary(filteredList, mergedConfig);
        filteredList = filterByValidReleaseCountry(filteredList, mergedConfig);


        if(filteredList.length === 0) {
            throw new StagePrerequisiteError(`All ${transformData.count} recordings were filtered out by allow/deny release config`, {shortStack: true});
        }

        filteredList = rankReleasesByPriority(filteredList, mergedConfig, play);

        this.logger.debug(`${filteredList.length} of ${transformData.count} were valid, filtered matches. Using match with best score of ${filteredList[0].score}`);

        return recordingToPlay(filteredList[0], {ignoreVA: stageConfig.ignoreVA});
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
    protected async handleArtists(play: PlayObject, parts: ExternalMetadataTerm, transformData: PlayObject): Promise<string[] | undefined> {
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
    protected async handleAlbumArtists(play: PlayObject, parts: ExternalMetadataTerm, transformData: PlayObject): Promise<string[] | undefined> {
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

export const filterByValidReleaseStatus = <T extends IRecordingMatch[]>(list: T, stageConfig: MusicbrainzTransformerDataStage, logger: MaybeLogger = new MaybeLogger()) => {
    const {
        releaseStatusAllow = [],
        releaseStatusDeny = [],
        releaseAllowEmpty
    } = stageConfig;
    if(releaseStatusAllow.length === 0 && releaseStatusDeny.length === 0) {
        return list;
    }
    const releaseFiltered = list.map(x => {
        return {
            ...x,
            releases: x.releases.filter(y => {
                if(releaseStatusAllow.length > 0) {
                    return releaseStatusAllow.includes(y.status?.toLocaleLowerCase() as MBReleaseStatus)
                }
                 return !releaseStatusDeny.includes(y.status?.toLocaleLowerCase() as MBReleaseStatus)
            })
        }
    });
    return releaseFiltered.filter(x => (
        list.find(y => y.id === x.id).releases.length === 0 
        && releaseAllowEmpty
    ) 
    || x.releases.length > 0);
}

export const filterByValidReleaseGroupPrimary = <T extends IRecordingMatch[]>(list: T, stageConfig: MusicbrainzTransformerDataStage, logger: MaybeLogger = new MaybeLogger()) => {
    const {
        releaseGroupPrimaryTypeAllow = [],
        releaseGroupPrimaryTypeDeny = [],
        releaseAllowEmpty
    } = stageConfig;
    if(releaseGroupPrimaryTypeAllow.length === 0 && releaseGroupPrimaryTypeAllow.length === 0) {
        return list;
    }
    const releaseFiltered = list.map(x => {
        return {
            ...x,
            releases: x.releases.filter(y => {
                if(releaseGroupPrimaryTypeAllow.length > 0) {
                    return releaseGroupPrimaryTypeAllow.includes(y["release-group"]?.["primary-type"]?.toLocaleLowerCase() as MBReleaseGroupPrimaryType)
                }
                 return !releaseGroupPrimaryTypeDeny.includes(y["release-group"]?.["primary-type"]?.toLocaleLowerCase() as MBReleaseGroupPrimaryType)
            })
        }
    });
    return releaseFiltered.filter(x => (
        list.find(y => y.id === x.id).releases.length === 0 
        && releaseAllowEmpty
    ) 
    || x.releases.length > 0);
}

export const filterByValidReleaseGroupSecondary = (list: IRecordingMatch[], stageConfig: MusicbrainzTransformerDataStage, logger: MaybeLogger = new MaybeLogger()) => {
    const {
        releaseGroupSecondaryTypeAllow = [],
        releaseGroupSecondaryTypeDeny = [],
        releaseAllowEmpty
    } = stageConfig;
    if(releaseGroupSecondaryTypeAllow.length === 0 && releaseGroupSecondaryTypeDeny.length === 0) {
        return list;
    }
    const releaseFiltered = list.map(x => {
        return {
            ...x,
            releases: x.releases.filter(y => {
                if(releaseGroupSecondaryTypeAllow.length > 0) {
                    return intersect(releaseGroupSecondaryTypeAllow, (y["release-group"]?.["secondary-types"] ?? []).map(x => x.toLocaleLowerCase()) as MBReleaseGroupSecondaryType[]).length > 0;
                }
                  return intersect(releaseGroupSecondaryTypeDeny, (y["release-group"]?.["secondary-types"] ?? []).map(x => x.toLocaleLowerCase()) as MBReleaseGroupSecondaryType[]).length === 0;
            })
        }
    });
    return releaseFiltered.filter(x => (
        list.find(y => y.id === x.id).releases.length === 0 
        && releaseAllowEmpty
    )
    || x.releases.length > 0);
}

export const filterByValidReleaseCountry = (list: IRecordingMatch[], stageConfig: MusicbrainzTransformerDataStage, logger: MaybeLogger = new MaybeLogger()) => {
    const {
        releaseCountryAllow = [],
        releaseCountryDeny = [],
        releaseAllowEmpty
    } = stageConfig;
    if(releaseCountryAllow.length === 0 && releaseCountryDeny.length === 0) {
        return list;
    }
    const releaseFiltered = list.map(x => {
        return {
            ...x,
            releases: x.releases.filter(y => {
                if(releaseCountryAllow.length > 0) {
                    return releaseCountryAllow.includes(y.country?.toLocaleLowerCase())
                }
                 return !releaseCountryDeny.includes(y.country?.toLocaleLowerCase())
            })
        }
    });
    return releaseFiltered.filter(x => (
        list.find(y => y.id === x.id).releases.length === 0 
        && releaseAllowEmpty
    ) 
    || x.releases.length > 0);
}

export const filterByExplicitTrackMbid = (list: IRecordingMatch[], play: PlayObject): [IRecordingMatch[], boolean] => {
    if (play.data.meta?.brainz?.track === undefined) {
        return [list, false];
    }
    let recMatch: IRecordingMatch,
        releaseMatchId: string;
    for (const rec of list) {
        if (recMatch !== undefined) {
            break;
        }
        for (const rel of rec.releases) {
            // @ts-ignore
            if (rel.media.some(x => x.track.some(y => y.id === play.data.meta.brainz.track))) {
                releaseMatchId = rel.id;
                recMatch = rec;
                break;
            }
        }
    }
    if (recMatch !== undefined) {
        const r = structuredClone(recMatch);
        r.releases = r.releases.filter(x => x.id === releaseMatchId);
        return [[r], true];
    }
    return [list, false];
}

export const filterByExplicitReleaseMbid = (list: IRecordingMatch[], play: PlayObject): [IRecordingMatch[], boolean] => {
    if (play.data.meta?.brainz?.album === undefined) {
        return [list, false];
    }
    let recMatch: IRecordingMatch,
        releaseMatchId: string;
    for (const rec of list) {
        if (recMatch !== undefined) {
            break;
        }
        for (const rel of rec.releases) {
            if(rel.id === play.data.meta.brainz.album) {
                releaseMatchId = rel.id;
                recMatch = rec;
            }
        }
    }
    if (recMatch !== undefined) {
        const r = structuredClone(recMatch);
        r.releases = r.releases.filter(x => x.id === releaseMatchId);
        return [[r], true];
    }
    return [list, false];
}

export const rankReleasesByPriority = (list: IRecordingMatch[], stageConfig: MusicbrainzTransformerDataStage, play: PlayObject, logger: MaybeLogger = new MaybeLogger()): RecordingRankedMatched[] => {
        const {
        releaseStatusPriority = [],
        releaseGroupPrimaryTypePriority = [],
        releaseGroupSecondaryTypePriority = [],
        releaseCountryPriority = [],
        albumWeight,
        titleWeight,
        artistWeight
    } = stageConfig;

    const cList = clone(list) as RecordingRankedMatched[];
    const rankedList = cList.map((x) => {
        let artistScore = 0;
        if(artistWeight !== 0) {
            const artistRes = comparePlayArtistsNormalized(play, recordingToPlay(x));
            artistScore = artistRes[0] * (artistWeight + (artistRes[1] > 0 ? 0.05 : 0));
        }
        const releases = (x.releases ?? []).map((a) => {
            const statAScore = releaseStatusPriority.findIndex(x => x === a.status.toLocaleLowerCase()) + 1;
            const grpPAScore = releaseGroupPrimaryTypePriority.findIndex(x => x === a["release-group"]?.["primary-type"]?.toLocaleLowerCase()) + 1;
            const grpSAScore = (a["release-group"]?.["secondary-types"] ?? []).reduce((acc: number, curr: MBReleaseGroupSecondaryType) => acc + releaseGroupSecondaryTypePriority.findIndex(x => x === (curr as MBReleaseGroupSecondaryType).toLocaleLowerCase()) + 1,0);
            const countryAScore = releaseCountryPriority.findIndex(x => a.country === undefined ? false : x === a.country.toLocaleLowerCase()) + 1;
            const compareScore = scoreNormalizedStringsWeighted(play.data.album, a.title, albumWeight, albumWeight !== 0 ? 0.05 : 0);
            return {
                ...a,
                albumScore: statAScore + grpPAScore + grpSAScore + countryAScore + compareScore,
                albumCompareScore: compareScore
            };
        });
        releases.sort((a, b) => b.albumScore - a.albumScore);
        let albumScore = 0;
        if(releases.length > 0) {
            albumScore = releases[0].albumCompareScore;
        }
        const titleScore = titleWeight === 0 ? 0 : scoreTrackWeightedAndNormalized(play.data.track, x.title, titleWeight, {exact: 0.05, naive: 0.03})[0];

        return {
            ...x,
            titleScore,
            artistScore,
            albumScore,
            rankScore: titleScore + artistScore + albumScore,
            releases
        }
    });
    rankedList.sort((a, b) => b.rankScore - a.rankScore)
    return rankedList;
};

export const DEFAULTS_SENSIBLE: MusicbrainzTransformerData = {
    // use official release over anything else
    "releaseStatusPriority": ["official"],
    // prefer album, then single, then ep
    "releaseGroupPrimaryTypePriority": ["album", "single", "ep"],
    // prefer worldwide release
    "releaseCountryPriority": ["XW"]
}
export const DEFAULTS_NATIVE: MusicbrainzTransformerData = {
    "searchArtistMethod": "native",
    "searchOrder": ["artist"]
}

export const DEFAULTS_AGGRESSIVE: MusicbrainzTransformerData = {
    "searchOrder": ["freetext"]
}

export const DEFAULTS_FIELDS_BIAS = {
    "titleWeight": 0.33,
    "albumWeight": 0.33,
    "artistWeight": 0.33
}

export const DEFAULTS_PRESET: MusicbrainzTransformerData = {
    "searchOrder": ["isrc", "basic"]
}

export const DEFAULTS_ID: MusicbrainzTransformerData = {
    "searchOrder": ["isrc", "mbidrecording", "basicorids", "basic"]
};

const PRESETS: Record<string, MusicbrainzTransformerData> = {
    default: DEFAULTS_PRESET,
    sensible: DEFAULTS_SENSIBLE,
    native: DEFAULTS_NATIVE,
    aggressive: DEFAULTS_AGGRESSIVE,
    fields: DEFAULTS_FIELDS_BIAS,
    'id': DEFAULTS_ID
}

export const configFromEnv = (logger: MaybeLogger = new MaybeLogger()) => {
    const mbEnv = process.env.MB_PRESETS;
    const mbContact = process.env.MB_CONTACT;
    let mbConfig: MusicbrainzTransformerConfig;
    if (mbEnv !== undefined && mbEnv.trim() !== '') {
        if (mbContact === undefined || mbContact.trim() === '') {
            throw new SimpleError('Must provide a contact url/email for musicbrainz ENV present!');
        }
        mbConfig = {
            type: 'musicbrainz',
            name: 'MSDefault',
        data: {
                apis: [
                    {
                        contact: mbEnv
                    }
                ]
            },
            defaults: {

            }
        }
        const presets = mbEnv.split(',').map(x => x.trim().toLocaleLowerCase());
        const soSet = new Set<SearchType>();
        for (const pName of presets) {
            const p = PRESETS[pName];
            if(p === undefined) {
                logger.warn(`No preset with name '${p}'`);
                continue;
            }
            const { searchOrder = [], ...rest } = p;
            mbConfig.defaults = {
                ...mbConfig.defaults,
                ...rest,
            }
            for (const o of searchOrder) {
                soSet.add(o);
            }
        }
        
        if(soSet.size > 0) {
            mbConfig.defaults.searchOrder = Array.from(soSet);
        }
        logger.debug(`Using presets: ${presets.join(',')}`);
    }

    return mbConfig;
}

export class SearchPrerequisiteError extends SimpleError {
    name = 'Search Prerequistie Failure';
}