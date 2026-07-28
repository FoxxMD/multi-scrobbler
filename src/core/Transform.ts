import * as z from "zod";
import type {SearchAndReplaceRegExp} from "@foxxmd/regex-buddy-core";
import type { MarkRequired } from "ts-essentials";
import { stripIndents } from "common-tags";

// The following generic types are used elsewhere in the codebase with several different concrete type
// parameters (e.g. `PlayTransformHooks<ExternalMetadataTerm>`, `PlayTransformStage<SearchAndReplaceTerm[]>`,
// `PlayTransformUserStage<ConditionalSearchAndReplaceRegExp[]>`). Zod schemas cannot be generic the way a
// TypeScript interface can, so these are intentionally left as plain types. `PlayTransformOptions` and
// `PlayTransformRules` below are instead built from concrete, hand-resolved zod schemas that represent one
// specific instantiation of this generic machinery.

export type PlayTransformParts<T, Y = StageTyped> = Extract<PlayTransformStage<T>, Y> & Whennable;
//export type PlayTransformUserParts<T> = PlayTransformUserStage<T[]> & { when?: WhenConditionsConfig };
//export type PlayTransformMetaParts<T = ExternalMetadataTerm> = PlayTransformMetadataStage<T> & { when?: WhenConditionsConfig };
export type PlayTransformPartsArray<T, Y = StageTyped> = PlayTransformParts<T, Y>[];

/** Represents the weakly-defined user config. May be an array of parts or one parts object
 */
export type PlayTransformPartsConfig<T, Y = StageTyped> = PlayTransformPartsArray<T, Y> | PlayTransformParts<T, Y>;

export interface PlayTransformPartsAtomic<T> {
    title?: T
    artists?: T
    albumArtists?: T
    album?: T
    duration?: T
    meta?: T
}

export const STAGE_TYPES_USER: StageTypeUser[] = ['user'];
export const STAGE_TYPES_METADATA: StageTypeMetadata[] = ['musicbrainz','native'];
export const STAGE_TYPES: StageType[] = [...STAGE_TYPES_METADATA, ...STAGE_TYPES_USER];

export interface StageTyped {
    type: StageType
}

// export interface NotStageTyped {
//     //type?: never
// }
// export type MaybeStageTyped = StageTyped | NotStageTyped;

export interface AtomicStageConfig<T> extends StageConfig, PlayTransformPartsAtomic<T> {}

export interface PlayTransformStageTyped<T> extends PlayTransformPartsAtomic<T> {
    type: StageType
}

export interface PlayTransformUserStage<T> extends StageConfig, PlayTransformPartsAtomic<T> {
    type: StageTypeUser
}

// export interface PlayTransformGenericStage<T> extends StageConfig, PlayTransformPartsAtomic<T> {
//     type: string
// }

// export interface UntypedPlayTransformUserStage<T> extends UntypedStageConfig, PlayTransformPartsAtomic<T> {

// }

export type PlayTransformStage<T> = PlayTransformMetadataStage | PlayTransformUserStage<T> | PlayTransformNativeStage;// | UntypedPlayTransformUserStage<T> | PlayTransformGenericStage<any>;

/** Represents the plain json user-configured structure (input)
 */
export interface PlayTransformHooksConfig<T> {
    preCompare?: PlayTransformPartsConfig<T>
    compare?: {
        candidate?: PlayTransformPartsConfig<T>
        existing?: PlayTransformPartsConfig<T>
    }
    postCompare?: PlayTransformPartsConfig<T>
}

/** Represents the final, strongly-typed transform configuration used during runtime
 */
export interface PlayTransformHooks<T> extends PlayTransformHooksConfig<T> {
    preCompare?: PlayTransformPartsArray<T, StageTyped>
    compare?: {
        candidate?: PlayTransformPartsArray<T, StageTyped>
        existing?: PlayTransformPartsArray<T, StageTyped>
    }
    postCompare?: PlayTransformPartsArray<T, StageTyped>
}

export type TransformHook = 'preCompare' | 'compare' | 'candidate' | 'existing' | 'postCompare';
export const TRANSFORM_HOOK = {
    preCompare: 'preCompare' as TransformHook,
    candidate: 'candidate' as TransformHook,
    existing: 'existing' as TransformHook,
    postCompare: 'postCompare' as TransformHook,
}

export type WhenParts<T> = PlayTransformPartsAtomic<T>;
export type WhenConditions<T> = WhenParts<T>[];

// --------------------------------------------------------------------------------------------------------
// Concrete zod schemas
//
// Everything below backs the non-generic types that the generic scaffolding above is built from/into.
// `PlayTransformOptions` (raw user JSON) and `PlayTransformRules` (the strongly-typed runtime result) are
// each a specific instantiation of `PlayTransformHooksConfig<T>` / `PlayTransformHooks<T>`. Rather than try
// to make those interfaces themselves generic in zod, this section hand-resolves the two concrete `T`s that
// matter (the user-facing term shape vs. the normalized rule-term shape) and builds each stage variant once
// per instantiation.
// --------------------------------------------------------------------------------------------------------

// Helper used to construct a concrete `PlayTransformPartsAtomic<T>` schema for a given term schema, since
// `PlayTransformPartsAtomic<T>` itself can't be represented generically in zod.
const buildPartsAtomicSchema = <T extends z.ZodTypeAny>(term: T) => z.object({
        title: term.optional(),
        artists: term.optional(),
        albumArtists: term.optional(),
        album: term.optional(),
        duration: term.optional(),
        meta: term.optional(),
    });

const buildWhennablePartschema = <T extends z.ZodTypeAny>(term: T) => z.object({
        /** A string or regex pattern matching the title of a Play */
        title: term.optional().meta({description: 'A string or regex pattern matching the title of a Play'}),
        /** A string or regex pattern matching any artist of a Play */
        artists: term.optional().meta({description: 'A string or regex pattern matching any artist of a Play'}),
        /** A string or regex pattern matching any album artist of a Play */
        albumArtists: term.optional().meta({description: 'A string or regex pattern matching any artist of a Play'}),
        /** A string or regex pattern matching the album of a Play */
        album: term.optional().meta({description: 'A string or regex pattern matching the album of a Play'}),
    });

const whenPartsStringSchema = buildWhennablePartschema(z.string());

export const whenConditionsConfigSchema = z.array(whenPartsStringSchema);

export type WhenConditionsConfig = z.infer<typeof whenConditionsConfigSchema>;

export const whennableSchema = z.object({
    /** Only use this Stage (or Rules) if the properties in this object match the corresponding property in a Play. The value of each property is a string or regex pattern to match. */
    when: whenConditionsConfigSchema.optional().meta({description: 'Only use this Stage (or Rules) if the properties in this object match the corresponding property in a Play. The value of each property is a string or regex pattern to match.'})
});

export type Whennable = z.infer<typeof whennableSchema>;

// `SearchAndReplaceRegExp` (from `@foxxmd/regex-buddy-core`) declares `test?: (obj: SearchAndReplaceRegExp) => boolean`.
// Zod can only structurally confirm this is a function, not validate its signature/behavior, so `z.custom` is
// used as a best-effort check.
export const conditionalSearchAndReplaceRegExpSchema = z.object({
    ...whennableSchema.shape,
    /** The plain string or regex pattern to match */
    search: z.string().meta({description: 'The plain string or regex pattern to match'}),
    /** The replacement string. Can be empty string or use js replacement string pattern */
    replace: z.string().meta({description: 'The replacement string. Can be empty string or use js replacement string pattern'}),
    test: z.custom<(obj: SearchAndReplaceRegExp) => boolean>((val) => typeof val === 'function').optional(),
});

// need to set tsconfig compiler option "strictNullChecks": true to make the inferred type not have search as optional
// but it causes too many errors at the moment
// so workaround by explicitly marking it as required for this type
// https://stackoverflow.com/a/77256318
export type ConditionalSearchAndReplaceRegExp = MarkRequired<z.infer<typeof conditionalSearchAndReplaceRegExpSchema>, 'search'>;

// `Exclude<ConditionalSearchAndReplaceRegExp, 'test'>` is a no-op in the original type: `Exclude` only
// removes union members, and `ConditionalSearchAndReplaceRegExp` is an object type, not a union containing
// the literal `'test'`. So this type is identical to `ConditionalSearchAndReplaceRegExp`.
const {
    test,
    ...restConditionalRegSchema
} = conditionalSearchAndReplaceRegExpSchema.shape;
export const conditionalSearchAndReplaceTermSchema = z.object(restConditionalRegSchema).meta({title: 'Conditional Search and Replace Term'});

export type ConditionalSearchAndReplaceTerm = z.infer<typeof conditionalSearchAndReplaceTermSchema>;

export const searchAndReplaceTermSchema = z.union([z.string(), conditionalSearchAndReplaceTermSchema]).meta({title: 'Search and Replace Term'});

export type SearchAndReplaceTerm = z.infer<typeof searchAndReplaceTermSchema>;

export const externalMetadataTermSchema = z.union([z.boolean(), whennableSchema]).optional().meta({title: 'Ext Metadata Term'});

export type ExternalMetadataTerm = z.infer<typeof externalMetadataTermSchema>;

export const flowControlTermSchema = z.enum(['continue', 'stop']).meta({title: 'Flow Control Term'});

export type FlowControlTerm = z.infer<typeof flowControlTermSchema>;
export const FLOW_CONTROL_TERM = {
    continue: 'continue',
    stop: 'stop'
} as const satisfies Record<string, FlowControlTerm>;

export const flowControlSchema = z.object({
    onSuccess: flowControlTermSchema,
    onFailure: flowControlTermSchema,
    onSkip: flowControlTermSchema,
    failureReturnPartial: z.boolean(),
}).meta({title: 'Flow Control'});

export type FlowControl = z.infer<typeof flowControlSchema>;

export const stageTypeMetadataSchema = z.enum(['musicbrainz', 'native']).meta({title: 'Stage Type Metadata'});

export const typedStageSchema = z.enum(['musicbrainz', 'native','user']).meta({title: 'Stage Type'});

export type StageTypeMetadata = z.infer<typeof stageTypeMetadataSchema>;

export const stageTypeUserSchema = z.literal('user').meta({title: 'Stage Type User'});

export type StageTypeUser = z.infer<typeof stageTypeUserSchema>;

// `StageTypeMetadata | StageTypeUser | string` collapses to `string` (the literal members are absorbed by
// the wider `string` member), so the schema is just `z.string()`.
export const stageTypeSchema = z.string().meta({title: 'Stage Type'});

export type StageType = z.infer<typeof stageTypeSchema>;

export const stageTypedConfigSchema = z.object({
    type: typedStageSchema,
}).meta({title: 'Stage Type Config'});

export type StageTypedConfig = z.infer<typeof stageTypedConfigSchema>;

export const stageConfigSchema = z.object({
    ...stageTypedConfigSchema.shape,
    ...whennableSchema.shape,
    ...flowControlSchema.partial().shape,
    name: z.string().optional(),
    stageHash: z.string().optional(),
}).meta({title: 'Stage Config'});

export type StageConfig = z.infer<typeof stageConfigSchema>;

export const untypedStageConfigSchema = z.object({
    ...whennableSchema.shape,
    ...flowControlSchema.partial().shape,
    name: z.string().optional(),
});

export type UntypedStageConfig = z.infer<typeof untypedStageConfigSchema>;

const metadataAtomicSchema = buildPartsAtomicSchema(externalMetadataTermSchema);

export const playTransformMetadataStageSchema = z.object({
    ...stageConfigSchema.shape,
    ...metadataAtomicSchema.shape,
    score: z.number().optional(),
    type: stageTypeMetadataSchema,
}).meta({title: 'Transform Metadata Stage'});

export type PlayTransformMetadataStage = z.infer<typeof playTransformMetadataStageSchema>;

export const playTransformNativeStageSchema = z.object({
    ...stageConfigSchema.shape,
    ...metadataAtomicSchema.shape,
    type: z.literal('native'),
}).meta({title: 'Transform Native Stage'});

export type PlayTransformNativeStage = z.infer<typeof playTransformNativeStageSchema>;

// `type: any` stage, shared as-is between the Options and Rules pools below (it doesn't depend on the outer T).
//const anyAtomicSchema = buildPartsAtomicSchema(z.any());
// const playTransformGenericStageSchema = z.object({
//     ...stageConfigSchema.shape,
//     ...anyAtomicSchema.shape,
//     type: stageTypeSchema,
// }).meta({title: 'Transform Generic Stage'});

// `PlayTransformOptions` term shape: T = SearchAndReplaceTerm[] | ExternalMetadataTerm
//const optionsPartsTermSchema = z.union([z.array(searchAndReplaceTermSchema), externalMetadataTermSchema]);
const optionsAtomicSchema = buildPartsAtomicSchema(z.array(searchAndReplaceTermSchema));

const playTransformUserStageOptionsSchema = z.object({
    ...stageConfigSchema.shape,
    ...optionsAtomicSchema.shape,
    type: z.literal('user'),
}).meta({title: 'Tranform User Stage'});

// const untypedPlayTransformUserStageOptionsSchema = z.object({
//     ...untypedStageConfigSchema.shape,
//     ...optionsAtomicSchema.shape,
// }).meta({title: 'Transform User Stage'});

// `PlayTransformRules` term shape: T = ConditionalSearchAndReplaceRegExp[] | ExternalMetadataTerm
//const rulesPartsTermSchema = z.union([z.array(conditionalSearchAndReplaceRegExpSchema), externalMetadataTermSchema]).meta({title: 'Rule Parts Term'});
const rulesAtomicSchema = buildPartsAtomicSchema(z.array(searchAndReplaceTermSchema)).meta({title: 'Rules Atomic'});

const playTransformUserStageRulesSchema = z.object({
    ...stageConfigSchema.shape,
    ...rulesAtomicSchema.shape,
    type: z.literal('user'),
}).meta({title: 'User Stage Rules'});

// zod's `discriminatedUnion` requires each branch's discriminant literal(s) to be unique across the whole
// union. `StageTypeMetadata` nominally includes `'native'`, but `'native'`-typed stages are represented by
// the dedicated, stricter `playTransformNativeStageSchema` (no `score` field) instead. This narrows the
// metadata branch to `'spotify' | 'musicbrainz'` only for the purposes of this union - the overall set of
// `type` values covered across the whole union is unchanged.
const metadataStageForUnionSchema = playTransformMetadataStageSchema.extend({
    type: z.enum(['musicbrainz']),
}).meta({title: 'Transform External Stage'});

// `PlayTransformParts<T, Y> = Extract<PlayTransformStage<T>, Y> & Whennable` - the `& Whennable` intersection
// is redundant here since every stage schema already includes `when` via `stageConfigSchema`/`untypedStageConfigSchema`.

// Options pool: `Extract<PlayTransformStage<T>, MaybeStageTyped>` doesn't filter anything out, since every
// member of `PlayTransformStage<T>` already structurally satisfies `StageTyped | NotStageTyped`.
const playTransformTypedStageOptionsSchema = z.discriminatedUnion('type', [
    metadataStageForUnionSchema,
    playTransformNativeStageSchema,
    playTransformUserStageOptionsSchema,
]).meta({title: 'Stage'});
// const playTransformStageOptionsSchema = z.union([
//     playTransformTypedStageOptionsSchema,
//     playTransformGenericStageSchema,
//     untypedPlayTransformUserStageOptionsSchema,
// ]).meta({title: 'Stage'});

// Rules pool: `Extract<PlayTransformStage<T>, StageTyped>` excludes `UntypedPlayTransformUserStage<T>`,
// since it has no `type` field and so isn't assignable to `StageTyped`.
const playTransformTypedStageRulesSchema = z.discriminatedUnion('type', [
    metadataStageForUnionSchema,
    playTransformNativeStageSchema,
    playTransformUserStageRulesSchema,
]);
// const playTransformStageRulesSchema = z.union([
//     playTransformTypedStageRulesSchema,
//     playTransformGenericStageSchema,
// ]);

const playTransformPartsConfigOptionsSchema = z.union([
    z.array(playTransformTypedStageOptionsSchema),
    playTransformTypedStageOptionsSchema,
]);

export const playTransformConfigSchema = z.object({
    /** Stages to be applied when a Play is first seen by this component */
    preCompare: playTransformPartsConfigOptionsSchema.optional().meta({description: 'Stages to be applied when a Play is first seen by this component'}),
    /** Stages to be applied when comparing a candidate Play to any existing Plays such as when checking for duplicates or discovered Plays
     * 
     * **Note:** Transforms applies are not persistent. They are used only during comparison operations.
     */
    compare: z.object({
        /** Stages to apply to the Play being considered for discovery or scrobbling */
        candidate: playTransformPartsConfigOptionsSchema.optional().meta({description: `Stages to apply to the Play being considered for discovery or scrobbling`}),
        /** Stages to apply to the existing Plays (already discovered, existing scrobbles) */
        existing: playTransformPartsConfigOptionsSchema.optional().meta({description: `Stages to apply to the existing Plays (already discovered, existing scrobbles)`}),
    }).optional().meta({description: stripIndents`Stages to be applied when comparing a candidate Play to any existing Plays such as when checking for duplicates or discovered Plays
        
        **Note:** Transforms applies are not persistent. They are used only during comparison operations.`}),
    postCompare: playTransformPartsConfigOptionsSchema.optional().meta({
        description: 'Stages applied before Play is sent downstream (to MS Client or just before being scrobbling)'
    }),
}).meta({title: 'Transform Config'});

export type PlayTransformConfig = z.infer<typeof playTransformConfigSchema>;

/** Represents the plain json user-configured structure (input). Used to validate user input (json). */
export const playTransformOptionsSchema = z.object({
    ...playTransformConfigSchema.shape,
    log: z.union([z.boolean(), z.literal('all')]).optional(),
}).meta({title: 'Transform Options', description: 'Enhance/correct Play data by applying a transform pipeline'});

export type PlayTransformOptions = z.infer<typeof playTransformOptionsSchema>;

const playTransformPartsArrayRulesSchema = z.array(playTransformTypedStageRulesSchema).meta({title: 'Transform Parts'});

/** Represents the final, strongly-typed transform configuration used during runtime. */
export const playTransformRulesSchema = z.object({
    preCompare: playTransformPartsArrayRulesSchema.optional().meta({description: 'Stages to be applied when a Play is first seen by this component'}),
    compare: z.object({
        candidate: playTransformPartsArrayRulesSchema.optional(),
        existing: playTransformPartsArrayRulesSchema.optional(),
    }).optional(),
    postCompare: playTransformPartsArrayRulesSchema.optional(),
}).meta({title: 'Transform Rules'});

export type PlayTransformRules = z.infer<typeof playTransformRulesSchema>;

// Converting raw user JSON (`PlayTransformOptions`) into the normalized runtime shape (`PlayTransformRules`)
// requires real business logic - assigning default `type`s to untyped user stages, normalizing the
// single-object-or-array shorthand into arrays, and resolving bare string search/replace shorthand into full
// `ConditionalSearchAndReplaceRegExp` objects. That logic already lives in
// `AbstractComponent.transformPartToStrong` and is out of scope here, so this transform is stubbed only.
export const playTransformOptionsToRulesSchema = playTransformOptionsSchema.transform((val): PlayTransformRules => {
    throw new Error('Not implemented: use AbstractComponent.transformPartToStrong for PlayTransformOptions -> PlayTransformRules normalization');
}).meta({title: 'Transform Options to Rules'});
