import { Logger, loggerTest } from "@foxxmd/logging";
import { searchAndReplace as searchAndReplaceFunc, testMaybeRegex as testMaybeRegexFunc } from "@foxxmd/regex-buddy-core";
import { ObjectPlayData, PlayObject } from "../../core/Atomic.js";
import { buildTrackString } from "../../core/StringUtils.js";

import {
    ConditionalSearchAndReplaceRegExp,
    ConditionalSearchAndReplaceTerm,
    ExternalMetadataTerm,
    PlayTransformParts,
    PlayTransformPartsArray,
    PlayTransformPartsConfig,
    PlayTransformRules, PlayTransformStage, PlayTransformUserParts, PlayTransformUserStage, SearchAndReplaceTerm,
    STAGE_TYPES,
    StageType,
    WhenConditionsConfig,
    WhenParts
} from "../common/infrastructure/Transform.js";
import e from "express";

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
        if(val === true) {
            return true;
        }
        throw new Error(`Value must be one of: true, undefined, or object with 'when'`);
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
    throw new Error(`Value is type of ${tf} but must be one of:  true, undefined, or object with 'when'`);
}

export const isPlayTransformStage = (val: object | Partial<PlayTransformStage<SearchAndReplaceTerm[]>>): val is PlayTransformStage<SearchAndReplaceTerm[]> => {
    if(!('type' in val)) {
        throw new Error(`Stage is missing 'type'. Must be one of: ${STAGE_TYPES.join(', ')}`);
    }
    if(!STAGE_TYPES.includes(val.type)) {
        throw new Error(`Stage has invalid 'type'. Must be one of: ${STAGE_TYPES.join(', ')}`);
    }

    for(const k of ['artist', 'title', 'album']) {
        if(!(k in val)) {
            continue;
        }
        if(!Array.isArray[val[k]]) {
            throw new Error(`${k} must be an array`);
        }
        for(const term of val[k]) {
            try {
                if(val.type === 'user') {
                    isSearchAndReplaceTerm(val[k]);
                } else {
                    isExternalMetadataTerm(val[k]);
                }
                
            } catch (e) {
                throw new Error(`Property '${k}' was not a valid type`, {cause: e});
            }
        }
    }

    return true;
}

export const isUserStage = <T>(val: PlayTransformStage<T>): val is PlayTransformUserStage<T> => {
    return val.type === 'user';
}

export const configPartsToStrongParts = (val: PlayTransformPartsConfig<SearchAndReplaceTerm> | undefined): PlayTransformPartsArray<ConditionalSearchAndReplaceRegExp> => {
    if (val === undefined) {
        return []
    }
    const arr = Array.isArray(val) ? val : [val];

    return arr.map((x) => {
        const {
            title: titleConfig,
            artists: artistConfig,
            album: albumConfig,
            when: whenConfig,
            type = 'user',
            ...rest
        } = x;

        let stage: PlayTransformStage<SearchAndReplaceTerm[]>;
        try {
            const candidateStage = {...x, type};
            if(isPlayTransformStage(candidateStage)) {
                stage = candidateStage;
            }
        } catch (e) {
            throw new Error('')
        }

        if (whenConfig !== undefined) {
            if (!isWhenConditionConfig(whenConfig)) {
                throw new Error(`'when' must be an array of artist/title/album objects and each object's property must be a string`);
            }
        }

        let title,
            artists,
            album,
            when;

        if(isUserStage(stage)) {
            title = stage.title?.map(configValToSearchReplace);
            artists = stage.artists?.map(configValToSearchReplace);
            album = stage.album?.map(configValToSearchReplace);
        } else {
            title = stage.title;
            artists = stage.artists;
            album = stage.album;
        }

        when = whenConfig;

        return {
            title,
            artists,
            album,
            when,
            type,
            ...rest
        }
    });

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

export const transformPlayUsingParts = (play: PlayObject, parts: PlayTransformUserParts<ConditionalSearchAndReplaceRegExp>, options?: TransformPlayPartsOptions): PlayObject => {
    const {
        data: {
            track,
            artists,
            albumArtists,
            album
        } = {}
    } = play;

    const {
        logger = () => loggerTest,
        regex: {
            searchAndReplace = searchAndReplaceFunc,
            testMaybeRegex = testMaybeRegexFunc,
        } = {},
    } = options || {};

    const transformedPlayData: Partial<ObjectPlayData> = {};

    let isTransformed = false;

    if(parts.when !== undefined) {
        if(!testWhenConditions(parts.when, play, {testMaybeRegex})) {
            return play;
        }
    }

    const searchAndReplaceMapper = (x: ConditionalSearchAndReplaceRegExp): ConditionalSearchAndReplaceRegExp  => ({...x, test: (x.when !== undefined ? () => testWhenConditions(x.when, play, {testMaybeRegex}) : undefined)})

    if (parts.title !== undefined && track !== undefined) {
        try {
            const t = searchAndReplace(track, parts.title.map(x => ({...x, test: (x.when !== undefined ? () => testWhenConditions(x.when, play, {testMaybeRegex}) : undefined)})));
            if (t !== track) {
                transformedPlayData.track = t.trim() === '' ? undefined : t;
                isTransformed = true;
            }
        } catch (e) {
            logger().warn(new Error(`Failed to transform title: ${track}`, {cause: e}));
        }
    }

    if (parts.artists !== undefined && artists !== undefined && artists.length > 0) {
        const transformedArtists: string[] = [];
        let anyArtistTransformed = false;
        for (const artist of artists) {
            try {
                const t = searchAndReplace(artist, parts.artists.map(searchAndReplaceMapper));
                if (t !== artist) {
                    anyArtistTransformed = true;
                    isTransformed = true;
                }
                if (t.trim() !== '') {
                    transformedArtists.push(t);
                }
            } catch (e) {
                logger().warn(new Error(`Failed to transform artist: ${artist}`, {cause: e}));
                transformedArtists.push(artist);
            }
        }
        if (anyArtistTransformed) {
            transformedPlayData.artists = transformedArtists;
        }
    }

    if (parts.artists !== undefined && albumArtists !== undefined && albumArtists.length > 0) {
        const transformedArtists: string[] = [];
        let anyArtistTransformed = false;
        for (const artist of albumArtists) {
            try {
                const t = searchAndReplace(artist, parts.artists.map(searchAndReplaceMapper));
                if (t !== artist) {
                    anyArtistTransformed = true;
                    isTransformed = true;
                }
                if (t.trim() !== '') {
                    transformedArtists.push(t);
                }
            } catch (e) {
                logger().warn(new Error(`Failed to transform albumArtist: ${artist}`, {cause: e}));
                transformedArtists.push(artist);
            }
        }
        if (anyArtistTransformed) {
            transformedPlayData.albumArtists = transformedArtists;
        }
    }

    if (parts.album !== undefined && album !== undefined) {
        try {
            const t = searchAndReplace(album, parts.album.map(searchAndReplaceMapper));
            if (t !== album) {
                isTransformed = true;
                transformedPlayData.album = t.trim() === '' ? undefined : t;
            }
        } catch (e) {
            logger().warn(new Error(`Failed to transform album: ${album}`, {cause: e}));
        }
    }

    if (isTransformed) {

        const transformedPlay = {
            ...play,
            data: {
                ...play.data,
                ...transformedPlayData
            }
        }

        return transformedPlay;
    }

    return play;
}

export const countRegexes = (rules: PlayTransformRules): number => {
    let rulesCount = 0;
    if(rules.preCompare !== undefined) {
        for(const hookItem of rules.preCompare) {
            rulesCount = countRulesInParts(hookItem) + countWhens(hookItem.when);
        }

    }
    if(rules.postCompare !== undefined) {
        for(const hookItem of rules.postCompare) {
            rulesCount = countRulesInParts(hookItem) + countWhens(hookItem.when);
        }
    }
    if(rules.compare !== undefined) {
        if(rules.compare.existing !== undefined) {
            for(const hookItem of rules.compare.existing) {
                rulesCount = countRulesInParts(hookItem) + countWhens(hookItem.when);
            }
        }
        if(rules.compare.candidate !== undefined) {
            for(const hookItem of rules.compare.candidate) {
                rulesCount = countRulesInParts(hookItem) + countWhens(hookItem.when);
            }
        }
    }
    return rulesCount;
}

const countWhens = (when: WhenConditionsConfig | undefined): number => {
    if(when === undefined) {
        return 0;
    }
    return when.reduce((acc, curr) => {
        return acc + Object.keys(curr).length;
    },0)
}

/**
 * Counts all rules within title/artist/album + whens WITHIN those rules
 * */
const countRulesInParts = (parts: PlayTransformParts<ConditionalSearchAndReplaceRegExp>): number => {
    return Object.entries(parts).reduce((acc: number, entries: [string, ConditionalSearchAndReplaceRegExp[]]) => {
        let curr = acc;
        for(const rule of (entries[1] ?? [])) {
            curr++;
            if(typeof rule !== 'string' && rule.when !== undefined) {
                curr += countWhens(rule.when);
            }
        }
        return curr;
    }, 0)
}
