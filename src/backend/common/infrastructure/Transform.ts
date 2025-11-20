import { SearchAndReplaceRegExp } from "@foxxmd/regex-buddy-core";

export interface ConditionalSearchAndReplaceRegExp extends SearchAndReplaceRegExp {
    when?: WhenConditionsConfig
}

export type ConditionalSearchAndReplaceTerm = Omit<ConditionalSearchAndReplaceRegExp, 'test'>
export type SearchAndReplaceTerm = string | ConditionalSearchAndReplaceTerm;
export type ExternalMetadataTerm = true | undefined | { when: WhenConditionsConfig };

export type PlayTransformParts<T, Y = MaybeStageTyped> = Extract<PlayTransformStage<T[]>, Y> & { when?: WhenConditionsConfig };
export type PlayTransformUserParts<T> = PlayTransformUserStage<T[]> & { when?: WhenConditionsConfig };
export type PlayTransformPartsArray<T, Y = MaybeStageTyped> = PlayTransformParts<T, Y>[];

/** Represents the weakly-defined user config. May be an array of parts or one parts object */
export type PlayTransformPartsConfig<T, Y = MaybeStageTyped> = PlayTransformPartsArray<T, Y> | PlayTransformParts<T, Y>;

export interface PlayTransformPartsAtomic<T> {
    title?: T
    artists?: T
    album?: T
}

export type StageType = 'spotify' | 'listenbrainz' | 'native' | 'user';
export const STAGE_TYPES: StageType[] = ['spotify','listenbrainz','native','user']

export interface StageTyped {
    type: StageType
}

export interface NotStageTyped {
    type?: never
}

export type MaybeStageTyped = StageTyped | NotStageTyped;

export interface PlayTransformStageTyped<T> extends PlayTransformPartsAtomic<T> {
    type: StageType
}

export interface PlayTransformMetadataStage extends PlayTransformStageTyped<ExternalMetadataTerm[]> {
    score?: number
    all?: ExternalMetadataTerm
    type: 'spotify' | 'listenbrainz' | 'native'
}

export interface PlayTransformUserStage<T> extends PlayTransformStageTyped<T> {
    type: 'user'
}
export type UntypedPlayTransformUserStage<T> = Omit<PlayTransformUserStage<T>, 'type'> & {type?: never};

export type PlayTransformStage<T> = PlayTransformMetadataStage | PlayTransformUserStage<T> | UntypedPlayTransformUserStage<T>;

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

export type PlayTransformRules = PlayTransformHooks<ConditionalSearchAndReplaceRegExp>
export type TransformHook = 'preCompare' | 'compare' | 'candidate' | 'existing' | 'postCompare';
export const TRANSFORM_HOOK = {
    preCompare: 'preCompare' as TransformHook,
    candidate: 'candidate' as TransformHook,
    existing: 'existing' as TransformHook,
    postCompare: 'postCompare' as TransformHook,
}
export type PlayTransformConfig = PlayTransformHooksConfig<SearchAndReplaceTerm>;
export type PlayTransformOptions = PlayTransformConfig & { log?: boolean | 'all' }
export type WhenParts<T> = PlayTransformPartsAtomic<T>;
export type WhenConditions<T> = WhenParts<T>[];
export type WhenConditionsConfig = WhenConditions<string>;