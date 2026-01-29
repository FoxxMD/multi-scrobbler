import { Logger, loggerTest } from "@foxxmd/logging";
import { searchAndReplace as searchAndReplaceFunc, testMaybeRegex as testMaybeRegexFunc } from "@foxxmd/regex-buddy-core";
import { ObjectPlayData, PlayLifecycle, PlayObject, PlayObjectLifecycleless } from "../../core/Atomic.js";
import { buildTrackString } from "../../core/StringUtils.js";

import {
    ConditionalSearchAndReplaceRegExp,
    ConditionalSearchAndReplaceTerm,
    ExternalMetadataTerm,
    PlayTransformParts,
    PlayTransformStage,
    SearchAndReplaceTerm,
    STAGE_TYPES,
    StageType,
    StageTypedConfig,
    WhenConditionsConfig,
    WhenParts
} from "../common/infrastructure/Transform.js";

export const isWhenCondition = (val: unknown): val is WhenParts<string> => {
    if (val !== null && typeof val === 'object') {
        if ('artists' in val && typeof val.artists !== 'string') {
            return false;
        }
        if ('title' in val && typeof val.title !== 'string') {
            return false;
        }
        if ('album' in val && typeof val.album !== 'string') {
            return false;
        }
        return true;
    }
    return false;
}
export const isWhenConditionConfig = (val: unknown): val is WhenConditionsConfig => {
    return Array.isArray(val) && val.every(isWhenCondition);
}
export const configValToSearchReplace = (val: string | undefined | object): ConditionalSearchAndReplaceRegExp | undefined => {
    if (val === undefined || val === null) {
        return undefined;
    }
    if (typeof val === 'string') {
        return {
            search: val,
            replace: ''
        }
    }
    if (isConditionalSearchAndReplace(val)) {
        return val as ConditionalSearchAndReplaceRegExp;
    }
    throw new Error(`Value must be a string or an object containing 'search: string' and 'replace: 'string'. Given: ${val}`);
}
export const isConditionalSearchAndReplace = (val: unknown): val is ConditionalSearchAndReplaceRegExp => {
    return typeof val === 'object'
        && ('search' in val && typeof val.search === 'string')
        && ('replace' in val && typeof val.replace === 'string')
        && (!('when' in val) || isWhenConditionConfig(val.when));
}

export const isSearchAndReplaceTerm = (val: unknown | string | ConditionalSearchAndReplaceTerm): val is SearchAndReplaceTerm => {
    const tf = typeof val;
    if(tf === 'string') {
        return true;
    }
    if(!(tf == 'object')) {
        throw new Error(`Must be a string or an object, but found ${tf}`);
    }
    if(tf === null) {
        throw new Error('Cannot be null');
    }
    return isConditionalSearchAndReplace(val);
}

export const isExternalMetadataTerm = (val: unknown): val is ExternalMetadataTerm => {
    if(val === undefined) {
        return true;
    }
    const tf = typeof val;
    if(tf === 'boolean') {
        return true;
    }
    if(tf === null) {
        throw new Error(`Value is null but must be one of: true, undefined, or object with 'when'`);
    }
    if(tf === 'object') {
        if(isWhenConditionConfig(val)) {
            return true;
        }
        throw new Error(`Value is not a proper 'when' object`);
    }
    throw new Error(`Value is type of ${tf} but must be one of: boolean, undefined, or object with 'when'`);
}

export const isStageTyped = (val: unknown): val is StageTypedConfig => {
    if(typeof val !== 'object' || val === null) {
        return false;
    }
    return 'type' in val;
}

export const isPlayTransformStage = (val: object | Partial<PlayTransformStage<SearchAndReplaceTerm[]>>): val is PlayTransformStage<SearchAndReplaceTerm[]> => {
    if (!('type' in val)) {
        throw new Error(`Stage is missing 'type'. Must be one of: ${STAGE_TYPES.join(', ')}`);
    }
    if (!STAGE_TYPES.includes(val.type)) {
        throw new Error(`Stage has invalid 'type'. Must be one of: ${STAGE_TYPES.join(', ')}`);
    }

    for (const k of ['artist', 'title', 'album']) {
        if (!(k in val)) {
            continue;
        }
        if (val.type === 'user') {
            if (!Array.isArray(val[k])) {
                throw new Error(`${k} must be an array`);
            }
            try {
                isSearchAndReplaceTerm(val[k]);
            } catch (e) {
                throw new Error(`Property '${k}' was not a valid type`, { cause: e });
            }
        } else {
            try {
                isExternalMetadataTerm(val[k]);

            } catch (e) {
                throw new Error(`Property '${k}' was not a valid type`, { cause: e });
            }
        }
    }

    return true;
}

export const isUserStage = <T>(val: StageTypedConfig): val is StageTypedConfig => {
    return val.type === 'user';
}

export const testWhen = (parts: WhenParts<string>, play: PlayObject, options?: SuppliedRegex): boolean => {
    const {
        testMaybeRegex = testMaybeRegexFunc,
    } = options || {}

    if(parts.title !== undefined) {
        if(!testMaybeRegex(parts.title, play.data.track ?? '')[0]) {
            return false;
        }
    }
    if(parts.artists !== undefined) {
        // allows user to test if artists are empty
        const artists = parts.artists.length === 0 ? [''] : play.data.artists;
        if(artists.every(x => !testMaybeRegex(parts.artists, x)[0])) {
            return false;
        }
    }
    if(parts.album !== undefined) {
        if(!testMaybeRegex(parts.album, play.data.album ?? '')[0]) {
            return false;
        }
    }
    return true;
}

export const testWhenConditions = (when: WhenConditionsConfig, play: PlayObject, options?: SuppliedRegex) => when.some(x => testWhen(x, play, options));

export interface SuppliedRegex {
    searchAndReplace?: typeof searchAndReplaceFunc,
    testMaybeRegex?: typeof testMaybeRegexFunc,
}

export interface TransformPlayPartsOptions {
    logger?: () => Logger,
    regex?: SuppliedRegex
}

export const baseFormatPlayObj = (data: any, play: PlayObjectLifecycleless): PlayObject => {
    return {
        data: {
            ...play.data
        },
        meta: {
            ...play.meta,
            lifecycle: {
                input: data,
                original: play,
                steps: []
            }
        }
    }
}

export const defaultLifecycle = (extra?: PlayLifecycle): PlayLifecycle => {
    const {
        original = {data: {}, meta: {}},
        steps = [],
        ...rest
    } = extra ?? {};
    return {
        original,
        steps,
        ...rest,
    }
}