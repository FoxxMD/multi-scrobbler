import { SearchAndReplaceRegExp } from "@foxxmd/regex-buddy-core";

export interface ConditionalSearchAndReplaceRegExp extends SearchAndReplaceRegExp {
    when?: WhenConditionsConfig
}

export type ConditionalSearchAndReplaceTerm = Omit<ConditionalSearchAndReplaceRegExp, 'test'>
export type SearchAndReplaceTerm = string | ConditionalSearchAndReplaceTerm;
export type ExternalMetadataTerm = true | undefined | { when: WhenConditionsConfig };

export type PlayTransformParts<T> = PlayTransformStage<T[]> & { when?: WhenConditionsConfig };
export type PlayTransformUserParts<T> = PlayTransformUserStage<T[]> & { when?: WhenConditionsConfig };
export type PlayTransformPartsArray<T> = PlayTransformParts<T>[];
export type PlayTransformPartsConfig<T> = PlayTransformPartsArray<T> | PlayTransformParts<T>;

export interface PlayTransformPartsAtomic<T> {
    title?: T
    artists?: T
    album?: T
}

export type StageType = 'spotify' | 'listenbrainz' | 'native' | 'user';
export const STAGE_TYPES: StageType[] = ['spotify','listenbrainz','native','user']

export interface PlayTransformStageTyped<T> extends PlayTransformPartsAtomic<T> {
    type: 'spotify' | 'listenbrainz' | 'native' | 'user'
}

export interface PlayTransformMetadataStage extends PlayTransformStageTyped<ExternalMetadataTerm[]> {
    score?: number
    all?: ExternalMetadataTerm
    type: 'spotify' | 'listenbrainz' | 'native'
}

export interface PlayTransformUserStage<T> extends PlayTransformStageTyped<T> {
    type: 'user'
}

export type PlayTransformStage<T> = PlayTransformMetadataStage | PlayTransformUserStage<T>

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
    preCompare?: PlayTransformPartsArray<T>
    compare?: {
        candidate?: PlayTransformPartsArray<T>
        existing?: PlayTransformPartsArray<T>
    }
    postCompare?: PlayTransformPartsArray<T>
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


//export type PlayTransform