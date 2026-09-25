import { type ArtistCredit, type LifecycleInput, type OptionalCacheUsage, type PlayObject, type ArtMeta } from "../../../../core/Atomic.ts";
import { isWhenCondition, testWhenConditions } from "../../../utils/PlayTransformUtils.ts";
import type {WebhookPayload} from "../../infrastructure/config/health/webhooks.ts";
import type {ExternalMetadataTerm, PlayTransformMetadataStage} from "../../../../core/Transform.ts";
import AtomicPartsTransformer from "../AtomicPartsTransformer.ts";
import type {TransformerOptions} from "../AbstractTransformer.ts";
import { MaybeLogger } from '../../MaybeLogger.ts';
import { childLogger } from "@foxxmd/logging";
import { difference } from "../../../utils.ts";
import { SimpleError, SkipTransformStageError, StagePrerequisiteError, StageTransformError } from "../../errors/MSErrors.ts";
import type { Cacheable } from "cacheable";
import { hasArtFields, type CAAMissingType, type CoverArtArchiveTransformData, type CovertArtArchiveTransformerConfig } from "./CoverArtArchiveTransformerUtil.ts";
import { CoverArtClientPool } from "../../vendor/musicbrainz/CovertArtApiPool.ts";
import { coverImageHas, type CoverArtReleaseResponse } from "../../vendor/musicbrainz/CoverArtApiTypes.ts";

export interface CoverArtArchiveTransformDataStrong extends CoverArtArchiveTransformData {
}

export interface CoverArtArchiveTransformerDataStage extends CoverArtArchiveTransformDataStrong,PlayTransformMetadataStage {
}

type MSCoverArtReleaseResponse = CoverArtReleaseResponse & {type?: 'album' | 'releaseGroup', requestQuery: string, lifecycleInputs?: LifecycleInput[]};

type ArtUriData = {uri: string, lifecycleInputs?: LifecycleInput[], type: 'album' | 'releaseGroup'}

export const parseStageConfig = (data: CoverArtArchiveTransformData | undefined = {}, logger: MaybeLogger = new MaybeLogger()): CoverArtArchiveTransformDataStrong => {

    if (data === null || typeof data !== 'object') {
        throw new Error('Musicbrainz Transformer data should be an object or not defined.');
    }

    const config: CoverArtArchiveTransformDataStrong = {
        searchWhenMissing: true,
        allowedTypes: ['front'],
        forceSearch: false,
        allowedSizes: ['any'],
        ...data,
    };

    logger.debug(`Will search if missing: ${config.searchWhenMissing === true ? 'all' : config.searchWhenMissing!.join(', ')}`);

    logger.debug(`Allowed image types: ${config.allowedTypes!.join(',')}`);

    return config;
}

export default class CoverArtArchiveTransformer extends AtomicPartsTransformer<ExternalMetadataTerm, ArtUriData, CoverArtArchiveTransformerDataStage> {

    declare config: CovertArtArchiveTransformerConfig;

    protected defaults!: CoverArtArchiveTransformDataStrong;

    protected api!: CoverArtClientPool;
    protected clientCache?: Cacheable;

    public constructor(config: CovertArtArchiveTransformerConfig, options: TransformerOptions & {clientCache?: Cacheable}) {
        super(config, options);
        this.clientCache = options.clientCache;
        this.staggerOpts = {
            initialInterval: 0,
            maxRandomStagger: 100
        }
    }

    protected async doBuildInitData(): Promise<true | string | undefined> {
        this.defaults = parseStageConfig(this.config.defaults, childLogger(this.logger, 'Defaults'));

        this.api = new CoverArtClientPool(this.config.name, this.config.data ?? {}, {logger: this.logger, cache: this.clientCache});   

        return true;
    }

    protected doParseConfig(data: CoverArtArchiveTransformerDataStage) {
        if (data.type !== 'coverartarchive') {
            throw new Error(`CoverArtAchive Transformer is only usable with 'coverartarchive' type stages`);
        }

        const stage: CoverArtArchiveTransformerDataStage = {
            ...data,
            ...parseStageConfig(data),
            type: 'coverartarchive'
        }

        for (const k of ['art'] as const) {
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

    public async handlePreFetch(play: PlayObject, stageConfig: CoverArtArchiveTransformerDataStage): Promise<void> {
        const {
            searchWhenMissing = this.defaults.searchWhenMissing,
            forceSearch = this.defaults.forceSearch
        } = stageConfig;

        const found: CAAMissingType[] = hasArtFields(play);
        if(searchWhenMissing === true) {
            if(found.length !== 0) {
                throw new SkipTransformStageError(`At least one art field (${found.join(',')}) already exists`, {shortStack: true});
            }
                this.logger.debug('Play has no art fields');
        } else {
            const missing = difference(searchWhenMissing!, found);
            if(missing.length > 0) {
                this.logger.debug(`Play is missing desired fields: ${missing.join(', ')}`);
            } else if(forceSearch) {
                this.logger.debug(`All desired fields exist but forceSearch = true`);
            } else {
                throw new SkipTransformStageError(`No desired fields (${searchWhenMissing!.join(',')}) are missing`, {shortStack: true});
            }
        }

    }

    public async getTransformerData(play: PlayObject, stageConfig: CoverArtArchiveTransformerDataStage, opts?: OptionalCacheUsage): Promise<MSCoverArtReleaseResponse> {

        const {
            allowedTypes = this.defaults.allowedTypes,
            allowedSizes = this.defaults.allowedSizes,
        } = stageConfig;
        
        let results: MSCoverArtReleaseResponse | undefined;
        let resultType: 'album' | 'releaseGroup' | undefined;
        const queries: LifecycleInput[] = [];

        for(const searchType of ['album','releaseGroup'] as const) {
            try {
                results = (await this.searchByMbid(play, searchType, stageConfig, opts))!;
                queries.push({type: `rsQuery-${searchType}${results.images === undefined ? '-empty'  : ''}`, input: results.requestQuery});
                if(results.images !== undefined) {
                    if(allowedTypes!.includes('any') && allowedSizes!.includes('any')) {
                        resultType = searchType;
                        break;
                    }
                    const meetsRequirements = results.images.some(x => {
                        const hasFields = coverImageHas(x);
                        if(!allowedTypes!.includes('any') && difference(allowedTypes!, hasFields.types).length > 0) {
                            return false;
                        }
                        if(!allowedSizes!.includes('any') && difference(allowedSizes!, hasFields.sizes).length > 0) {
                            return false;
                        }
                        return true;
                    });
                    if(meetsRequirements) {
                        resultType = searchType;
                        break;
                    }
                    results.images = [];
                }
            
                continue;
            } catch (e) {
                if(e instanceof SearchPrerequisiteError) {
                    queries.push({type: `rsQuery-${searchType}-prereqFailure`, input: `Search type ${searchType} did not meet prerequesites: ${e.message}`});
                    this.logger.debug(`Search type ${searchType} did not meet prerequesites: ${e.message}`);
                } else {
                    // we should be catching any unrecoverable errors in api calls
                    // so we should only get here if something truly bad has happened
                    // and we probably don't want to try additional api calls
                    throw new StageTransformError('Search Error', 'Unexpected error occurred while getting CoverArtArchive song matches', {cause: e, inputs: queries});
                }
            }
        }

        // @ts-expect-error we check for results in postFetch
        return {...(results ?? {requestQuery: undefined}), lifecycleInputs: queries, type: resultType};
    }

    public async searchByMbid(play: PlayObject, mbidType: 'album' | 'releaseGroup', stageConfig: CoverArtArchiveTransformerDataStage, opts: OptionalCacheUsage = {}): Promise<MSCoverArtReleaseResponse | undefined> {
        const mbid = play.data.meta?.brainz?.[mbidType];
        if(mbid === undefined) {
            throw new SearchPrerequisiteError(`Play does not have ${mbidType} MBID`);
        }

        this.logger.debug({labels: ['MBID Search']},`Searching with ${mbidType} MBID`);
        const requestQuery = mbid;
        try {
            const res = await this.api.proxy.getCovers(mbid, mbidType === 'album' ? 'release' : 'release-group');
            return {
                requestQuery,
                ...res
            } as MSCoverArtReleaseResponse;
        } catch (e: any) {
            e.requestQuery = requestQuery;
            throw e;
        }
    }

    public async handlePostFetch(play: PlayObject, transformData: MSCoverArtReleaseResponse, stageConfig: CoverArtArchiveTransformerDataStage): Promise<ArtUriData> {
        const {
            allowedTypes = this.defaults.allowedTypes,
            allowedSizes = this.defaults.allowedSizes,
            preferredSizes = this.defaults.preferredSizes ?? ['250','500','1200'],
        } = stageConfig;

        if(transformData.images === undefined) {
            throw new StagePrerequisiteError('All search prerequisites failed, CoverArtArchive API could not be searched with the given Play',
                {
                    shortStack: true,
                    inputs: transformData.lifecycleInputs
                });
        }
        if(transformData.images.length === 0) {
            throw new StagePrerequisiteError('CoverArtArchive API returned results but none met configured requirements',
                {
                    shortStack: true,
                    inputs: transformData.lifecycleInputs
                });
        }

        const validImages = transformData.images.filter(x => {
            const hasFields = coverImageHas(x);
            if(!allowedTypes!.includes('any') && difference(allowedTypes!, hasFields.types).length > 0) {
                return false;
            }
            if(!allowedSizes!.includes('any') && difference(allowedSizes!, hasFields.sizes).length > 0) {
                return false;
            }
            return true;
        });

        let preferred: string | undefined;
        for(const p of preferredSizes) {
            for(const image of validImages) {
                if(image.thumbnails[p] !== undefined) {
                    preferred = image.thumbnails[p];
                    break;
                }
            }
        }
        if(preferred === undefined) {
            // get the first thumb from the first image
            preferred = Object.values(validImages[0].thumbnails)[0];
        }

        try {
            const artUrl = await this.api.proxy.getCoverThumbFromUrl(preferred!);
            return {uri: artUrl!, lifecycleInputs: transformData.lifecycleInputs, type: transformData.type!}
        } catch (e) {
            throw new StageTransformError('Fetch Error', 'Unexpected error occurred while getting CoverArtArchive final url', {cause: e, inputs: transformData.lifecycleInputs});
        }
    }

    protected async handleTitle(play: PlayObject, parts: boolean | { when?: { title?: string; artists?: string; albumArtists?: string; album?: string; art?: string; }[]; }, transformData: ArtUriData): Promise<string | undefined> {
        return play.data.track;
    }
    protected async handleArtists(play: PlayObject, parts: boolean | { when?: { title?: string; artists?: string; albumArtists?: string; album?: string; art?: string; }[]; }, transformData: ArtUriData): Promise<ArtistCredit[] | undefined> {
        return play.data.artists;
    }
    protected async handleAlbumArtists(play: PlayObject, parts: boolean | { when?: { title?: string; artists?: string; albumArtists?: string; album?: string; art?: string; }[]; }, transformData: ArtUriData): Promise<ArtistCredit[] | undefined> {
        return play.data.albumArtists;
    }
    protected async handleAlbum(play: PlayObject, parts: boolean | { when?: { title?: string; artists?: string; albumArtists?: string; album?: string; art?: string; }[]; }, transformData: ArtUriData): Promise<string | undefined> {
        return play.data.album;
    }

    protected async handleArt(play: PlayObject, parts: ExternalMetadataTerm, transformData: ArtUriData): Promise<ArtMeta | undefined> {
        if (parts === false) {
            return play.meta.art;
        }
        if (typeof parts === 'object') {
            if (parts.when !== undefined) {
                if (!testWhenConditions(parts.when, play, { testMaybeRegex: this.regex.testMaybeRegex })) {
                    this.logger.debug('When condition for duration not met, returning original duration');
                    return play.meta.art;
                }
            }
        }

        const {
            type = 'album',
            uri
        } = transformData;

        const existing = play.meta?.art ?? {};

        if(type === 'album') {
            return {
                ...existing,
                album: uri
            }
        }
        return {
            ...existing,
            artist: uri
        }
    }

    public async notify(payload: WebhookPayload): Promise<void> {
    }

}

export class SearchPrerequisiteError extends SimpleError {
    name = 'Search Prerequistie Failure';
}