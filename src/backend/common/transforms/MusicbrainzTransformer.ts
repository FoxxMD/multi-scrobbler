import { DEFAULT_MISSING_TYPES, MissingMbidType, PlayObject, TrackMeta, TransformerCommon } from "../../../core/Atomic.js";
import { isWhenCondition, testWhenConditions } from "../../utils/PlayTransformUtils.js";
import { WebhookPayload } from "../infrastructure/config/health/webhooks.js";
import { ExternalMetadataTerm, PlayTransformNativeStage, PlayTransformMetadataStage, StageConfig } from "../infrastructure/Transform.js";
import AtomicPartsTransformer from "./AtomicPartsTransformer.js";
import { parseArtistCredits, parseTrackCredits, uniqueNormalizedStrArr } from "../../utils/StringUtils.js";
import { parseRegexSingle, parseToRegexOrLiteralSearch } from "@foxxmd/regex-buddy-core";
import { TransformerOptions } from "./AbstractTransformer.js";
import { DELIMITERS_NO_AMP, MUSICBRAINZ_URL, MusicbrainzApiConfigData } from "../infrastructure/Atomic.js";
import { asArray } from "../../utils/DataUtils.js";
import { MaybeLogger } from "../logging.js";
import { childLogger } from "@foxxmd/logging";
import { MusicbrainzApiClient, MusicbrainzApiConfig, recordingToPlay } from "../vendor/musicbrainz/MusicbrainzApiClient.js";
import { MusicBrainzApi } from "musicbrainz-api";
import { getRoot, version } from "../../ioc.js";
import { normalizeWebAddress } from "../../utils/NetworkUtils.js";
import { intersect, missingMbidTypes } from "../../utils.js";
import { isSimpleError, SimpleError } from "../errors/MSErrors.js";

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
}

export interface MusicbrainzTransformerDataStrong extends MusicbrainzTransformerData {
    searchWhenMissing: MissingMbidType[]
}

export interface MusicbrainzTransformerDataStage extends MusicbrainzTransformerDataStrong,PlayTransformMetadataStage {
}

export interface MusicbrainzTransformerDataConfig {
    apis: MusicbrainzApiConfigData[]
}

export type MusicbrainzBestMatch = {play: PlayObject, score: number};

export type MusicbrainzTransformerConfig = TransformerCommon<MusicbrainzTransformerData, MusicbrainzTransformerDataConfig>;

export const parseStageConfig = (data: MusicbrainzTransformerData | undefined = {}, logger: MaybeLogger = new MaybeLogger()): MusicbrainzTransformerDataStrong => {

    const config: MusicbrainzTransformerDataStrong = {
        searchWhenMissing: DEFAULT_MISSING_TYPES,
        score: 90
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

    return config;
}

export default class MusicbrainzTransformer extends AtomicPartsTransformer<ExternalMetadataTerm, MusicbrainzBestMatch | undefined, MusicbrainzTransformerDataStage> {

    declare config: MusicbrainzTransformerConfig;

    protected defaults: MusicbrainzTransformerDataStrong;

    protected api: MusicbrainzApiClient;

    public constructor(config: MusicbrainzTransformerConfig, options: TransformerOptions) {
        super(config, options);
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
                    baseUrl: u.url.toString()
                });
                mbApis[u.url.hostname] = {api, ...mbConfig};
                mbMap.set(u.url.hostname, api);
                mb = api;
            } else if(mbApis[u.url.hostname] === undefined) {
                mbApis[u.url.hostname] = {api: mb, ...mbConfig};
            }
        }

        this.api = new MusicbrainzApiClient(this.config.name, {apis: Object.values(mbApis)}, {
            logger: this.logger
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

    public async checkShouldTransformPreData(play: PlayObject, stageConfig: MusicbrainzTransformerDataStage): Promise<void> {
        const {
            searchWhenMissing = this.defaults.searchWhenMissing,
            forceSearch = false
        } = stageConfig;

        const missing = missingMbidTypes(play);
        if(intersect(searchWhenMissing, missing).length > 0) {
            this.logger.debug(`Missing desired MBIDs for ${missing.join(', ')}`);
        } else if(forceSearch) {
            this.logger.debug('No desired MBIDs are missing but forceSearch = true');
        } else {
            throw new SimpleError('No desired MBIDs are missing');
        }
    }

    public async getTransformerData(play: PlayObject, stageConfig: MusicbrainzTransformerDataStage): Promise<MusicbrainzBestMatch> {

        // TODO maybe search more broadly if first query doesn't hit?
        const results = await this.api.searchByRecording(play);

        if(results === undefined || results.recordings.length === 0) {
            return undefined;
        }

        return { play: recordingToPlay(results.recordings[0]), score: results.recordings[0].score };
    }

    public async checkShouldTransform(play: PlayObject, transformData: MusicbrainzBestMatch | undefined, stageConfig: MusicbrainzTransformerDataStage): Promise<void> {
        if(transformData === undefined) {
            throw new SimpleError('No match returned from Musicbrainz API');
        }

        const {
            score = this.defaults.score ?? 90
        } = stageConfig;

        if(transformData.score < score) {
            this.logger.debug({bestMatch: transformData.play}, 'Best Match');
            throw new SimpleError(`Musicbrainz best match score of ${transformData.score} was less than minimum score of ${stageConfig.score}`);
        }
    }

    protected async handleTitle(play: PlayObject, parts: ExternalMetadataTerm, transformData: MusicbrainzBestMatch): Promise<string | undefined> {
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

        return transformData.play.data.track;
    }
    protected async handleArtists(play: PlayObject, parts: ExternalMetadataTerm, transformData: MusicbrainzBestMatch): Promise<string[] | undefined> {
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

        return transformData.play.data.artists;
    }
    protected async handleAlbumArtists(play: PlayObject, parts: ExternalMetadataTerm, transformData: MusicbrainzBestMatch): Promise<string[] | undefined> {
        // TODO
        return play.data.albumArtists;
    }
    protected async handleAlbum(play: PlayObject, parts: ExternalMetadataTerm, transformData: MusicbrainzBestMatch): Promise<string | undefined> {
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

        return transformData.play.data.album;
    }

    protected async handleMeta(play: PlayObject, transformData: MusicbrainzBestMatch): Promise<TrackMeta | undefined> {
        return transformData.play.data.meta;
    }

    public notify(payload: WebhookPayload): Promise<void> {
        return;
    }
    protected getIdentifier(): string {
        return 'Musicbrainz Transformer';
    }

}