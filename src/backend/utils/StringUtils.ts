import { strategies, type StringSamenessResult } from "@foxxmd/string-sameness";
import { hasher } from 'node-object-hash';
import type {Credit, PlayObject} from "../../core/Atomic.ts";
import { asPlayerStateData, type PlayerStateDataMaybePlay } from "../common/infrastructure/Atomic.ts";
import { DELIMITERS_NO_AMP } from '../../core/Atomic.ts';
import { DELIMITERS } from '../../core/Atomic.ts';
import { getPlatformIdFromData, parseBoolStrict } from "../utils.ts";
import { genGroupIdStr } from '../../core/PlayUtils.ts';
import { buildTrackString, compareNormalizedStrings, normalizeStr } from "../../core/StringUtils.ts";
import { parseRegexSingle } from "@foxxmd/regex-buddy-core";

const {levenStrategy, diceStrategy} = strategies;

// cant use [^\w\s] because this also catches non-english characters
export const SYMBOLS_WHITESPACE_REGEX = new RegExp(/[`=(){}<>;'’,.~!@#$%^&*_+|:"?\-\\[\]/\s]/g);
export const uniqueNormalizedStrArr = (arr: string[]): string[] => arr.reduce((acc: string[], curr) => {
        const normalizedCurr = normalizeStr(curr)
        if (!acc.some(x => normalizeStr(x) === normalizedCurr)) {
            return acc.concat(curr);
        }
        return acc;
    }, [])
export interface PlayCredits {
    primary: string
    primaryComposite: string
    secondary?: string[]
    suffix?: string
}

/**
 * Matches if the secondary string is wrapped in parenthesis-like symbols. Returns joiner, credits, and
 * suffix = if anything appears after end of wrapped string
 *
 * EX (feat. Kaash Paige & Diamond Platnumz) - Remix
 *     !!!!  ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^  *******
 *
 *
 * */
export const SECONDARY_CAPTURED_REGEX = new RegExp(/[([]\s*(?<joiner>ft\.?\W|feat\.?\W|featuring|vs\.?\W)\s*(?<credits>.*)[)\]](?<creditsSuffix>.*)/i);


/**
 * Matches if the secondary string is NOT wrapped in parenthesis-like symbols. Returns joiner, credits, and
 * suffix = if anything appears wrapped or starting with " - " proceeding string appearing after joiner
 *
 * EX feat. Diag
 *    !!!!  ^^^^
 *
 *    Ft Akon, Paige & Djfredse (Remix Braquer vos têtes)
 *    !! ^^^^^^^^^^^^^^^^^^^^^^ *************************
 *
 *    feat. Kaash Paige & Diamond Platnumz - Remix
 *    !!!!  ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ *******
 *
 * */
export const SECONDARY_FREE_REGEX = new RegExp(/^\s*(?<joiner>ft\.?\W|feat\.?\W|featuring|vs\.?\W)\s*(?<credits>(?:.+?(?= - |\s*[([].+[)\]]$))|(?:.*))(?<creditsSuffix>.*)/i);

const SECONDARY_REGEX_STRATS: RegExp[] = [SECONDARY_CAPTURED_REGEX, SECONDARY_FREE_REGEX];

/**
 * Matches JUST primary and secondary sections separated by a REQUIRED joiner that can optionally be wrapped in parenthesis-like symbols
 *
 * EX
 *    Criminal mind Ft Akon (Remix Braquer vos têtes)
 *    ^^^^^^^^^^^^^**********************************
 *
 *    Wasted Energy (feat. Kaash Paige & Diamond Platnumz) - Remix
 *    ^^^^^^^^^^^^^^**********************************************
 *
 * */
export const PRIMARY_SECONDARY_SECTIONS_REGEX = new RegExp(/^(?<primary>.+?)(?<secondary>(?:[([]?(?:\Wft\.?|\Wfeat\.?|featuring|\Wvs\.?)).*)/i);

/**
 * For matching the most common track/artist pattern that has a joiner
 *
 * Primary ft. 2nd Artist, 3rd Artist
 * Primary (2nd Artist) - Suffix
 * Primary [featuring 2nd Artist]
 *
 * ____
 *
 *  => Primary may or may not exist
 *    => Primary must not have an opening character ( [
 * => Secondaries may or may not have an opening character ( [
 *   => MUST begin with joiner ft. feat. featuring with vs.
 *   => May have closing character ) ]
 * */
// export const SECONDARY_ARTISTS_REGEX = new RegExp(//ig);
export interface ParseCreditsOptions {
    /**
     * When secondary credits are NOT wrapped (SECONDARY_FREE_REGEX) a trailing parenthetical is normally treated as a suffix
     *
     * EX Criminal mind Ft Akon (Remix Braquer vos têtes) => suffix = (Remix Braquer vos têtes)
     *
     * For artist strings a trailing parenthetical is instead part of the last artist's name, so it should stay with the credits
     *
     * EX Roy Orbison featuring Snow Patrol / Cliff Edwards (Ukelele Ike) => last credit = Cliff Edwards (Ukelele Ike)
     * */
    wrappedSuffixIsCredit?: boolean
}
export const parseCredits = (str: string, delimiters?: boolean | string[], opts: ParseCreditsOptions = {}): PlayCredits | undefined => {
    if (str.trim() === '') {
        return undefined;
    }

    let secondary: string[] = [];
    let suffix: string | undefined;
    const results = parseRegexSingle(PRIMARY_SECONDARY_SECTIONS_REGEX, str);
    if(results !== undefined) {

        let delims: string[] | undefined;
        if (Array.isArray(delimiters)) {
            delims = delimiters;
        } else if (delimiters === false) {
            delims = [];
        }

        const primary: string = results.named.primary.trim();
        for(const strat of SECONDARY_REGEX_STRATS) {
            const secCredits = parseRegexSingle(strat, results.named.secondary);
            if(secCredits !== undefined) {
                let credits = secCredits.named.credits as string;
                suffix = secCredits.named.creditsSuffix;
                if(opts.wrappedSuffixIsCredit && strat === SECONDARY_FREE_REGEX && suffix !== undefined && /^\s*[([].+[)\]]\s*$/.test(suffix)) {
                    // move the parenthetical "suffix" back onto the credits so it is kept as part of the last credit
                    credits = `${credits}${suffix}`;
                    suffix = undefined;
                }
                secondary = parseContextAwareStringList(credits, delims)
                break;
            }
        }
        if(secondary === undefined) {
            // uh oh, this shouldn't have happened! Return nothing since we don't know how to parse this
            return undefined;
        }
        return {
            primary: primary,
            primaryComposite: `${primary}${suffix ?? ''}`,
            secondary,
            suffix
        }
    }
    return undefined;
}
export const parseArtistCredits = (str: string, delimiters?: boolean | string[], ignoreGlobalAmpersand?: boolean): PlayCredits | undefined => {
    if (str.trim() === '') {
        return undefined;
    }
    let delims: string[] | undefined;
    if (Array.isArray(delimiters)) {
        delims = delimiters;
    } else if (delimiters === false) {
        delims = [];
    }
    const withJoiner = parseCredits(str, delimiters, {wrappedSuffixIsCredit: true});
    if (withJoiner !== undefined) {
        // all this does is make sure and "ft" or parenthesis/brackets are separated --
        // it doesn't also separate primary artists so do that now
        const primaries = parseContextAwareStringList(withJoiner.primary, delims, {ignoreGlobalAmpersand: ignoreGlobalAmpersand ?? false});
        if (primaries.length > 1) {
            return {
                primary: primaries[0],
                primaryComposite: primaries[0],
                secondary: primaries.slice(1).concat(withJoiner.secondary ?? [])
            }
        }
        return withJoiner;
    }
    // likely this is a plain string with just delims
    const artists = parseContextAwareStringList(str, delims, {ignoreGlobalAmpersand: ignoreGlobalAmpersand ?? true});
    if (artists.length > 1) {
        return {
            primary: artists[0],
            primaryComposite: artists[0],
            secondary: artists.slice(1)
        }
    }
    return {
        primary: artists[0],
        primaryComposite: artists[0],
    }
}
export const parseTrackCredits = (str: string, delimiters?: boolean | string[]): PlayCredits | undefined => parseCredits(str, delimiters);
export const parseStringList = (str: string, delimiters: string[] = DELIMITERS): string[] => {
    if (delimiters.length === 0) {
        return [str];
    }
    return delimiters.reduce((acc: string[], curr: string) => {
        const explodedStrings = acc.map(x => x.split(curr));
        return explodedStrings.flat(1);
    }, [str]).map(x => x.trim());
}
export const parseContextAwareStringList = (str: string, delimiters: string[] = DELIMITERS_NO_AMP, opts: {ignoreGlobalAmpersand?: boolean} = {}): string[] => {
    if (delimiters.length === 0) {
        return [str];
    }
    // bypass tokens using slashes without spaces
    const cleanStr = bypassJoiners(str);
    const nonAmpersandDelims = delimiters.some(x => cleanStr.includes(x));
    const shouldIgnoreGlobalAmpersand = opts.ignoreGlobalAmpersand ?? nonAmpersandDelims;

    let awareList: string[] = [];

    const list = parseStringList(cleanStr, nonAmpersandDelims === false && shouldIgnoreGlobalAmpersand === false ? ['&'] : delimiters);
    if(shouldIgnoreGlobalAmpersand && list.length > 1 && list[list.length - 1].includes('&') && nonAmpersandDelims) { //&& !list[list.length - 1].includes('& the')
        awareList = list.slice(0, list.length - 1).concat(list[list.length - 1].split('&') );
    } else {
        awareList = list;
    }
    return awareList.map(x =>rejoinBypassed(x.trim()));
}

const bypassJoinerMap = [
    {
        rejoin: (str: string) => str.replaceAll(/(.*?\S)(\^\^\^)(\S.*?)/g, '$1/$3'),
        bypass: (str: string) => str.replaceAll(/(.*?\S)(\/)(\S.*?)/g, '$1^^^$3')
    },
    {
        rejoin: (str: string) => str.replaceAll(/(.*)(###)(.*)/g, '$1\\$3'),
        bypass: (str: string) => str.replaceAll(/(.*\S)(\\)(.*\S)/g, '$1###$3')
    }
];
export const bypassJoiners = (str: string): string => {
    let bypassed: string = str;
    for(const b of bypassJoinerMap) {
        bypassed = b.bypass(bypassed)
    }
    return bypassed;
}
export const rejoinBypassed = (str: string): string => {
    let bypassed: string = str;
    for(const b of bypassJoinerMap) {
        bypassed = b.rejoin(bypassed)
    }
    return bypassed;
}
export interface TrackSamenessResults {
    naive: StringSamenessResult, 
    cleaned: StringSamenessResult, 
    exact: boolean}

export const compareScrobbleTracks = (existing: PlayObject, candidate: PlayObject): [StringSamenessResult, TrackSamenessResults] => {
    const {
        data: {
            track: existingTrack,
        } = {},
    } = existing;

    const {
        data: {
            track: candidateTrack
        }
    } = candidate;

    return compareTracks(existingTrack?.name ?? '', candidateTrack?.name ?? '');
}

export const compareTracks = (existingTrack: string, candidateTrack: string): [StringSamenessResult, TrackSamenessResults] => {
        const exact = existingTrack === candidateTrack;

    // try to remove any joiners based on existing artists
    const existingCredits = parseTrackCredits(existingTrack);
    const existingPrimary = existingCredits !== undefined ? existingCredits.primaryComposite : existingTrack;

    const candidateCredits = parseTrackCredits(candidateTrack);
    const candidatePrimary = candidateCredits !== undefined ? candidateCredits.primaryComposite : candidateTrack;

    // take whichever score is higher
    const creditsCleanedTrackSameness = compareNormalizedStrings(existingPrimary, candidatePrimary);
    const naiveTrackSameness = compareNormalizedStrings(existingTrack, candidateTrack);

    const highest = creditsCleanedTrackSameness.highScore > naiveTrackSameness.highScore ? creditsCleanedTrackSameness : naiveTrackSameness;

    return [highest, {naive: naiveTrackSameness, cleaned: creditsCleanedTrackSameness, exact}];
}

export const compareScrobbleArtists = (existing: PlayObject, candidate: PlayObject): number => {
    const {
        data: {
            artists: existingArtists = [],
        } = {},
    } = existing;

    const {
        data: {
            artists: candidateArtists = [],
        }
    } = candidate;

    return compareNormalizedStrings(existingArtists.reduce((acc, curr) => `${acc} ${curr.name}`, ''), candidateArtists.reduce((acc, curr) => `${acc} ${curr.name}`, '')).highScore;
}

export const compareScrobbleArtistCredits = (existingArtists: Credit[], candidateArtists: Credit[]): number => {
    return compareNormalizedStrings(existingArtists.reduce((acc, curr) => `${acc} ${curr.name}`, ''), candidateArtists.reduce((acc, curr) => `${acc} ${curr.name}`, '')).highScore;
}

export const scoreNormalizedStringsWeighted = (reference: string | undefined, candidate: string | undefined, weight: number, exactBonus: number = 0): number => {
    const sameness = compareNormalizedStrings(reference ?? '', candidate ?? '');
    const exact = reference === candidate;

    const normalScore = Math.min(sameness.highScore/100, 1);

    return normalScore * (weight + (exact ? exactBonus : 0));
}

interface ArrParseOpts {
    lower?: boolean
}

export const parseArrayFromMaybeString = (value: string | string[] = '', opts: ArrParseOpts = {}): string[] => {
    const {lower = false} = opts;
    let arr: string[];
    if (Array.isArray(value)) {
        arr = value;
    } else if (value.trim() === '') {
        return [];
    } else {
        arr = value.split(',');
    }
    arr = arr.map(x => x.trim());
    if (lower) {
        arr = arr.map(x => x.toLowerCase());
    }
    return arr;
}

export const parseBoolOrArrayFromMaybeString = (value: string | string[] | boolean = '', opts: ArrParseOpts = {}): string[] | boolean => {
    if (typeof value === 'boolean') {
        return value;  
    }
    if(Array.isArray(value)) {
        return value;
    }
    try {
        return parseBoolStrict(value);
    } catch (e) {
        // not a strict bool value
    }
    return parseArrayFromMaybeString(value, opts);
}

export const firstNonEmptyStr = (vals: unknown[]): string | undefined => {
    for(const val of vals) {
        if(val !== undefined && val !== null && typeof val !== 'object') {
            const strVal = val.toString();
            if(strVal.trim() !== '') {
                return strVal;
            }
        }
    }
}

export const buildStatePlayerPlayIdententifyingInfo = (data: PlayObject | PlayerStateDataMaybePlay): string => {
    let idInfo = genGroupIdStr(getPlatformIdFromData(data));
    if(asPlayerStateData(data)) {
        idInfo = buildTrackString(data.play, {include: ['artist', 'track', 'platform', 'session']});
    }
    return idInfo;
}


export const LZ_VERSION_PATH: RegExp = new RegExp(/\/?1\/?$/);

export const normalizeListenbrainzUrl = (urlVal: string): string | undefined => {
    if (parseRegexSingle(LZ_VERSION_PATH, urlVal)) {
        return urlVal.replace(LZ_VERSION_PATH, '');
    }
    return undefined;
}

type HashFunction = (obj: object) => string;
const defaultHasher = hasher();
const defaultHashFunc: HashFunction = (obj) => defaultHasher.hash(obj);
export const hashObject = (obj: object, h: HashFunction = defaultHashFunc): string => h(obj);

const NON_ALPHANUMWHITESPACE_CHARS: RegExp = new RegExp(/[^a-zA-Z\d\s]/);
export const hasNonAlphanumericChars = (str: string): boolean => {
    return NON_ALPHANUMWHITESPACE_CHARS.test(str);
}

/**
 * Produces a deterministic number from a string, DJB2 Hash
 * 
 * Not cryptographically secure or probably good for avoiding collisions
 * but we're only using it for like a set of < 10 to make deterministic user ids for listenbrainz spec
 * 
 * @see https://www.xjavascript.com/blog/javascript-generate-unique-number-based-on-string/
 */
export const stringToDeterministicNumber = (str: string): number => {
  let hash = 5381; // Initial value
  for (let i = 0; i < str.length; i++) {
    // hash * 33 + charCode (bitwise shift for efficiency: hash << 5 is hash * 32)
    hash = (hash << 5) + hash + str.charCodeAt(i); 
  }
  // Convert to unsigned 32-bit integer to avoid negative values
  return hash >>> 0; 
}

export const commaSeparatedListReplace = (str: string): string => str.replace('list', 'comma-delimited list');