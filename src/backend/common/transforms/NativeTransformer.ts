import type { Credit, ParseDecision, ParseRecord } from "../../../core/Atomic.ts";
import type { PlayObject } from "../../../core/PlaySchema.ts";
import type {WebhookPayload} from "../infrastructure/config/health/webhooks.ts";
import {applyTermSchema, type ApplyTerm, buildRulesSchema, buildStageSchema, type TransformerCommon} from "../../../core/Transform.ts";
import * as z from "zod";
import AtomicPartsTransformer from "./AtomicPartsTransformer.ts";
import { parseWithoutReference } from "../../utils/CreditPipeline.ts";
import { parseToRegexOrLiteralSearch } from "@foxxmd/regex-buddy-core";
import type {TransformerOptions} from "./AbstractTransformer.ts";
import { DELIMITERS_NO_AMP } from '../../../core/Atomic.ts';
import { asArray } from "../../utils/DataUtils.ts";
import { MaybeLogger } from '../MaybeLogger.ts';
import { childLogger } from "@foxxmd/logging";
import { creditsToNames, nameToCredit } from "../../../core/MusicMetadata.ts";
import { SimpleError } from "../errors/MSErrors.ts";

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

const stringOrArraySchema = z.union([z.string(), z.array(z.string())]);

/** Native Stage options. Used for transformer `defaults` and for overrides in a Stage. Values are normalized by `parseStageConfig` */
export const nativeStageOptionsSchema = z.object({
    delimiters: stringOrArraySchema.optional().meta({description: 'Delimiters used to split artists. Replaces built-ins'}),
    delimitersExtra: stringOrArraySchema.optional().meta({description: 'Delimiters used to split artists, in addition to built-ins'}),
    artistsIgnore: stringOrArraySchema.optional().meta({description: 'Strings or regex for artists that should not be split'}),
    artistsParseFrom: stringOrArraySchema.optional().meta({description: 'Parse artists from: artists, title. Default both'}),
    artistsParseMonolithicOnly: z.boolean().optional().meta({description: 'Only parse artists if Play has one artist. Default true'}),
    titleClean: z.boolean().optional().meta({description: 'Remove artists parsed from title'}),
});

export type NativeTransformerData = z.input<typeof nativeStageOptionsSchema>;

export const nativeStageSchema = buildStageSchema(
    'native',
    buildRulesSchema(applyTermSchema, {title: true, artists: true, albumArtists: true, album: true}),
    nativeStageOptionsSchema
).meta({title: 'Native Stage'});

export type NativeStage = z.output<typeof nativeStageSchema>;

export interface NativeTransformerDataStrong extends Omit<NativeTransformerData, 'delimitersExtra'> {
    artistsParseFrom?: ArtistParseSource[]
    artistsParseMonolithicOnly?: boolean
    ignoreArtistsRegex?: RegExp[]
    delimiters?: string[]
}

export type NativeTransformerDataStage = Omit<NativeStage, keyof NativeTransformerDataStrong> & NativeTransformerDataStrong;

export type NativeTransformerConfig = TransformerCommon & { defaults?: NativeTransformerData };

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
            throw new Error(`ignoreArtists must be an array of strings but non-strings found: ${nonStr.map(x => (x as any).toString()).join(' | ')}`)
        }
        config.ignoreArtistsRegex = [];
        for (const i of data.artistsIgnore) {
            try {
                config.ignoreArtistsRegex.push(parseToRegexOrLiteralSearch(i));
            } catch (e) {
                throw new SimpleError(`Could not convert ignoreArtist string to regex (or literal): ${i}`);
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

export default class NativeTransformer extends AtomicPartsTransformer<ApplyTerm, PlayObject | undefined, NativeTransformerDataStage> {

    declare config: NativeTransformerConfig;

    protected readonly stageSchema = nativeStageSchema;

    protected defaults: NativeTransformerDataStrong = {};

    ignoreArtistsRegex: RegExp[] = [];
    delimiters?: string[]
    parseArtistsFrom!: ArtistParseSource[]

    public constructor(config: NativeTransformerConfig, options: TransformerOptions) {
        super(config, options);
    }

    protected async doBuildInitData(): Promise<true | string | undefined> {
        this.defaults = parseStageConfig(this.config.defaults, childLogger(this.logger, 'Defaults'));
        return true;
    }

    protected doParseConfig(data: NativeTransformerDataStage): NativeTransformerDataStage {
        // Stage values override Transformer defaults, which override built-in defaults from parseStageConfig
        return {
            ...data,
            ...parseStageConfig({...(this.config.defaults ?? {}), ...data}),
        };
    }

    public async getTransformerData(play: PlayObject, stageConfig: NativeTransformerDataStage): Promise<PlayObject> {
        const {
            artistsParseFrom: parseArtistsFrom = this.defaults.artistsParseFrom ?? ['artists', 'title'],
            artistsParseMonolithicOnly = this.defaults.artistsParseMonolithicOnly ?? true,
            ignoreArtistsRegex = this.defaults.ignoreArtistsRegex ?? [],
            delimiters = this.defaults.delimiters
        } = stageConfig || {};

        const {play: transformedPlay, decisions} = nativeParseWithDecisions(play, {
            artistsParseFrom: parseArtistsFrom,
            artistsParseMonolithicOnly,
            ignoreArtistsRegex,
            delimiters,
            logger: this.logger
        });
        const record: ParseRecord = {parser: 'native', decisions};
        // shown with the transform step
        // only this stage's input, AtomicPartsTransformer appends it to any existing inputs
        transformedPlay.meta = {...transformedPlay.meta, lifecycleInputs: [{type: 'parseDecisions', input: record}]};

        return transformedPlay;
    }

    protected async handleTitle(play: PlayObject, parts: ApplyTerm, _transformData: undefined): Promise<Credit | undefined> {
        return play.data.track;
    }
    protected async handleArtists(play: PlayObject, parts: ApplyTerm, transformData: PlayObject): Promise<Credit[] | undefined> {
        // parsing creates new credits, keep the existing credit (and its metadata) for any artist whose name did not change
        return transformData.data.artists?.map(x => play.data.artists?.find(y => y.name === x.name) ?? x);
    }
    protected async handleAlbumArtists(play: PlayObject, parts: ApplyTerm, _transformData: undefined): Promise<Credit[] | undefined> {
        return play.data.albumArtists;
    }
    protected async handleAlbum(play: PlayObject, parts: ApplyTerm, _transformData: undefined): Promise<Credit | undefined> {
        return play.data.album;
    }

    public async notify(payload: WebhookPayload): Promise<void> {
    }

}

export const nativeParse = (play: PlayObject, options?: NativeTransformerDataStrong & {logger?: MaybeLogger}): PlayObject => nativeParseWithDecisions(play, options).play;

export const nativeParseWithDecisions = (play: PlayObject, options?: NativeTransformerDataStrong & {logger?: MaybeLogger}): {play: PlayObject, decisions: ParseDecision[]} => {
        const {
            artistsParseFrom = ['artists', 'title'],
            titleClean = false,
            artistsParseMonolithicOnly = true,
            ignoreArtistsRegex = [],
            delimiters,
            logger = new MaybeLogger()
        } = options || {};

        const playArtists = play.data.artists ?? [];
        const parsed = parseWithoutReference(
            // shortcut: artists are dropped when not parsing from 'artists', kept to preserve existing behavior
            artistsParseFrom.includes('artists') ? creditsToNames(playArtists) : [],
            play.data.track?.name ?? '',
            {
                artistDelimiters: delimiters,
                trackDelimiters: delimiters,
                // user does not want to try to parse artists when we already have more than one artist string
                // -- likely this is because the user knows the artist data is already good and shouldn't be modified
                splitArtists: playArtists.length === 1 || artistsParseMonolithicOnly === false,
                parseTrack: artistsParseFrom.includes('title') && play.data.track !== undefined,
                ignoreArtists: ignoreArtistsRegex,
            }
        );
        for(const d of parsed.decisions.filter(x => x.step === 'ignoreArtists')) {
            logger.debug(d.reason);
        }

        const track = titleClean && parsed.track !== undefined ? {...play.data.track!, name: parsed.track} : play.data.track;
        // keep the existing credit (and its metadata) only for artists passed through as-is, parsed names get new credits
        const artists = parsed.artists.map((x) => (parsed.keptArtists.includes(x) ? playArtists.find(y => y.name === x) : undefined) ?? nameToCredit(x));

        return {play: {
            ...play,
            data: {
                ...play.data,
                track,
                artists
            }
        }, decisions: parsed.decisions};
}