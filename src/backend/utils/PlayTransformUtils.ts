import type {Logger} from "@foxxmd/logging";
import type { searchAndReplace as searchAndReplaceFunc} from "@foxxmd/regex-buddy-core";
import { testMaybeRegex as testMaybeRegexFunc } from "@foxxmd/regex-buddy-core";
import type {PlayObject, PlayObjectMinimal} from "../../core/Atomic.ts";

import {
    type ConditionalSearchAndReplaceRegExp,
    type ConditionalSearchAndReplaceTerm,
    type ExternalMetadataTerm,
    type PlayTransformStage,
    type SearchAndReplaceTerm,
    STAGE_TYPES,
    type StageTypedConfig,
    type WhenConditionsConfig,
    type WhenParts, type PlayTransformHooks } from "../../core/Transform.ts";
import dayjs from "dayjs";
import { playImages } from "../../core/MusicMetadata.ts";
import type { CommonClientOptions } from "../common/infrastructure/config/client/index.ts";
import type { CommonSourceOptions } from "../common/infrastructure/config/source/index.ts";
import { loggerNoop } from "../common/MaybeLogger.ts";

export const transformPresetEnv = <T extends CommonClientOptions | CommonSourceOptions>(prefix: string, existing: T | undefined = undefined, logger: Logger = loggerNoop): undefined | T => {

    const env = process.env[`${prefix}_TRANSFORMS`];
    if (env === undefined || env.trim() === '') {
        return existing;
    }

    const preCompare: NonNullable<PlayTransformHooks<ExternalMetadataTerm>['preCompare']> = [];
    const popts: PlayTransformHooks<ExternalMetadataTerm> = {
        preCompare
    };
    const transformTypes = env.split(',').map(x => x.trim().toLocaleLowerCase());
    for (const p of transformTypes) {
        switch (p) {
            case 'native':
                preCompare.push({ type: 'native'});
                break;
            case 'musicbrainz':
                preCompare.push({ type: 'musicbrainz' });
                break;
            case 'rocksky':
                preCompare.push({ type: 'rocksky' });
                break;
            case 'spotify':
                preCompare.push({ type: 'spotify'});
                break;
            case 'coverartarchive':
                preCompare.push({type: 'coverartarchive'});
                break;
            default:
                logger.warn(`Unrecognized transformer type '${p} in env ${env}'`);
                break;
        }
    }

    // @ts-expect-error T is fine
    return {
        ...(existing || {}),
        playTransform: popts
    };
};



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
    return typeof val === 'object' && val !== null
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
    if (typeof val.type !== 'string' || !STAGE_TYPES.includes(val.type)) {
        throw new Error(`Stage has invalid 'type'. Must be one of: ${STAGE_TYPES.join(', ')}`);
    }

    for (const k of ['artists', 'title', 'album']) {
        if (!(k in val)) {
            continue;
        }
        if (val.type === 'user') {
            if (!Array.isArray((val as any)[k])) {
                throw new Error(`${k} must be an array`);
            }
            try {
                isSearchAndReplaceTerm((val as any)[k]);
            } catch (e) {
                throw new Error(`Property '${k}' was not a valid type`, { cause: e });
            }
        } else {
            try {
                isExternalMetadataTerm((val as any)[k]);

            } catch (e) {
                throw new Error(`Property '${k}' was not a valid type`, { cause: e });
            }
        }
    }

    return true;
}

export const isUserStage = <T>(val: StageTypedConfig): val is StageTypedConfig => {
    return val.type.toLocaleLowerCase().trim() === 'user';
}

export const testWhen = (parts: WhenParts<string>, play: PlayObject, options?: SuppliedRegex): boolean => {
    const {
        testMaybeRegex = testMaybeRegexFunc,
    } = options || {}

    if(parts.title !== undefined) {
        if(!testMaybeRegex(parts.title, play.data.track?.name ?? '')[0]) {
            return false;
        }
    }
    const artistsTest = parts.artists;
    if(artistsTest !== undefined) {
        // allows user to test if artists are empty
        const artists = artistsTest.length === 0 ? [{name: ''}] : (play.data.artists ?? []);
        if(artists.every(x => !testMaybeRegex(artistsTest, x.name)[0])) {
            return false;
        }
    }
    if(parts.album !== undefined) {
        if(!testMaybeRegex(parts.album, play.data.album?.name ?? '')[0]) {
            return false;
        }
    }
    if(parts.art !== undefined) {
        const images = playImages(play.data);
        if(parts.art.trim() === '') {
            // user is testing to see if there is no art
            // if test is empty string and there is no art then it passes
            return images.length === 0;
        }
        // passes if any art url matches the search
        return images.some(x => testMaybeRegex(parts.art!, x)[0]);
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

export const baseFormatPlayObj = (data: any, play: PlayObjectMinimal): PlayObject => {
    const original = {
        data,
        play,
    };
    const basePlay: PlayObject =  {
        data: {
            ...play.data
        },
        meta: {
            seenAt: dayjs(),
            ...play.meta,
        },
        original
    }
    original.play.meta.seenAt = basePlay.meta.seenAt;
    return basePlay;
}