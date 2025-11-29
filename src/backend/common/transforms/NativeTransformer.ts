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
}

export type NativeTransformerConfig = TransformerCommon<NativeTransformerData>;

export default class NativeTransformer extends AtomicPartsTransformer<ExternalMetadataTerm, PlayObject | undefined> {

    declare config: NativeTransformerConfig;

    ignoreArtistsRegex: RegExp[] = [];
    delimiters?: string[]
    parseArtistsFrom: ArtistParseSource[]

    public constructor(config: NativeTransformerConfig, options: TransformerOptions) {
        super(config, options);
    }

    protected async doBuildInitData(): Promise<true | string | undefined> {
        if(this.config.data === undefined) {
            return true;
        }
        if(this.config.data === null || typeof this.config.data !== 'object') {
            throw new Error('Native Transformer data should be an object or not defined.');
        }
        if(this.config.data.artistsIgnore !== undefined) {
            this.config.data.artistsIgnore = asArray(this.config.data.artistsIgnore);
            const nonStr = this.config.data.artistsIgnore.filter(x => typeof x !== 'string');
            if(nonStr.length > 0) {
                throw new Error(`ignoreArtists must be an array of strings but non-strings found: ${nonStr.map(x => (x as unknown).toString()).join(' | ')}`)
            }
            for(const i of this.config.data.artistsIgnore) {
                try {
                    this.ignoreArtistsRegex.push(parseToRegexOrLiteralSearch(i));
                } catch (e) {
                    throw new Error(`Could not convert ignoreArtist string to regex (or literal): ${i}`);
                }
            }
            this.logger.debug(`Ignoring artists using ${this.config.data.artistsIgnore.length} rules`);
        }

        if(this.config.data.delimiters !== undefined) {
            this.delimiters = asArray(this.config.data.delimiters);
            this.logger.debug(`Using user-defined delimiters '${this.config.data.delimitersExtra.join(' ')}' instead of built-ins`);
        } else if(this.config.data.delimitersExtra !== undefined) {
            this.delimiters = [...DELIMITERS_NO_AMP, ...(asArray(this.config.data.delimitersExtra))];
            this.logger.debug(`Using extra delimiters '${this.config.data.delimitersExtra.join(' ')}' with built-in delimiters '${DELIMITERS_NO_AMP.join(' ')}'`);
        }

        if(this.delimiters !== undefined) {
            this.delimiters.map(x => x.trim());
        }

        if(this.config.data.artistsParseFrom !== undefined) {
            const arr = asArray(this.config.data.artistsParseFrom);
            this.parseArtistsFrom = arr.map(asArtistParseSource);
        }
        this.logger.debug(`Will try to parse artists from ${this.parseArtistsFrom.join(' and ')} string`);
    }

    protected doParseConfig(data: StageConfig) {
        if (data.type !== 'native') {
            throw new Error(`NativeTransformer is only usable with 'native' type stages`);
        }

        const stage: PlayTransformNativeStage = {
            ...data,
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

    public async getTransformerData(play: PlayObject): Promise<PlayObject> {
        let artists = [];
        const {
            artistsParseFrom: parseArtistsFrom = ['artists', 'title']
        } = this.config.data;

        if (play.data.artists.length === 1 && parseArtistsFrom.includes('artists')) {
            const matchedIgnoreArtists = this.ignoreArtistsRegex.map(x => ({reg: x.toString(), res: parseRegexSingle(x, play.data.artists[0])})).filter(x => x !== undefined);
            if(matchedIgnoreArtists.length > 0) {
                this.logger.debug(`Will not parse artist because it matched an ignore regex:\n${matchedIgnoreArtists.map(x => `Reg: ${x.reg} => ${x.res.match}`).join('\n')}`)
            } else {
                const artistCredits = parseArtistCredits(play.data.artists[0], this.delimiters);
                if (artistCredits !== undefined) {
                    if (artistCredits.primary !== undefined) {
                        artists.push(artistCredits.primary);
                    }
                    if (artistCredits.secondary !== undefined) {
                        artists = artists.concat(artistCredits.secondary);
                    }
                }
            }
            if(artists.length === 0) {
                artists.push(play.data.artists[0]);
            }
        }

        if(parseArtistsFrom.includes('title')) {
            const trackArtists = parseTrackCredits(play.data.track, this.delimiters);
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