import { SearchAndReplaceRegExp } from "@foxxmd/regex-buddy-core";

export interface ConditionalSearchAndReplaceRegExp extends SearchAndReplaceRegExp, Whennable {
}

export type ConditionalSearchAndReplaceTerm = Omit<ConditionalSearchAndReplaceRegExp, 'test'>
export type SearchAndReplaceTerm = string | ConditionalSearchAndReplaceTerm;
export type ExternalMetadataTerm = boolean | undefined | Whennable;

export type PlayTransformParts<T, Y = MaybeStageTyped> = Extract<PlayTransformStage<T>, Y> & Whennable;
//export type PlayTransformUserParts<T> = PlayTransformUserStage<T[]> & { when?: WhenConditionsConfig };
//export type PlayTransformMetaParts<T = ExternalMetadataTerm> = PlayTransformMetadataStage<T> & { when?: WhenConditionsConfig };
export type PlayTransformPartsArray<T, Y = MaybeStageTyped> = PlayTransformParts<T, Y>[];

/** Represents the weakly-defined user config. May be an array of parts or one parts object */
export type PlayTransformPartsConfig<T, Y = MaybeStageTyped> = PlayTransformPartsArray<T, Y> | PlayTransformParts<T, Y>;

export interface PlayTransformPartsAtomic<T> {
    title?: T
    artists?: T
    albumArtists?: T
    album?: T
    duration?: T
    meta?: T
}

export type StageTypeMetadata = 'spotify' | 'musicbrainz' | 'native';
export type StageTypeUser = 'user';
export type StageType = StageTypeMetadata | StageTypeUser | string;
export const STAGE_TYPES_USER: StageTypeUser[] = ['user'];
export const STAGE_TYPES_METADATA: StageTypeMetadata[] = ['spotify','musicbrainz','native'];
export const STAGE_TYPES: StageType[] = [...STAGE_TYPES_METADATA, ...STAGE_TYPES_USER];

export interface StageTyped {
    type: StageType
}

export interface NotStageTyped {
    type?: never
}

export type MaybeStageTyped = StageTyped | NotStageTyped;

export interface StageTypedConfig {
    type: StageType
}

export interface Whennable {
    when?: WhenConditionsConfig
}

export type FlowControlTerm = 'continue' | 'stop'

export interface FlowControl {
    onSuccess: FlowControlTerm
    onFailure: FlowControlTerm
    onSkip: FlowControlTerm
    failureReturnPartial: boolean
}

export interface StageConfig extends StageTypedConfig, Whennable, Partial<FlowControl> {
    name?: string
}

export interface AtomicStageConfig<T> extends StageConfig, PlayTransformPartsAtomic<T> {}

export interface PlayTransformStageTyped<T> extends PlayTransformPartsAtomic<T> {
    type: StageType
}

export interface PlayTransformMetadataStage extends StageConfig, PlayTransformPartsAtomic<ExternalMetadataTerm> {
    score?: number
//    all?: ExternalMetadataTerm
    type: StageTypeMetadata
}

export interface PlayTransformUserStage<T> extends StageConfig, PlayTransformPartsAtomic<T> {
    type: StageTypeUser
}

export interface PlayTransformNativeStage extends StageConfig, PlayTransformPartsAtomic<ExternalMetadataTerm> {
    type: 'native'
}

export interface PlayTransformGenericStage<T> extends StageConfig, PlayTransformPartsAtomic<T> {
    type: string
}

export type UntypedPlayTransformUserStage<T> = Omit<PlayTransformUserStage<T>, 'type'> & {type?: never};

export type PlayTransformStage<T> = PlayTransformMetadataStage | PlayTransformUserStage<T> | PlayTransformNativeStage | UntypedPlayTransformUserStage<T> | PlayTransformGenericStage<any>;

/** Represents the plain json user-configured structure (input) */
export interface PlayTransformHooksConfig<T> {
    preCompare?: PlayTransformPartsConfig<T>
    compare?: {
        candidate?: PlayTransformPartsConfig<T>
        existing?: PlayTransformPartsConfig<T>
    }
    postCompare?: PlayTransformPartsConfig<T>
}

/** Represents the final, strongly-typed transform configuration used during runtime */
export interface PlayTransformHooks<T> extends PlayTransformHooksConfig<T> {
    preCompare?: PlayTransformPartsArray<T, StageTyped>
    compare?: {
        candidate?: PlayTransformPartsArray<T, StageTyped>
        existing?: PlayTransformPartsArray<T, StageTyped>
    }
    postCompare?: PlayTransformPartsArray<T, StageTyped>
}

export type PlayTransformRules = PlayTransformHooks<ConditionalSearchAndReplaceRegExp[] | ExternalMetadataTerm>
export type TransformHook = 'preCompare' | 'compare' | 'candidate' | 'existing' | 'postCompare';
export const TRANSFORM_HOOK = {
    preCompare: 'preCompare' as TransformHook,
    candidate: 'candidate' as TransformHook,
    existing: 'existing' as TransformHook,
    postCompare: 'postCompare' as TransformHook,
}
export type PlayTransformConfig = PlayTransformHooksConfig<SearchAndReplaceTerm[] | ExternalMetadataTerm>;
export type PlayTransformOptions = PlayTransformConfig & { log?: boolean | 'all' }
export type WhenParts<T> = PlayTransformPartsAtomic<T>;
export type WhenConditions<T> = WhenParts<T>[];
export type WhenConditionsConfig = WhenConditions<string>;