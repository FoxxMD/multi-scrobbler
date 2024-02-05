import { DELIMITERS } from "../common/infrastructure/Atomic.js";
import { parseRegexSingleOrFail } from "../utils.js";
import { PlayObject } from "../../core/Atomic.js";
import {stringSameness, StringSamenessResult} from "@foxxmd/string-sameness";
import {strategies} from '@foxxmd/string-sameness';

const {levenStrategy, diceStrategy} = strategies;

// cant use [^\w\s] because this also catches non-english characters
export const SYMBOLS_WHITESPACE_REGEX = new RegExp(/[`=(){}<>;',.~!@#$%^&*_+|:"?\-\\\[\]\/\s]/g);
export const SYMBOLS_REGEX = new RegExp(/[`=(){}<>;',.~!@#$%^&*_+|:"?\-\\\[\]\/]/g);

export const MULTI_WHITESPACE_REGEX = new RegExp(/\s{2,}/g);
export const uniqueNormalizedStrArr = (arr: string[]): string[] => {
    return arr.reduce((acc: string[], curr) => {
        const normalizedCurr = normalizeStr(curr)
        if (!acc.some(x => normalizeStr(x) === normalizedCurr)) {
            return acc.concat(curr);
        }
        return acc;
    }, []);
}
// https://stackoverflow.com/a/37511463/1469797
export const normalizeStr = (str: string, options?: {keepSingleWhitespace?: boolean}): string => {
    const {keepSingleWhitespace = false} = options || {};
    const normal = str.normalize('NFD').replace(/[\u0300-\u036f]/g, "");
    if(!keepSingleWhitespace) {
        return normal.replace(SYMBOLS_WHITESPACE_REGEX, '').toLocaleLowerCase();
    }
    return normal.replace(SYMBOLS_REGEX, '').replace(MULTI_WHITESPACE_REGEX, ' ').toLocaleLowerCase().trim();
}

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
export const SECONDARY_CAPTURED_REGEX = new RegExp(/[(\[]\s*(?<joiner>ft\.?\W|feat\.?\W|featuring|vs\.?\W)\s*(?<credits>.*)[)\]](?<creditsSuffix>.*)/i);


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
export const SECONDARY_FREE_REGEX = new RegExp(/^\s*(?<joiner>ft\.?\W|feat\.?\W|featuring|vs\.?\W)\s*(?<credits>(?:.+?(?= - |\s*[(\[]))|(?:.*))(?<creditsSuffix>.*)/i);

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
export const PRIMARY_SECONDARY_SECTIONS_REGEX = new RegExp(/^(?<primary>.+?)(?<secondary>(?:[(\[]?(?:\Wft\.?|\Wfeat\.?|featuring|\Wvs\.)).*)/i);

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
export const parseCredits = (str: string, delimiters?: boolean | string[]): PlayCredits => {
    if (str.trim() === '') {
        return undefined;
    }

    let primary: string | undefined;
    let secondary: string[] = [];
    let suffix: string | undefined;
    const results = parseRegexSingleOrFail(PRIMARY_SECONDARY_SECTIONS_REGEX, str);
    if(results !== undefined) {

        let delims: string[] | undefined;
        if (Array.isArray(delimiters)) {
            delims = delimiters;
        } else if (delimiters === false) {
            delims = [];
        }

        primary = results.named.primary.trim();
        for(const strat of SECONDARY_REGEX_STRATS) {
            const secCredits = parseRegexSingleOrFail(strat, results.named.secondary);
            if(secCredits !== undefined) {
                secondary = parseStringList(secCredits.named.credits as string, delims)
                suffix = secCredits.named.creditsSuffix;
                break;
            }
        }
        if(secondary === undefined) {
            // uh oh, this shouldn't have happened! Return nothing since we don't know how to parse this
            return undefined;
        }
        return {
            primary,
            primaryComposite: `${primary}${suffix ?? ''}`,
            secondary,
            suffix
        }
    }
    return undefined;
}
export const parseArtistCredits = (str: string, delimiters?: boolean | string[]): PlayCredits | undefined => {
    if (str.trim() === '') {
        return undefined;
    }
    let delims: string[] | undefined;
    if (Array.isArray(delimiters)) {
        delims = delimiters;
    } else if (delimiters === false) {
        delims = [];
    }
    const withJoiner = parseCredits(str, delimiters);
    if (withJoiner !== undefined) {
        // all this does is make sure and "ft" or parenthesis/brackets are separated --
        // it doesn't also separate primary artists so do that now
        const primaries = parseStringList(withJoiner.primary, delims);
        if (primaries.length > 1) {
            return {
                primary: primaries[0],
                primaryComposite: primaries[0],
                secondary: primaries.slice(1).concat(withJoiner.secondary)
            }
        }
        return withJoiner;
    }
    // likely this is a plain string with just delims
    const artists = parseStringList(str, delims);
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
export const parseStringList = (str: string, delimiters: string[] = [',', '&', '/', '\\']): string[] => {
    if (delimiters.length === 0) {
        return [str];
    }
    return delimiters.reduce((acc: string[], curr: string) => {
        const explodedStrings = acc.map(x => x.split(curr));
        return explodedStrings.flat(1);
    }, [str]).map(x => x.trim());
}
export const containsDelimiters = (str: string) => {
    return null !== str.match(/[,&\/\\]+/i);
}
export const findDelimiters = (str: string) => {
    const found: string[] = [];
    for (const d of DELIMITERS) {
        if (str.indexOf(d) !== -1) {
            found.push(d);
        }
    }
    if (found.length === 0) {
        return undefined;
    }
    return found;
}

export const compareScrobbleTracks = (existing: PlayObject, candidate: PlayObject): StringSamenessResult => {
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

    // try to remove any joiners based on existing artists
    const existingCredits = parseTrackCredits(existingTrack);
    const existingPrimary = existingCredits !== undefined ? existingCredits.primaryComposite : existingTrack;

    const candidateCredits = parseTrackCredits(candidateTrack);
    const candidatePrimary = candidateCredits !== undefined ? candidateCredits.primaryComposite : candidateTrack;

    // take whichever score is higher
    const creditsCleanedTrackSameness = compareNormalizedStrings(existingPrimary, candidatePrimary);
    const naiveTrackSameness = compareNormalizedStrings(existingTrack, candidateTrack);

    if(creditsCleanedTrackSameness.highScore > naiveTrackSameness.highScore) {
        return creditsCleanedTrackSameness;
    }
    return naiveTrackSameness;
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

    return compareNormalizedStrings(existingArtists.reduce((acc, curr) => `${acc} ${curr}`, ''), candidateArtists.reduce((acc, curr) => `${acc} ${curr}`, '')).highScore;
}

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
    const normalExisting = normalizeStr(existing, {keepSingleWhitespace: true});
    const normalCandidate = normalizeStr(candidate, {keepSingleWhitespace: true});

    // split by "token"
    const eTokens = normalExisting.split(' ');
    const cTokens = normalCandidate.split(' ');


    let longerTokens: string[],
        shorterTokens: string[];

    if (eTokens.length > cTokens.length) {
        longerTokens = eTokens;
        shorterTokens = cTokens;
    } else {
        longerTokens = cTokens;
        shorterTokens = eTokens;
    }

    // we will use longest string (token list) as the reducer and order the shorter list to match it
    // so we don't have to deal with undefined positions in the shorter list

    const orderedCandidateTokens = longerTokens.reduce((acc: { ordered: string[], remaining: string[] }, curr) => {
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
    })
}
