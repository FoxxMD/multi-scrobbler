import { strategies, stringSameness, type StringSamenessResult } from "@foxxmd/string-sameness";
import dayjs, { type Dayjs } from "dayjs";
import duration from "dayjs/plugin/duration.js";
import isBetween from "dayjs/plugin/isBetween.js";
import relativeTime from "dayjs/plugin/relativeTime.js";
import timezone from "dayjs/plugin/timezone.js";
import utc from "dayjs/plugin/utc.js";
import {
    type AmbPlayObject,
    type Credit,
    SCROBBLE_TS_SOC_END,
    SCROBBLE_TS_SOC_START,
    type ScrobbleTsSOC,
    type TrackStringOptions
} from "./Atomic.ts";
import { DELIMETERS_REGEX, DELIMITERS } from './Atomic.ts';
import { parseRegexSingle } from "@foxxmd/regex-buddy-core";
import { removeUndefinedKeys } from './DataUtils.ts';
import { type MusicServices, withMetadata } from './MusicMetadata.ts';
import { nanoid } from "nanoid";

const {levenStrategy, diceStrategy} = strategies;

dayjs.extend(utc)
dayjs.extend(isBetween);
dayjs.extend(relativeTime);
dayjs.extend(duration);
dayjs.extend(timezone);

export const longestString = (strings: any) => strings.reduce((acc: any, curr: any) => curr.length > acc ? curr.length : acc, 0);
export const truncateStringArrToLength = (length: any, truncStr = '...') => {
    const truncater = truncateStringToLength(length, truncStr);
    return (strings: any) => strings.map(truncater);
}
export const truncateStringToLength = (length: any, truncStr = '...') => (val: any = '') => {
    if (val === null) {
        return '';
    }
    const str = typeof val !== 'string' ? val.toString() : val;
    return str.length > length ? `${str.slice(0, length)}${truncStr}` : str;
}
export const defaultTrackTransformer = (input: any, data: AmbPlayObject, hasExistingParts: boolean = false) => hasExistingParts ? `- ${input}` : input;
export const defaultReducer = (acc: any, curr: any) => `${acc} ${curr}`;
export const defaultArtistFunc = (a: string[]) => a === undefined ? '' : a.join(' / ');
export const defaultAlbumFunc = (input: any, data: AmbPlayObject, hasExistingParts: boolean = false) => {
    if(input === undefined) {
        return undefined;
    }
    return hasExistingParts ? `--- ${input}` : input
};
export const defaultTimeFunc = (t: Dayjs | undefined, i?: ScrobbleTsSOC) => t === undefined ? '@ N/A' : `@ ${t.local().format()} ${i === undefined ? '' : (i === SCROBBLE_TS_SOC_START ? '(S)' : '(C)')}`;
export const defaultTimeFromNowFunc = (t: Dayjs | undefined) => t === undefined ? undefined : `(${t.local().fromNow()})`;
export const defaultCommentFunc = (c: string | undefined) => c === undefined ? undefined : `(${c})`;
// TODO replace with genGroupIdStr and refactor Platform types/etc. into core Atomic
export const defaultPlatformFunc = (d: string | undefined, u: string | undefined, s: string | undefined) => combinePartsToString([d ?? 'NoDevice', u ?? 'SingleUser',s !== undefined ? `Session${s}` : undefined]);
export const defaultBuildTrackStringTransformers = {
    artists: defaultArtistFunc,
    track: defaultTrackTransformer,
    album: defaultAlbumFunc,
    time: defaultTimeFunc,
    timeFromNow: defaultTimeFromNowFunc,
    comment: defaultCommentFunc,
    platform: defaultPlatformFunc
}
export const buildTrackString = <T = string>(playObj: AmbPlayObject, options: TrackStringOptions<T> = {}): T => {
    const {
        include = ['time', 'artist', 'track'],
        transformers: {
            artists: artistsFunc = defaultBuildTrackStringTransformers.artists,
            album: albumFunc = defaultBuildTrackStringTransformers.album,
            track: trackFunc = defaultBuildTrackStringTransformers.track,
            time: timeFunc = defaultBuildTrackStringTransformers.time,
            timeFromNow = defaultBuildTrackStringTransformers.timeFromNow,
            comment: commentFunc = defaultBuildTrackStringTransformers.comment,
            platform: platformFunc = defaultBuildTrackStringTransformers.platform,
            reducer = (arr: any[]) => arr.join(' ') // (acc, curr) => `${acc} ${curr}`
        } = {},
    } = options;
    const {
        data: {
            artists,
            album,
            track,
            playDate,
            playDateCompleted
        } = {},
        meta: {
            trackId,
            scrobbleTsSOC = SCROBBLE_TS_SOC_START,
            comment,
            deviceId,
            user,
            sessionId
        } = {},
    } = playObj;

    let pd: Dayjs | undefined;
    let usedTsSOC: ScrobbleTsSOC = scrobbleTsSOC;
    if(scrobbleTsSOC === SCROBBLE_TS_SOC_END && playDateCompleted !== undefined) {
        pd = typeof playDateCompleted === 'string' ? dayjs(playDateCompleted) : playDateCompleted;
    } else {
        usedTsSOC = SCROBBLE_TS_SOC_START;
        pd = typeof playDate === 'string' ? dayjs(playDate) : playDate;
    }

    const strParts: (T | string | undefined)[] = [];
    if(include.includes('platform')) {
        strParts.push(platformFunc(deviceId, user, include.includes('session') ? sessionId : undefined))
    } else if(include.includes('session') && sessionId !== undefined) {
        strParts.push(`(Session ${sessionId})`);
    }
    if (include.includes('trackId') && trackId !== undefined) {
        strParts.push(`(${trackId})`);
    }
    if (include.includes('artist')) {
        strParts.push(artistsFunc(creditsToNames(artists)))
    }
    if (include.includes('track')) {
        strParts.push(trackFunc(creditToName(track), playObj, strParts.length > 0));
    }
    if (include.includes('album')) {
        strParts.push(albumFunc(creditToName(album), playObj, strParts.length > 0));
    }
    if (include.includes('time')) {
        strParts.push(timeFunc(pd, usedTsSOC));
    }
    if (include.includes('timeFromNow')) {
        const tfn = timeFromNow(pd);
        if (tfn !== undefined) {
            strParts.push(tfn)
        }

    }
    if (include.includes('comment')) {
        const cfn = commentFunc(comment);
        if(cfn !== undefined) {
            strParts.push(cfn);
        }
    }
    // @ts-ignore
    return reducer(strParts); //strParts.join(' ');
}

export const slice = (str: string, index: number, count: number, add?: string): string => {
    // We cannot pass negative indexes directly to the 2nd slicing operation.
    if (index < 0) {
        index = str.length + index;
        if (index < 0) {
            index = 0;
        }
    }

    return str.slice(0, index) + (add || "") + str.slice(index + count);
}

export const capitalize = (str: string) => str.charAt(0).toUpperCase() + str.slice(1)

export const capitalizeWords = (str: string, delimiter = ' ') => str.split(delimiter).map(x => capitalize(x)).join(delimiter);

/**
 * Split a string-ish variable by a list of deliminators and return the first actually split array or default to returning the string as the first element.
 *
 * Returns empty array, or user defined value, if variable is undefined / null / not a string / or an empty string.
 * */
export const splitByFirstFound = <T>(str: any, delims = [','], onNotAStringVal: T): string[] | T => {
    if(str === undefined || str === null || typeof str !== 'string' || str.trim() === '') {
        return onNotAStringVal;
    }
    for(const d of delims) {
        const split = str.split(d);
        if(split.length > 1) {
            return split;
        }
    }
    return [str];
}

/**
 * Split a string-ish variable by a regex and return the first actually split array or default to returning the string as the first element.
 *
 * Returns empty array, or user defined value, if variable is undefined / null / not a string / or an empty string.
 * */
export const splitByFirstRegexFound = <T>(str: any, onNotAStringVal: T, delimsReg: RegExp = DELIMETERS_REGEX): string[] | T => {
    if (str === undefined || str === null || typeof str !== 'string' || str.trim() === '') {
        return onNotAStringVal;
    }
    const res = parseRegexSingle(delimsReg, str);
    if (res !== undefined) {
        return [str.slice(0, res.index - 1), str.slice(res.index + 1)];
    }
    return [str];
}

/**
 * Returns value if it is a non-empty string or returns default value
 * */
export const nonEmptyStringOrDefault = <T = undefined>(str: any, defaultVal: T = undefined as T): string | T => {
    if (str === undefined || str === null || typeof str !== 'string' || str.trim() === '') {
        return defaultVal;
    }
    return str;
}
export const combinePartsToString = (parts: any[], glue: string = '-'): string | undefined => {
    const cleanParts: string[] = [];
    for (const part of parts) {
        if (part === null || part === undefined) {
            continue;
        }
        if (Array.isArray(part)) {
            const nestedParts = combinePartsToString(part, glue);
            if (nestedParts !== undefined) {
                cleanParts.push(nestedParts);
            }
        } else if (typeof part === 'object') {
            // hope this works
            cleanParts.push(JSON.stringify(part));
        } else if (typeof part === 'string') {
            if (part.trim() !== '') {
                cleanParts.push(part);
            }
        } else {
            cleanParts.push(part.toString());
        }
    }
    if (cleanParts.length > 0) {
        return cleanParts.join(glue);
    }
    return undefined;
}

export const arrayListOxfordAnd = (list: string[], joiner: string, finalJoiner: string, spaced: boolean = true): string => {
    if(list.length === 1) {
        return list[0];
    }
    const start = list.slice(0, list.length - 1);
    const end = list.slice(list.length - 1);

    const joinerProper = joiner === ',' ? ', ' : (spaced ? ` ${joiner} ` : joiner);
    const finalProper = spaced ? ` ${finalJoiner} ` : finalJoiner;

    return [start.join(joinerProper), end].join(joiner === ',' && spaced ? `,${finalProper}` : finalProper);
}

export const arrayListAnd = (list: string[], joiner: string, finalJoiner: string, spaced: boolean = true): string => {
    if(list.length === 1) {
        return list[0];
    }
    const start = list.slice(0, list.length - 1);
    const end = list.slice(list.length - 1);

    const joinerProper = joiner === ',' ? ', ' : (spaced ? ` ${joiner} ` : joiner);
    const finalProper = spaced ? ` ${finalJoiner} ` : finalJoiner;

    return [start.join(joinerProper), end].join(finalProper);
}

export const safeStringify = (json: unknown) => JSON.stringify(json, null, 2);
export const findDelimiters = (str: string, delimiters = DELIMITERS) => {
    const found: string[] = [];
    for (const d of delimiters) {
        if (str.indexOf(d) !== -1) {
            found.push(d);
        }
    }
    if (found.length === 0) {
        return undefined;
    }
    return found;
};

export const containsDelimiters = (str: string) => null !== str.match(/[,&/\\]+/i);

const NUMBERS_REGEX = new RegExp(/^\s*\d+\s*$/);
export const stringIsOnlyNumbers = (str: string) => NUMBERS_REGEX.test(str);

export const namesToCredits = (names: (string | Partial<Credit>)[] | undefined): Credit[] => {
    if(names === undefined) {
        throw new Error('Must pass names');
    }
    return names.map(x => nameToCredit(x)!).filter(x => x !== undefined);
};
/** Build a Credit from a name, optionally with service metadata. Empty/undefined names return undefined. */
// typing overloading here is ok
export function nameToCredit(val: string, ...metadata: (MusicServices | undefined)[]): Credit;
// eslint-disable-next-line no-redeclare
export function nameToCredit(val: string | null | undefined | Partial<Credit>, ...metadata: (MusicServices | undefined)[]): Credit | undefined;
// eslint-disable-next-line no-redeclare
export function nameToCredit(val: string | null | undefined | Partial<Credit>, ...metadata: (MusicServices | undefined)[]): Credit | undefined {
    if(val === undefined || val === null) {
        return undefined;
    }
    if(typeof val === 'string') {
        return withMetadata({name: val}, ...metadata);
    }
    if(val.name === undefined || val.name === null) {
        return undefined;
    }
    return withMetadata(removeUndefinedKeys({...val}) as Credit, ...metadata);
}
export function creditToName(a: Credit): string;
// eslint-disable-next-line no-redeclare
export function creditToName(a: Credit | undefined): string | undefined;
// eslint-disable-next-line no-redeclare
export function creditToName(a: Credit | undefined): string | undefined {
    return a?.name;
}
export const creditsToNames = (a: Credit[] = []): string[] => a.map((x) => x.name);

export const generatePlayUid = () => nanoid(20);
export interface StringNormalizationOptions {
    keepSingleWhitespace?: boolean;
    removeWhitespace?: boolean;
    charCase?: 'lower' | 'upper' | false;
    removeSymbols?: boolean;
    normalizeUnicode?: boolean;
    removeDiacritics?: boolean;
}
export const normalizeStr = (str: string, options: StringNormalizationOptions = {}): string => {
    const {
        keepSingleWhitespace = false, removeWhitespace = true, charCase = 'lower', normalizeUnicode = true, removeSymbols = true, removeDiacritics = true
    } = options;
    let normal: string = str;

    // https://stackoverflow.com/a/37511463/1469797
    if (normalizeUnicode) {
        normal = normal.normalize('NFD');
    }
    // https://stackoverflow.com/a/37511463/1469797
    if (removeDiacritics) {
        normal = normal.replace(/[\u0300-\u036f]/g, "");
    }
    if (removeSymbols) {
        normal = normal.replace(SYMBOLS_REGEX, '');
    }
    if (removeWhitespace) {
        normal = keepSingleWhitespace ? normal.replace(MULTI_WHITESPACE_REGEX, ' ') : normal.replace(/\s/g, '');
    }
    if (charCase !== false) {
        normal = charCase === 'lower' ? normal.toLocaleLowerCase() : normal.toLocaleUpperCase();
    }

    return normal.trim();
};

export const SYMBOLS_REGEX = new RegExp(/[`=(){}<>;'’,.~!@#$%^&*_+|:"?\-\\[\]/]/g);export const MULTI_WHITESPACE_REGEX = new RegExp(/\s{2,}/g);
/**
 * Compare the sameness of two strings after making them token-order independent
 *
 * Transform two strings before comparing in order to have as little difference between them as possible:
 *
 * * First, normalize (lower case, remove extraneous whitespace, remove punctuation, make all characters standard ANSI) strings and split into tokens
 * * Second, reorder tokens in the shorter list so that they mirror order of tokens in longer list as closely as possible
 * * Finally, concat back to strings and compare with sameness strategies
 *
 * */

export const compareNormalizedStrings = (existing: string, candidate: string): StringSamenessResult => {
    // there may be scenarios where a track differs in *ordering* of ancillary information between sources
    // EX My Track (feat. Art1, Art2)  -- My Track (feat. Art2 Art1)

    // first remove lower case, extraneous whitespace, punctuation, and replace non-ansi with ansi characters
    const normalExisting = normalizeStr(existing, { keepSingleWhitespace: true });
    const normalCandidate = normalizeStr(candidate, { keepSingleWhitespace: true });

    // split by "token"
    const eTokens = normalExisting.split(' ');
    const cTokens = normalCandidate.split(' ');


    let longerTokens: string[], shorterTokens: string[];

    if (eTokens.length > cTokens.length) {
        longerTokens = eTokens;
        shorterTokens = cTokens;
    } else {
        longerTokens = cTokens;
        shorterTokens = eTokens;
    }

    // we will use longest string (token list) as the reducer and order the shorter list to match it
    // so we don't have to deal with undefined positions in the shorter list
    const orderedCandidateTokens = longerTokens.reduce((acc: { ordered: string[]; remaining: string[]; }, curr) => {
        // if we've run out of tokens in the shorter list just return
        if (acc.remaining.length === 0) {
            return acc;
        }

        // on each iteration of tokens in the long list
        // we iterate through remaining tokens from the shorter list and find the token with the most sameness
        let highScore = 0;
        let highIndex = 0;
        let index = 0;
        for (const token of acc.remaining) {
            const result = stringSameness(curr, token);
            if (result.highScoreWeighted > highScore) {
                highScore = result.highScoreWeighted;
                highIndex = index;
            }
            index++;
        }

        // then remove the most same token from the remaining short list tokens
        const splicedRemaining = [...acc.remaining];
        splicedRemaining.splice(highIndex, 1);

        return {
            // finally add the most same token to the ordered short list
            ordered: acc.ordered.concat(acc.remaining[highIndex]),
            // and return the remaining short list tokens
            remaining: splicedRemaining
        };
    }, {
        // "ordered" is the result of ordering tokens in the shorter list to match longer token order
        ordered: [],
        // remaining is the initial shorter list
        remaining: shorterTokens
    });

    // since we have already "matched" up tokens by order we don't want to use cosine strat
    // bc it only does comparisons between whole words in a sentence (instead of all letters in a string)
    // which makes it inaccurate for small-n sentences and typos
    return stringSameness(longerTokens.join(' '), orderedCandidateTokens.ordered.join(' '), {
        transforms: [],
        strategies: [levenStrategy, diceStrategy]
    });
};

