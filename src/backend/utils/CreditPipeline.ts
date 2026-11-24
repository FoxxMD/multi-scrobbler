import { stringSameness } from '@foxxmd/string-sameness';
import { parseRegexSingle } from '@foxxmd/regex-buddy-core';
import type { Credit, ParseDecision } from '../../core/Atomic.ts';
import { DELIMITERS } from '../../core/Atomic.ts';
import { nameToCredit } from '../../core/MusicMetadata.ts';
import { findDelimiters, normalizeStr, slice, SYMBOLS_REGEX } from '../../core/StringUtils.ts';
import { unique } from '../utils.ts';
import { parseArtistCredits, parseCredits, parseTrackCredits, uniqueNormalizedStrArr } from './StringUtils.ts';

/**
 * An artist from trusted-ish reference data (ex. a Musicbrainz mapping) used to help parse user-submitted values
 * */
export interface ReferenceArtist {
    name: string
    /** Phrase joining this artist to the next one, including surrounding whitespace. Empty string if none */
    joinPhrase: string
    /** Credit (with any ids) used for this artist when it is part of the result */
    credit: Credit
}

export interface CreditReference {
    artists: ReferenceArtist[]
    track?: string
}

export interface ReferenceParseResult {
    /** Undefined when the reference was rejected, values parsed without reference should be used instead */
    artists?: Credit[]
    /** Undefined when reference artists are trusted but the track name is not, the track parsed without reference should be used instead */
    track?: string
    /** Name of the reference artist matched to the user's primary artist */
    primaryArtist?: string
    decisions: ParseDecision[]
}

const SEGMENT_JOINERS = ['with', 'x', '×', 'and', 'vs', 'ft', 'feat', 'featuring'];

// symbols become whitespace (not removed) so "Foo/Bar" and "Foo / Bar" tokenize the same
const segmentTokens = (str: string): string[] => normalizeStr(str.replace(SYMBOLS_REGEX, ' '), {keepSingleWhitespace: true}).split(' ').filter(x => x !== '');

/**
 * Returns reference artist names, in user-submitted order, only if every word of the user-submitted artist string
 * is part of a whole reference artist name or is a joiner (known joiner words or words from reference join phrases)
 *
 * Returns undefined if any word is unexplained, so a partially matching (possibly wrong) reference is never trusted more
 * */
export const segmentByReferenceArtists = (artistName: string, artists: Pick<ReferenceArtist, 'name' | 'joinPhrase'>[]): string[] | undefined => {
    // a word made only of symbols would vanish when tokenized and wrongly count as explained
    if (artistName.split(/\s+/).some(x => x !== '' && !/^[,&/\\+×]+$/.test(x) && segmentTokens(x).length === 0)) {
        return undefined;
    }
    const userTokens = segmentTokens(artistName);
    const names = artists
        .map(x => ({name: x.name, tokens: segmentTokens(x.name)}))
        .filter(x => x.tokens.length > 0)
        // longest first so "Lucas & L-Boy" wins over "Lucas"
        .sort((a, b) => b.tokens.length - a.tokens.length);
    const joiners = new Set([...SEGMENT_JOINERS, ...artists.flatMap(x => segmentTokens(x.joinPhrase))]);
    // shortcut: greedy longest-first, gives up (falls back to existing parsing) where a different split would work, e.g. "Lucas L Boy" with "Lucas L", "Lucas", "L Boy"
    const found: string[] = [];
    let lastWasName = false;
    let i = 0;
    while (i < userTokens.length) {
        const match = names.find(x => x.tokens.every((t, j) => userTokens[i + j] === t));
        if (match !== undefined) {
            found.push(match.name);
            i += match.tokens.length;
            lastWasName = true;
        } else if (found.length > 0 && joiners.has(userTokens[i])) {
            // joiners only count between names, otherwise "With Confidence" would segment to reference "Confidence"
            i++;
            lastWasName = false;
        } else {
            return undefined;
        }
    }
    return lastWasName ? unique(found) : undefined;
}

/**
 * Removes each reference name from str, along with its join phrase when the join phrase directly follows it
 *
 * Returns the remaining string and the last reference name that was found at the start of the (partially stripped) string
 * */
export const stripReferenceNames = (str: string, artists: Pick<ReferenceArtist, 'name' | 'joinPhrase'>[]): {remaining: string, leading?: string} => {
    let leading: string | undefined;
    const remaining = artists.reduce((acc, curr) => {
        // joinPhrase already includes surrounding whitespace
        const needles = curr.joinPhrase !== '' ? [`${curr.name}${curr.joinPhrase}`, curr.name] : [curr.name];
        for (const needle of needles) {
            const index = acc.toLocaleLowerCase().indexOf(needle.toLocaleLowerCase());
            if (index !== -1) {
                if (index === 0) {
                    // primary artist, most likely
                    leading = curr.name;
                }
                return slice(acc, index, needle.length);
            }
        }
        return acc;
    }, str);
    return {remaining, leading};
}

export interface ParseOptions {
    /** Delimiters used to split artist strings. Undefined uses parser defaults */
    artistDelimiters?: string[]
    /** Delimiters used to split artists found in track ("ft. ..."). Undefined uses parser defaults */
    trackDelimiters?: string[]
    /** Split artist strings, otherwise they are kept as-is. Default true */
    splitArtists?: boolean
    /** Parse artists from track ("ft. ...") and remove them from the track name. Default true */
    parseTrack?: boolean
    /** Artist strings matching any of these are kept as-is */
    ignoreArtists?: RegExp[]
    /** Keep an artist string as-is when nothing could be parsed from it, otherwise drop it. Default true */
    keepUnparsed?: boolean
    /**
     * Split the primary section of an artist string (before any joiner like "ft.") on delimiters. Default true
     *
     * When false only credits after a joiner are split, so "Earth, Wind & Fire" stays whole but "Foo ft. Bar, Baz" gives Foo, Bar, Baz
     * */
    splitPrimary?: boolean
}

export interface ParseResult {
    artists: string[]
    /** Track with artists removed, undefined if no artists were found in track */
    track?: string
    /** Artist strings passed through without being split (ignored, not split, or nothing parsed) */
    keptArtists: string[]
    decisions: ParseDecision[]
}

/**
 * Least confident step, used on its own when there is no reference data: split artists and track on delimiters
 * */
export const parseWithoutReference = (artists: string[], track: string, opts: ParseOptions = {}): ParseResult => {
    const {
        artistDelimiters,
        trackDelimiters,
        splitArtists = true,
        parseTrack = true,
        ignoreArtists = [],
        keepUnparsed = true,
        splitPrimary = true,
    } = opts;
    const decisions: ParseDecision[] = [];

    let found: string[] = [];
    const kept: string[] = [];
    for (const artist of artists) {
        if (!splitArtists) {
            found.push(artist);
            kept.push(artist);
            continue;
        }
        const ignoredBy = ignoreArtists.flatMap(x => {
            const res = parseRegexSingle(x, artist);
            return res !== undefined ? [`${x.toString()} => ${res.match}`] : [];
        });
        if (ignoredBy.length > 0) {
            decisions.push({step: 'ignoreArtists', outcome: 'applied', reason: `Did not split '${artist}' because it matched an ignore regex: ${ignoredBy.join(' | ')}`, candidates: [artist]});
            found.push(artist);
            kept.push(artist);
            continue;
        }
        const credits = splitPrimary ? parseArtistCredits(artist, artistDelimiters) : parseCredits(artist, artistDelimiters);
        if (credits !== undefined) {
            if (credits.primary !== undefined) {
                found.push(credits.primary);
            }
            found = found.concat(credits.secondary ?? []);
        } else if (keepUnparsed) {
            // couldn't parse anything from artist string, use as-is
            found.push(artist);
            kept.push(artist);
        }
    }

    let parsedTrack: string | undefined;
    if (parseTrack) {
        const trackCredits = parseTrackCredits(track, trackDelimiters);
        if (trackCredits !== undefined) {
            // if we found "ft. something" in track string then we now have a "real" track name and more artists
            parsedTrack = trackCredits.primary;
            found = found.concat(trackCredits.secondary ?? []);
        }
    }

    found = uniqueNormalizedStrArr(found);
    decisions.push({
        step: 'delimiters',
        outcome: splitArtists || parseTrack ? 'applied' : 'skipped',
        reason: `Split ${[splitArtists ? `${splitPrimary ? '' : 'only credited (ft./feat./vs) '}artists using ${artistDelimiters === undefined ? 'default delimiters' : artistDelimiters.join(' ')}` : undefined, parseTrack ? `track using ${trackDelimiters === undefined ? 'default delimiters' : trackDelimiters.join(' ')}` : undefined].filter(x => x !== undefined).join(' and ') || 'nothing'}`,
        candidates: found
    });
    return {artists: found, track: parsedTrack, keptArtists: kept, decisions};
}

/** Exact match after normalizing, or string similarity above threshold */
const findSimilar = (names: string[], name: string, threshold: number): string | undefined => {
    const normalName = normalizeStr(name);
    return names.find(x => normalizeStr(x) === normalName || stringSameness(normalizeStr(x), normalName).highScore > threshold);
}

/**
 * Parse artists and track from user-submitted values using reference data, from most to least confident:
 *
 * 1. segment: user artist is fully explained by reference artists and joiners
 * 2. joinedNames: reference artists whose names contain delimiters are removed from user artist/track
 * 3. delimiters: remaining user artist/track are split on delimiters
 * 4. primaryArtistGate: first user-derived artist must match a reference artist, otherwise the reference is rejected
 * 5. merge: user-derived artists are replaced by matching reference artists, unmatched reference artists are appended
 * 6. trackGate: user track must be similar to reference track
 * */
export const parseWithReference = (artistName: string, trackName: string, reference: CreditReference): ReferenceParseResult => {
    const decisions: ParseDecision[] = [];
    const refArtists = reference.artists;
    const refNames = refArtists.map(x => x.name);
    const creditFor = (name: string): Credit => refArtists.find(x => x.name === name)?.credit ?? nameToCredit(name);

    let candidates: string[] = [];
    let primaryArtistHint: string | undefined;
    let remainingArtist = artistName;
    let remainingTrack = trackName;

    // 1. segment
    const segmented = segmentByReferenceArtists(artistName, refArtists);
    if (segmented !== undefined) {
        candidates = segmented;
        primaryArtistHint = segmented[0];
        // fully explained, nothing left to parse
        remainingArtist = '';
        decisions.push({step: 'segment', outcome: 'applied', reason: 'Every word of artist is a reference artist or a joiner', candidates: segmented});
    } else {
        decisions.push({step: 'segment', outcome: 'skipped', reason: 'Artist has words that are not part of a reference artist or a joiner'});
    }

    // 2. joinedNames
    const withJoiners = refArtists.filter(x => findDelimiters(x.name) !== undefined);
    if (withJoiners.length > 0) {
        // none left in artist if segmented
        const inArtist = segmented !== undefined ? [] : withJoiners.filter(x => remainingArtist.toLocaleLowerCase().includes(x.name.toLocaleLowerCase()));
        if (inArtist.length > 0) {
            candidates = candidates.concat(inArtist.map(x => x.name));
            const stripped = stripReferenceNames(remainingArtist, inArtist);
            remainingArtist = stripped.remaining;
            if (stripped.leading !== undefined) {
                primaryArtistHint = stripped.leading;
            }
        }
        const inTrack = withJoiners.filter(x => remainingTrack.toLocaleLowerCase().includes(x.name.toLocaleLowerCase()));
        if (inTrack.length > 0) {
            candidates = candidates.concat(inTrack.map(x => x.name));
            remainingTrack = stripReferenceNames(remainingTrack, inTrack).remaining;
        }
        candidates = uniqueNormalizedStrArr(candidates);
        const found = unique([...inArtist, ...inTrack].map(x => x.name));
        decisions.push(found.length > 0
            ? {step: 'joinedNames', outcome: 'applied', reason: 'Found reference artists with delimiters in their names', candidates: found}
            : {step: 'joinedNames', outcome: 'skipped', reason: 'No reference artists with delimiters in their names found in artist or track'});
    } else {
        decisions.push({step: 'joinedNames', outcome: 'skipped', reason: 'No reference artists have delimiters in their names'});
    }

    if (primaryArtistHint !== undefined) {
        // primary artist (seen first in artist value) should be first
        candidates = uniqueNormalizedStrArr([primaryArtistHint].concat(candidates));
    }

    // 3. delimiters
    let delimiters: string[] | undefined;
    if (withJoiners.length === 0) {
        delimiters = unique(refArtists.filter(x => DELIMITERS.includes(x.joinPhrase.trim())).map(x => x.joinPhrase.trim()));
        if (delimiters.length === 0) {
            delimiters = undefined;
        }
    }
    const parsed = parseWithoutReference([remainingArtist], remainingTrack, {artistDelimiters: delimiters, keepUnparsed: false});
    // track is only replaced when artists were found in it, otherwise keep the (unstripped) original
    const parsedTrack = parsed.track ?? trackName;
    candidates = uniqueNormalizedStrArr(candidates.concat(parsed.artists));
    decisions.push(...parsed.decisions);

    // 4. primaryArtistGate
    const primaryArtist = findSimilar(refNames, candidates[0], 80);
    if (primaryArtist === undefined) {
        // likely the reference is incorrect
        decisions.push({step: 'primaryArtistGate', outcome: 'rejected', reason: `Primary artist candidate '${candidates[0]}' did not match any reference artist`});
        return {decisions};
    }
    decisions.push({step: 'primaryArtistGate', outcome: 'applied', reason: `Primary artist candidate '${candidates[0]}' matched reference artist '${primaryArtist}'`});

    // 5. merge
    // at this point we assume any differences between user and reference artists are a data discrepancy rather than being outright wrong
    const matchedCandidates: string[] = [];
    let derived: string[] = [];
    for (const candidate of candidates) {
        // can be a little more lenient since we are confident on primary artist already
        const matched = findSimilar(refNames, candidate, 75);
        if (matched !== undefined) {
            derived.push(matched);
            matchedCandidates.push(candidate);
        }
    }
    derived = derived
        .concat(candidates.filter(x => !matchedCandidates.includes(x)))
        .concat(refArtists.filter(x => !derived.includes(x.name)).map(x => x.name));
    derived = uniqueNormalizedStrArr(derived);
    decisions.push({step: 'merge', outcome: 'applied', reason: 'Replaced candidates with matching reference artists and added unmatched reference artists', candidates: derived});
    const artists = derived.map(creditFor);

    // 6. trackGate
    if (reference.track === undefined) {
        decisions.push({step: 'trackGate', outcome: 'skipped', reason: 'No reference track'});
        return {artists, track: parsedTrack, primaryArtist, decisions};
    }
    // track should be extracted (no artists in it) and either one includes the other or they are very similar
    const mutuallyIncludes = normalizeStr(parsedTrack).includes(normalizeStr(reference.track)) || normalizeStr(reference.track).includes(normalizeStr(parsedTrack));
    const similar = stringSameness(normalizeStr(parsedTrack), normalizeStr(reference.track)).highScore > 70;
    if (!mutuallyIncludes && !similar) {
        if (segmented !== undefined) {
            // artists were split using only the reference, which the track mismatch says is likely wrong
            decisions.push({step: 'trackGate', outcome: 'rejected', reason: `Track '${parsedTrack}' does not match reference track '${reference.track}' and artists were segmented only by reference`});
            return {decisions};
        }
        decisions.push({step: 'trackGate', outcome: 'rejected', reason: `Track '${parsedTrack}' does not match reference track '${reference.track}', using reference artists but not track`});
        return {artists, primaryArtist, decisions};
    }
    decisions.push({step: 'trackGate', outcome: 'applied', reason: `Track '${parsedTrack}' matched reference track '${reference.track}'`});
    // defer to reference name
    return {artists, track: reference.track, primaryArtist, decisions};
}
