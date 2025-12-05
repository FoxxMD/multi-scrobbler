import { asMBReleasePrimaryGroupType, asMBReleaseSecondaryGroupType, asMBReleaseStatus, DEFAULT_MISSING_TYPES, isMBReleasePrimaryGroupType, MBReleaseGroupPrimaryType, MBReleaseGroupSecondaryType, MBReleaseStatus, MissingMbidType, PlayObject, TrackMeta, TransformerCommon } from "../../../core/Atomic.js";
import { isWhenCondition, testWhenConditions } from "../../utils/PlayTransformUtils.js";
import { WebhookPayload } from "../infrastructure/config/health/webhooks.js";
import { ExternalMetadataTerm, PlayTransformMetadataStage } from "../infrastructure/Transform.js";
import AtomicPartsTransformer from "./AtomicPartsTransformer.js";
import { TransformerOptions } from "./AbstractTransformer.js";
import { MUSICBRAINZ_URL, MusicbrainzApiConfigData } from "../infrastructure/Atomic.js";
import { MaybeLogger } from "../logging.js";
import { childLogger, Logger } from "@foxxmd/logging";
import { MusicbrainzApiClient, MusicbrainzApiConfig, recordingToPlay } from "../vendor/musicbrainz/MusicbrainzApiClient.js";
import { IRecordingList, IRecordingMatch, MusicBrainzApi } from "musicbrainz-api";
import { getRoot, version } from "../../ioc.js";
import { normalizeWebAddress } from "../../utils/NetworkUtils.js";
import { intersect, missingMbidTypes, removeUndefinedKeys } from "../../utils.js";
import { SimpleError } from "../errors/MSErrors.js";
import { parseArrayFromMaybeString } from "../../utils/StringUtils.js";
import clone from "clone";
import { Cacheable } from "cacheable";

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
    }
    throw new Error(`MissingMbidType must be one of 'artist' or 'title' or 'album', given: ${clean}`);
}

export interface MusicbrainzTransformerData {
    searchWhenMissing?: MissingMbidType[]
    forceSearch?: boolean
    score?: number
    
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

    /** Ignore album artist if it is "Various Artists"
     * 
     * @default true
     */
    ignoreVA?: boolean
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
}

export interface MusicbrainzTransformerDataStage extends MusicbrainzTransformerDataStrong,PlayTransformMetadataStage {
}

export interface MusicbrainzTransformerDataConfig {
    apis: MusicbrainzApiConfigData[]
}

export type MusicbrainzBestMatch = {play: PlayObject, score: number};

export type MusicbrainzTransformerConfig = TransformerCommon<MusicbrainzTransformerData, MusicbrainzTransformerDataConfig>;

export type RecordingRankedMatched = IRecordingMatch & {rankScore: number}

export const parseStageConfig = (data: MusicbrainzTransformerData | undefined = {}, logger: MaybeLogger = new MaybeLogger()): MusicbrainzTransformerDataStrong => {

    const config: MusicbrainzTransformerDataStrong = {
        searchWhenMissing: DEFAULT_MISSING_TYPES,
        score: 90,

        releaseGroupPrimaryTypeAllow: data.releaseGroupPrimaryTypeAllow !== undefined ? parseArrayFromMaybeString(data.releaseGroupPrimaryTypeAllow, {lower: true}).map(asMBReleasePrimaryGroupType) : undefined,
        releaseGroupPrimaryTypeDeny: data.releaseGroupPrimaryTypeDeny !== undefined  ?parseArrayFromMaybeString(data.releaseGroupPrimaryTypeDeny, {lower: true}).map(asMBReleasePrimaryGroupType) : undefined,
        releaseGroupPrimaryTypePriority: data.releaseGroupPrimaryTypePriority !== undefined ? parseArrayFromMaybeString(data.releaseGroupPrimaryTypePriority, {lower: true}).map(asMBReleasePrimaryGroupType) : undefined,

        releaseGroupSecondaryTypeAllow: data.releaseGroupSecondaryTypeAllow !== undefined ? parseArrayFromMaybeString(data.releaseGroupSecondaryTypeAllow, {lower: true}).map(asMBReleaseSecondaryGroupType) : undefined,
        releaseGroupSecondaryTypeDeny: data.releaseGroupSecondaryTypeDeny !== undefined ?  parseArrayFromMaybeString(data.releaseGroupSecondaryTypeDeny, {lower: true}).map(asMBReleaseSecondaryGroupType) : undefined,
        releaseGroupSecondaryTypePriority: data.releaseGroupSecondaryTypePriority !== undefined ?  parseArrayFromMaybeString(data.releaseGroupSecondaryTypePriority, {lower: true}).map(asMBReleaseSecondaryGroupType) : undefined,

        releaseStatusAllow: data.releaseStatusAllow !== undefined ? parseArrayFromMaybeString(data.releaseStatusAllow, {lower: true}).map(asMBReleaseStatus) : undefined,
        releaseStatusDeny: data.releaseStatusAllow !== undefined ?  parseArrayFromMaybeString(data.releaseStatusDeny, {lower: true}).map(asMBReleaseStatus) : undefined,
        releaseStatusPriority: data.releaseStatusAllow !== undefined ? parseArrayFromMaybeString(data.releaseStatusPriority, {lower: true}).map(asMBReleaseStatus) : undefined,

        releaseCountryAllow: data.releaseCountryAllow !== undefined ? parseArrayFromMaybeString(data.releaseCountryAllow, {lower: true}) : undefined,
        releaseCountryDeny:  data.releaseCountryDeny !== undefined ? parseArrayFromMaybeString(data.releaseCountryDeny, {lower: true}) : undefined,
        releaseCountryPriority:  data.releaseCountryPriority !== undefined ? parseArrayFromMaybeString(data.releaseCountryPriority, {lower: true}) : undefined,

        releaseAllowEmpty: data.releaseAllowEmpty,
        ignoreVA: data.ignoreVA
    };

    if (data === null || typeof data !== 'object') {
        throw new Error('Musicbrainz Transformer data should be an object or not defined.');
    }

    if(data.searchWhenMissing !== undefined) {
        config.searchWhenMissing = data.searchWhenMissing.map(asMissingMbid);
    }

    if(data.score !== undefined) {
        config.score = data.score;
    }

    logger.debug(`Will search if missing: ${config.searchWhenMissing.join(', ')} | Match if (default) score is >= ${config.score}`);

    for(const [k,v] of Object.entries(config)) {
        if(k.includes('release') && v !== undefined) {
            logger.debug(`${k}: ${v.join(' | ')}`);
        }
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

        const mbMap = getRoot().items.mbMap();
        const mbApis: Record<string, MusicbrainzApiConfig> = {};
        for(const mbConfig of this.config.data.apis) {
            const u = normalizeWebAddress(mbConfig.url ?? MUSICBRAINZ_URL);
            let mb = mbMap.get(u.url.hostname);
            if(mb === undefined) {
                const api = new MusicBrainzApi({
                    appName: 'multi-scrobbler',
                    appVersion: version,
                    appContactInfo: mbConfig.contact,
                    baseUrl: u.url.toString(),
                    rateLimit: [1,1]
                });
                mbApis[u.url.hostname] = {api, ...mbConfig};
                mbMap.set(u.url.hostname, api);
                mb = api;
            } else if(mbApis[u.url.hostname] === undefined) {
                mbApis[u.url.hostname] = {api: mb, ...mbConfig};
            }
        }

        this.api = new MusicbrainzApiClient(this.config.name, {apis: Object.values(mbApis)}, {
            logger: this.logger,
            cache: this.clientCache
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

        for (const k of ['artists', 'title', 'album']) {
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
            forceSearch = false
        } = stageConfig;

        const missing = missingMbidTypes(play);
        if(intersect(searchWhenMissing, missing).length > 0) {
            this.logger.debug(`Missing desired MBIDs for: ${missing.join(', ')}`);
        } else if(forceSearch) {
            this.logger.debug(`No desired MBIDs are missing but forceSearch = true`);
        } else {
            throw new SimpleError('No desired MBIDs are missing');
        }
    }

    public async getTransformerData(play: PlayObject, stageConfig: MusicbrainzTransformerDataStage): Promise<IRecordingList> {

        let results = await this.api.searchByRecording(play);

        if(results === undefined) {
            throw new Error('results were unexpectedly undefined! API should have thrown...');
        }
        if(results.recordings === undefined) {
            this.logger.debug(results);
            throw new Error('results returned by no recordings list in response data, something handled incorrectly?');
        }

        if(results.recordings.length === 0) {
            // possibly the artist is incorrect (may be combined as one string)
            // if we have an album we can likely still get a decent hit w/o using artist
            if(play.data.album !== undefined && play.data.artists !== undefined && play.data.artists.length > 0) {
                this.logger.debug('No matches found, trying search with only track+album');
                results = await this.api.searchByRecording(play, {using: ['title','album']});
            }
        }

        return results;
    }

    public async handlePostFetch(play: PlayObject, transformData: IRecordingList, stageConfig: MusicbrainzTransformerDataStage): Promise<PlayObject> {
        if(transformData.recordings.length === 0) {
            throw new SimpleError('No matches returned from Musicbrainz API');
        }

        const {
            score = this.defaults.score ?? 90
        } = stageConfig;

        let filteredList = transformData.recordings.filter(x => x.score >= score);
        if(filteredList.length === 0) {
             throw new SimpleError(`All ${transformData.count} fetched matches had a score < ${score}, best match was ${transformData.recordings[0].score}`);
        }
        const mergedConfig = Object.assign({}, removeUndefinedKeys({...this.defaults}), removeUndefinedKeys({...stageConfig}));
        filteredList = filterByValidReleaseStatus(filteredList, mergedConfig);
        filteredList = filterByValidReleaseGroupPrimary(filteredList, mergedConfig);
        filteredList = filterByValidReleaseGroupSecondary(filteredList, mergedConfig);
        filteredList = filterByValidReleaseCountry(filteredList, mergedConfig);


        if(filteredList.length === 0) {
            throw new SimpleError(`All ${transformData.count} recordings were filtered out by allow/deny release config`);
        }

        filteredList = rankReleasesByPriority(filteredList, mergedConfig);

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

    protected async handleMeta(play: PlayObject, transformData: PlayObject): Promise<TrackMeta | undefined> {
        return transformData.data.meta;
    }

    public notify(payload: WebhookPayload): Promise<void> {
        return;
    }

}

export const filterByValidReleaseStatus = (list: IRecordingMatch[], stageConfig: MusicbrainzTransformerDataStage, logger: MaybeLogger = new MaybeLogger()) => {
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

export const filterByValidReleaseGroupPrimary = (list: IRecordingMatch[], stageConfig: MusicbrainzTransformerDataStage, logger: MaybeLogger = new MaybeLogger()) => {
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

export const rankReleasesByPriority = (list: IRecordingMatch[], stageConfig: MusicbrainzTransformerDataStage, logger: MaybeLogger = new MaybeLogger()) => {
        const {
        releaseStatusPriority = [],
        releaseGroupPrimaryTypePriority = [],
        releaseGroupSecondaryTypePriority = [],
        releaseCountryPriority = []
    } = stageConfig;
    if(releaseStatusPriority.length === 0 && releaseGroupPrimaryTypePriority.length === 0 && releaseGroupSecondaryTypePriority.length === 0 && releaseCountryPriority.length === 0) {
        return list;
    }

    const cList = clone(list);
    const rankedList = cList.map((x) => {
        return {
            ...x,
            releases: (x.releases ?? []).map((a) => {
            const statAScore = releaseStatusPriority.findIndex(x => x === a.status.toLocaleLowerCase()) + 1;
            const grpPAScore = releaseGroupPrimaryTypePriority.findIndex(x => x === a["release-group"]?.["primary-type"]?.toLocaleLowerCase()) + 1;
            const grpSAScore = (a["release-group"]?.["secondary-types"] ?? []).reduce((acc: number, curr: MBReleaseGroupSecondaryType) => acc + releaseGroupSecondaryTypePriority.findIndex(x => x === (curr as MBReleaseGroupSecondaryType).toLocaleLowerCase()) + 1,0);
            const countryAScore = releaseCountryPriority.findIndex(x => a.country === undefined ? false : x === a.country.toLocaleLowerCase()) + 1;
            return {
                ...a,
                rankedScore: statAScore + grpPAScore + grpSAScore + countryAScore
            };
        })
        }
    });
    for(const rec of rankedList) {
        rec.releases.sort((a, b) => b.rankedScore - a.rankedScore);
    }
    return rankedList;
};