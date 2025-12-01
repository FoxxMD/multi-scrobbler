import { PlayObject, TransformerCommon } from "../../../core/Atomic.js";
import { isWhenCondition, testWhenConditions } from "../../utils/PlayTransformUtils.js";
import { WebhookPayload } from "../infrastructure/config/health/webhooks.js";
import { ExternalMetadataTerm, PlayTransformNativeStage, StageConfig } from "../infrastructure/Transform.js";
import AtomicPartsTransformer from "./AtomicPartsTransformer.js";
import { parseArtistCredits, parseTrackCredits, uniqueNormalizedStrArr } from "../../utils/StringUtils.js";
import { parseRegexSingle, parseToRegexOrLiteralSearch } from "@foxxmd/regex-buddy-core";
import { TransformerOptions } from "./AbstractTransformer.js";
import { DELIMITERS_NO_AMP } from "../infrastructure/Atomic.js";
import { asArray } from "../../utils/DataUtils.js";
import { MaybeLogger } from "../logging.js";
import { childLogger } from "@foxxmd/logging";

export type ArtistParseSource = 'artists' | 'title'

export const asArtistParseSource = (str: string): ArtistParseSource => {
    const clean = str.trim().toLocaleLowerCase();
    switch(clean) {
        case 'track':
        case 'title':
            return 'title';
        case 'artist':
        case 'artists':
            return 'artists';
    }
    throw new Error(`ArtistParseSource must be one of 'artist' or 'title', given: ${clean}`);
}

export interface NativeTransformerData {
    delimiters?: string[]
    delimitersExtra?: string[]
    artistsIgnore?: string[]
    artistsParseFrom?: ArtistParseSource[]
    artistsParseMonolithicOnly?: boolean
}

export interface NativeTransformerDataStrong {
    artistsParseFrom?: ArtistParseSource[]
    artistsParseMonolithicOnly?: boolean
    ignoreArtistsRegex?: RegExp[]
    delimiters?: string[]
}

export interface NativeTransformerDataStage extends NativeTransformerDataStrong,PlayTransformNativeStage {
}

export type NativeTransformerConfig = TransformerCommon<NativeTransformerData>;

export const parseStageConfig = (data: NativeTransformerData | undefined, logger: MaybeLogger = new MaybeLogger()): NativeTransformerDataStrong => {

    if (data === undefined) {
        return {};
    }

    const config: NativeTransformerDataStrong = {
    };

    if (data === null || typeof data !== 'object') {
        throw new Error('Native Transformer data should be an object or not defined.');
    }
    if (data.artistsIgnore !== undefined) {
        data.artistsIgnore = asArray(data.artistsIgnore);
        const nonStr = data.artistsIgnore.filter(x => typeof x !== 'string');
        if (nonStr.length > 0) {
            throw new Error(`ignoreArtists must be an array of strings but non-strings found: ${nonStr.map(x => (x as unknown).toString()).join(' | ')}`)
        }
        config.ignoreArtistsRegex = [];
        for (const i of data.artistsIgnore) {
            try {
                config.ignoreArtistsRegex.push(parseToRegexOrLiteralSearch(i));
            } catch (e) {
                throw new Error(`Could not convert ignoreArtist string to regex (or literal): ${i}`);
            }
        }
        logger.debug(`Defaults - Ignoring artists using ${data.artistsIgnore.length} rules`);
    }

    if (data.delimiters !== undefined) {
        config.delimiters = asArray(data.delimiters);
        logger.debug(`Defaults - Using user-defined delimiters '${config.delimiters.join(' ')}' instead of built-ins`);
    } else if (data.delimitersExtra !== undefined) {
        config.delimiters = [...DELIMITERS_NO_AMP, ...(asArray(data.delimitersExtra))];
        logger.debug(`Defaults - Using extra delimiters '${asArray(data.delimitersExtra).join(' ')}' with built-in delimiters '${DELIMITERS_NO_AMP.join(' ')}'`);
    }

    if (config.delimiters !== undefined) {
        config.delimiters.map(x => x.trim());
    }

    if (data.artistsParseFrom !== undefined) {
        const arr = asArray(data.artistsParseFrom);
        config.artistsParseFrom = arr.map(asArtistParseSource);
        logger.debug(`Defaults - Will try to parse artists from ${config.artistsParseFrom.join(' and ')} string`);
    }

    return config;
}

export default class NativeTransformer extends AtomicPartsTransformer<ExternalMetadataTerm, PlayObject | undefined, NativeTransformerDataStage> {

    declare config: NativeTransformerConfig;

    protected defaults: NativeTransformerDataStrong = {};

    ignoreArtistsRegex: RegExp[] = [];
    delimiters?: string[]
    parseArtistsFrom: ArtistParseSource[]

    public constructor(config: NativeTransformerConfig, options: TransformerOptions) {
        super(config, options);
    }

    protected async doBuildInitData(): Promise<true | string | undefined> {
        this.defaults = parseStageConfig(this.config.defaults, childLogger(this.logger, 'Defaults'));
        return true;
    }

    protected doParseConfig(data: NativeTransformerDataStage) {
        if (data.type !== 'native') {
            throw new Error(`NativeTransformer is only usable with 'native' type stages`);
        }

        const stage: NativeTransformerDataStage = {
            ...data,
            ...parseStageConfig(data),
            type: 'native'
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

    public async getTransformerData(play: PlayObject, stageConfig: NativeTransformerDataStage): Promise<PlayObject> {
        let artists = [];
        const {
            artistsParseFrom: parseArtistsFrom = this.defaults.artistsParseFrom ?? ['artists', 'title'],
            artistsParseMonolithicOnly = this.defaults.artistsParseMonolithicOnly ?? true,
            ignoreArtistsRegex = this.defaults.ignoreArtistsRegex ?? [],
            delimiters = this.defaults.delimiters
        } = stageConfig || {};

        if(parseArtistsFrom.includes('artists')) {

            if(play.data.artists.length === 1 || (play.data.artists.length > 1 && artistsParseMonolithicOnly === false)) {

                for(const artist of play.data.artists) {
                
                    const matchedIgnoreArtists = ignoreArtistsRegex.map(x => ({reg: x.toString(), res: parseRegexSingle(x, artist)})).filter(x => x !== undefined);
                    if(matchedIgnoreArtists.length > 0) {
                        this.logger.debug(`Will not parse artist because it matched an ignore regex:\n${matchedIgnoreArtists.map(x => `Reg: ${x.reg} => ${x.res.match}`).join('\n')}`);
                        artists.push(artist);
                    } else {
                        const artistCredits = parseArtistCredits(artist, delimiters);
                        if (artistCredits !== undefined) {
                            if (artistCredits.primary !== undefined) {
                                artists.push(artistCredits.primary);
                            }
                            if (artistCredits.secondary !== undefined) {
                                artists = artists.concat(artistCredits.secondary);
                            }
                        } else {
                            // couldn't parse anything from artist string, use as-is
                            artists.push(artist);
                        }
                    }

                }

            } else {
                // user does not want to try to parse artists when we already have more than one artist string
                // -- likely this is because the user knows the artist data is already good and shouldn't be modified
                artists = play.data.artists;
            }

        }

        if(parseArtistsFrom.includes('title')) {
            const trackArtists = parseTrackCredits(play.data.track, delimiters);
            if (trackArtists !== undefined && trackArtists.secondary !== undefined) {
                artists = artists.concat(trackArtists.secondary);
            }
        }

        artists = uniqueNormalizedStrArr([...artists]);

        return {
            ...play,
            data: {
                ...play.data,
                artists
            }
        };
    }

    protected async handleTitle(play: PlayObject, parts: ExternalMetadataTerm, _transformData: undefined): Promise<string | undefined> {
        return play.data.track;
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
    protected async handleAlbumArtists(play: PlayObject, parts: ExternalMetadataTerm, _transformData: undefined): Promise<string[] | undefined> {
        return play.data.albumArtists;
    }
    protected async handleAlbum(play: PlayObject, parts: ExternalMetadataTerm, _transformData: undefined): Promise<string | undefined> {
        return play.data.album;
    }

    public notify(payload: WebhookPayload): Promise<void> {
        return;
    }
    protected getIdentifier(): string {
        return 'Native Transformer';
    }

}