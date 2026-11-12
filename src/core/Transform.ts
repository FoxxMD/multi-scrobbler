import * as z from "zod";
import { durationComparisonSchema } from "./TimeUtils.ts";

export const META_PROVIDER_STAGE_TYPES = z.enum(['musicbrainz','rocksky','spotify']);
export type MetadataProviderStageType = z.infer<typeof META_PROVIDER_STAGE_TYPES>;
export const metadataPreferredProviderSchema = z.partialRecord(META_PROVIDER_STAGE_TYPES, z.union([z.string(), z.literal(true)])).meta({title: 'Metadata Preferred Providers'});
export type MetadataPreferredProviders = z.infer<typeof metadataPreferredProviderSchema>;

export type TransformHook = 'preCompare' | 'compare' | 'candidate' | 'existing' | 'postCompare';
export const TRANSFORM_HOOK = {
    preCompare: 'preCompare' as TransformHook,
    candidate: 'candidate' as TransformHook,
    existing: 'existing' as TransformHook,
    postCompare: 'postCompare' as TransformHook,
}

export const flowControlTermSchema = z.enum(['continue', 'stop']).meta({title: 'Flow Control Term'});

export type FlowControlTerm = z.infer<typeof flowControlTermSchema>;

export const actionTermSchema = z.enum(['approve','ignore','review']).meta({title: 'Action Term'});

export type ActionTerm = z.infer<typeof actionTermSchema>;

/** Options for a configured Transformer, not used in a Stage */
export const transformOptionsSchema = z.object({
    failOnFetch: z.boolean().optional(),
    throwOnFailure: z.union([z.boolean(), z.array(z.enum(['artists', 'title', 'albumArtists', 'album', 'duration', 'meta', 'art']))]).optional().meta({description: 'Throw (fail Stage) if transforming any/these parts fails'}),
    ttl: z.string().optional().meta({description: 'How long to cache transform results. Default 15s'}),
}).meta({title: 'Transformer Options'});

export type TransformOptions = z.infer<typeof transformOptionsSchema>;

/** A configured Transformer (`transformers` in AIO config) that Stages of the same type use */
export const transformerConfigSchema = z.object({
    type: z.string().meta({description: 'Stage type this Transformer is for'}),
    name: z.string().optional().meta({description: 'Unique name, used as Stage name in a Hook'}),
    defaults: z.record(z.string(), z.any()).optional().meta({description: 'Default Stage options when used in a Hook'}),
    data: z.record(z.string(), z.any()).optional().meta({description: 'Data needed to setup the Transformer (API url, credentials...)'}),
    options: transformOptionsSchema.optional(),
}).meta({title: 'Transformer'});

export type TransformerCommonConfig = z.infer<typeof transformerConfigSchema>;

/** Transformer config after it has been named. Each Stage narrows `defaults`/`data` with its own types */
export type TransformerCommon = TransformerCommonConfig & { name: string };

/* ------------------------------------------------------------------
 * Generic Stage building blocks
 *
 * Normalization of lenient user config (single object or array, string shorthand, etc...) happens in zod transforms
 * so the parsed (output) shape is always the strict runtime shape. Stage-specific schemas are built from these by each Stage, next to its Transformer.
 *
 * */

/** Accept a single item or an array of items, always output an array */
export const maybeArraySchema = <T extends z.ZodType>(item: T) =>
    z.union([z.array(item), item]).transform((x): z.output<T>[] => Array.isArray(x) ? x : [x]);

export const whenPartsSchema = z.object({
    title: z.string().optional().meta({description: 'String or regex matching Play title'}),
    artists: z.string().optional().meta({description: 'String or regex matching any Play artist'}),
    albumArtists: z.string().optional().meta({description: 'String or regex matching any Play album artist'}),
    album: z.string().optional().meta({description: 'String or regex matching Play album'}),
    art: z.string().optional().meta({description: 'String or regex matching any Play art url. Empty string matches no art'}),
    artist: z.string().optional().meta({description: 'Alias of artists', deprecated: true}),
    albumArtist: z.string().optional().meta({description: 'Alias of albumArtists', deprecated: true}),
    duration: durationComparisonSchema.optional().meta({description: 'Compare duration of the track against a value'}),
    listenedFor: durationComparisonSchema.optional().meta({description: 'Compare time listened for against a value'}),
    deviceId: z.string().optional().meta({description: 'String or regex matching device id'}),
    user: z.string().optional().meta({description: 'String or regex matching user id/name'}),
    library: z.string().optional().meta({description: 'String or regex matching library id/name'}),
    musicService: z.string().optional().meta({description: 'String or regex matching original music service'}),
    playlist: z.string().optional().meta({description: 'String or regex matching playlist id/name'}),
}).transform(({artist, albumArtist, ...rest}) => ({
    ...rest,
    ...(rest.artists === undefined && artist !== undefined ? {artists: artist} : {}),
    ...(rest.albumArtists === undefined && albumArtist !== undefined ? {albumArtists: albumArtist} : {}),
})).meta({title: 'When Condition', description: 'All properties must match (AND)'});

export type WhenParts = z.output<typeof whenPartsSchema>;

export const whenSchema = maybeArraySchema(whenPartsSchema).meta({title: 'When', description: 'Only run if any condition matches (OR)'});

export type WhenConditions = z.output<typeof whenSchema>;

/**
 * Build a term that tests a Play part, optionally only when `when` matches
 *
 * Always outputs `{search, when?}` where `search` is the output of `test` (string, parsed comparison, etc...)
 *
 * @param title Identifies this term in a union/docs
 * */
export const buildSearchTermSchema = <T extends z.ZodType>(test: T, title: string) => z.union([
    test.transform((search): {search: z.output<T>, when?: WhenConditions} => ({search})),
    z.object({
        search: test,
        when: whenSchema.optional(),
    }).meta({title: `${title} When`, description: 'Only test if when matches'}),
]).meta({title});

export const searchTermSchema = buildSearchTermSchema(z.string().meta({title: 'Search String', description: 'String or regex to match'}), 'Search Term');

export type SearchTerm<T = string> = {search: T, when?: WhenConditions};

export const searchReplaceTermSchema = z.union([
    z.string().meta({title: 'Search Term', description: 'String or regex to remove'}),
    z.object({
        search: z.string().meta({description: 'String or regex to match'}),
        replace: z.string().meta({description: 'Replacement string. May be empty'}),
        when: whenSchema.optional(),
    }).meta({title: 'Search and Replace Term'}),
]).transform((x) => typeof x === 'string' ? {search: x, replace: ''} : x).meta({title: 'Search and Replace'});

export type SearchReplaceTerm = z.output<typeof searchReplaceTermSchema>;

/** Rule term for Stages that produce their own data: apply (true), ignore (false), or apply conditionally */
export const applyTermSchema = z.union([
    z.boolean().meta({title: 'Apply', description: 'Use transformed data for this part?'}),
    z.object({
        when: whenSchema.optional(),
    }).meta({title: 'Apply When', description: 'Use transformed data for this part if when matches'}),
]).meta({title: 'Apply Rule'});

export type ApplyTerm = z.output<typeof applyTermSchema>;

export const RULE_PARTS = ['title', 'artists', 'albumArtists', 'album', 'duration', 'meta', 'art'] as const;
export type RulePart = typeof RULE_PARTS[number];

/**
 * Build a single Rule from the term schema it accepts
 *
 * Use to add Stage-specific Rules to the result of `buildRulesSchema` with `.extend()`
 *
 * @param defaultVal Value when not specified by the user. Without a default the Rule is optional (undefined)
 * */
export const buildRuleSchema = <T extends z.ZodType>(term: T, defaultVal: z.output<T> | undefined, description: string) =>
    // ponytail: cast so defaulted and optional rules share one type, both output z.output<T> | undefined
    (defaultVal !== undefined ? term.default(defaultVal as never) : term.optional()).meta({description}) as unknown as z.ZodOptional<T>;

/**
 * Build the Rules (per Play part) for a Stage from the term schema each part accepts
 *
 * @param defaults Value for a part when it is not specified by the user. Parts without a default are optional (undefined)
 * */
export const buildRulesSchema = <T extends z.ZodType>(term: T, defaults: Partial<Record<RulePart, z.output<T>>> = {}) => {
    const rule = (part: RulePart, description: string) => buildRuleSchema(term, defaults[part], description);
    return z.object({
        title: rule('title', 'Rule for Play title'),
        artists: rule('artists', 'Rule for Play artists'),
        albumArtists: rule('albumArtists', 'Rule for Play album artists'),
        album: rule('album', 'Rule for Play album'),
        duration: rule('duration', 'Rule for Play duration'),
        meta: rule('meta', 'Rule for Play meta (MBIDs, ISRC...)'),
        art: rule('art', 'Rule for Play art'),
    });
}

/** Properties shared by every Stage, used in a Hook */
export const stageCommonSchema = z.object({
    name: z.string().optional().meta({description: 'Name of configured Stage to use'}),
    when: whenSchema.optional(),
    onSuccess: flowControlTermSchema.optional().meta({description: 'Default: continue'}),
    onFailure: flowControlTermSchema.optional().meta({description: 'Default: stop'}),
    onSkip: flowControlTermSchema.optional().meta({description: 'Default: continue'}),
    onSuccessAction: actionTermSchema.optional(),
    onFailureAction: actionTermSchema.optional(),
    onSkipAction: actionTermSchema.optional(),
    failureReturnPartial: z.boolean().optional().meta({description: 'On failure, keep changes from earlier Stages in Hook'}),
});

export type StageCommon = z.output<typeof stageCommonSchema> & {
    type: string
    /** Set at runtime from the hash of the Stage's Transformer config */
    stageHash?: string
};

/**
 * Build a Stage schema (used in a Hook) from its type, rules, and Stage-specific options. All properties are flat.
 *
 * Add `.meta({title})` to the result so it is identifiable in a union.
 * */
export const buildStageSchema = <Type extends string, R extends z.ZodRawShape, O extends z.ZodRawShape>(type: Type, rules: z.ZodObject<R>, options: z.ZodObject<O>) =>
    z.object({
        type: z.literal(type),
        ...stageCommonSchema.shape,
        ...rules.shape,
        ...options.shape,
    });

/** Normalize `type` of raw Stage config so it can be matched case-insensitively */
export const normalizeStageType = (val: unknown): unknown => {
    if (val !== null && typeof val === 'object' && 'type' in val && typeof val.type === 'string') {
        return {...val, type: val.type.trim().toLocaleLowerCase()};
    }
    return val;
}

/** Build the Hooks config (`playTransform`) from a Stage schema (usually a union of all Stages) */
export const buildPlayTransformSchema = <S extends z.ZodType>(stage: S) => {
    const hook = maybeArraySchema(z.preprocess((val: z.input<S>) => normalizeStageType(val), stage));
    return z.object({
        preCompare: hook.optional().meta({description: 'Stages applied when Play is first seen'}),
        compare: z.object({
            candidate: hook.optional().meta({description: 'Stages applied to the Play being compared'}),
            existing: hook.optional().meta({description: 'Stages applied to existing Plays it is compared to'}),
        }).optional().meta({description: 'Stages applied only during comparison. Not persisted'}),
        postCompare: hook.optional().meta({description: 'Stages applied before Play is sent downstream'}),
        log: z.union([z.boolean(), z.literal('all')]).optional().meta({description: "Log transform diffs. 'all' logs each Stage"}),
    }).meta({title: 'Transform Options', description: 'Enhance/correct Play data by applying a transform pipeline'});
}

/** Hooks with each Stage parsed and merged with the config of the Transformer that runs it. Used at runtime */
export interface PlayTransformRules {
    preCompare?: StageCommon[]
    compare?: {
        candidate?: StageCommon[]
        existing?: StageCommon[]
    }
    postCompare?: StageCommon[]
}

export const DEFAULT_TRANSFORMER_NAME = 'MSDefault';
export const DEFAULT_TRANSFORMER_ENV_NAME = 'MSEnv';

