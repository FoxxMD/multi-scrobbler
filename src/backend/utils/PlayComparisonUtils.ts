import { getListDiff, ListDiff } from "@donedeal0/superdiff";
import { PlayMatchResult, PlayObject, PlayObjectLifecycleless, SOURCE_SOT, TA_CLOSE, TA_DEFAULT_ACCURACY, TA_DURING, TA_EXACT, TA_FUZZY, TemporalAccuracy, TrackStringOptions } from "../../core/Atomic.js";
import { buildTrackString, capitalize, truncateStringToLength } from "../../core/StringUtils.js";
import { comparingMultipleArtists, playObjDataMatch, setIntersection } from "../utils.js";
import { comparePlayTemporally, hasAcceptableTemporalAccuracy, temporalAccuracyToString, TemporalPlayComparisonOptions, temporalPlayComparisonSummary } from "./TimeUtils.js";
import { compareNormalizedStrings, compareScrobbleArtists, compareScrobbleTracks, compareTracks, normalizeStr, TrackSamenessResults } from "./StringUtils.js";
import { ARTIST_WEIGHT, DUP_SCORE_THRESHOLD, ScrobbledPlayObject, TIME_WEIGHT, TITLE_WEIGHT } from "../common/infrastructure/Atomic.js";
import { StringSamenessResult } from "@foxxmd/string-sameness";
import { Duration } from "dayjs/plugin/duration.js";
import { PlayTransformRules, TRANSFORM_HOOK, TransformHook } from "../common/infrastructure/Transform.js";
import { Logger } from "@foxxmd/logging";
import { loggerNoop } from '../common/MaybeLogger.js';
import { lifecyclelessInvariantTransform } from "../../core/PlayUtils.js";
import { findAsyncSequential } from "./AsyncUtils.js";


export const metaInvariantTransform = (play: PlayObject): PlayObjectLifecycleless => {
    const {
        meta: {
            trackId
        } = {},
    } = play;
    return {
        ...play,
        meta: {
            trackId
        }
    }
}

export const playDateInvariantTransform = (play: PlayObject): PlayObject => {
    const {
        meta: {
            trackId
        } = {},
    } = play;
    return {
        ...play,
        data: {
            ...play.data,
            playDate: undefined
        }
    }
}

export const playContentInvariantTransform = (play: PlayObject): PlayObjectLifecycleless => {
    const {
        data: {
            playDate,
            playDateCompleted,
            listenRanges,
            listenedFor,
            ...rest
        }
    } = play;
    return {
        data: {
            ...rest
        },
        meta: {}
    }
}

export const playContentBasicInvariantTransform = (play: PlayObject): PlayObjectLifecycleless => {
    const {
        data: {
            playDate,
            repeat,
            playDateCompleted,
            listenRanges,
            listenedFor,
            meta,
            ...rest
        }
    } = play;
    return {
        data: {
            ...rest
        },
        meta: {}
    }
}

export const playMbidIdentifier = (play: PlayObject): string | undefined => {
    const {
        data: {
            meta: {
                brainz: {
                    recording,
                    album,
                    track
                } = {}
            } = {}
        } = {}
    } = play;

    // track mbid is a unique combo of recording on release
    // so we only need it to identifier what should be track + album + artist
    if(track !== undefined) {
        return track;
    }
    // recording is independent of release
    // so to make sure the corresponding track + album is the same
    // we need both recording and release
    if(recording !== undefined && album !== undefined) {
        return `${recording}-${album}`
    }
    return undefined;
}

export type PlayTransformer = (play: PlayObject) => PlayObjectLifecycleless;
export type ListTransformers = PlayTransformer[];

export const defaultListTransformers: ListTransformers = [metaInvariantTransform, playDateInvariantTransform];

export const getPlaysDiff = (aPlays: PlayObject[], bPlays: PlayObject[], transformers: ListTransformers = defaultListTransformers): ListDiff => {
    const cleanAPlays = transformers === undefined ? aPlays : transformers.reduce((acc: PlayObject[], curr) => acc.map(curr), aPlays);
    const cleanBPlays = transformers === undefined ? bPlays : transformers.reduce((acc: PlayObject[], curr) => acc.map(curr), bPlays);

    return getListDiff(cleanAPlays, cleanBPlays);
}

export const playsAreSortConsistent = (aPlays: PlayObject[], bPlays: PlayObject[], transformers: ListTransformers = defaultListTransformers) => {
    const diff = getPlaysDiff(aPlays, bPlays, transformers);
    return diff.status === 'equal';
}

export const getDiffIndexState = (results: any, index: number) => {
    const replaced = results.diff.filter(x => (x.status === 'deleted' && x.prevIndex === index) || (x.status === 'added' && x.newIndex === index));
    if(replaced.length === 2) {
        return 'replaced';
    }
    let diff = results.diff.find(x => x.newIndex === index);
    if(diff !== undefined) {
        return diff.status;
    }
    diff = results.diff.find(x => x.prevIndex === index);
    if(diff !== undefined) {
        return diff.status;
    }
    return undefined;
}

export type PlayOrderBumpedType = 'append' | 'prepend';
export type PlayOrderAddedType = PlayOrderBumpedType | 'insert';
export type PlayOrderChangeType = PlayOrderAddedType | PlayOrderBumpedType;


export type PlayOrderConsistencyResults<T extends PlayOrderChangeType> = [boolean, PlayObject[]?, T?]

export const playsAreAddedOnly = (aPlays: PlayObject[], bPlays: PlayObject[], transformers: ListTransformers = defaultListTransformers): PlayOrderConsistencyResults<PlayOrderAddedType> => {
    const results = getPlaysDiff(aPlays, bPlays, transformers);
     if(results.status === 'equal' || results.status === 'deleted') {
        return [false];
    }

    let addType: 'insert' | 'append' | 'prepend';
     for(const [index, play] of bPlays.entries()) {
         const isEqual = results.diff.some(x => x.status === 'equal' && x.prevIndex === index && x.newIndex === index);

         if(isEqual) {
             continue;
         }

         const replaced = results.diff.filter(x => (x.status === 'deleted' && x.prevIndex === index) || (x.status === 'added' && x.newIndex === index));
         if(replaced.length === 2) {
             addType = 'insert';
             return [false];
         }

         const moved = results.diff.some(x => x.status === 'moved' && x.newIndex === index);
         if(moved) {
             continue;
         }

         const added = results.diff.find(x => x.status === 'added' && x.newIndex === index);
         if(added !== undefined) {

             if(added.newIndex === 0) {
                 addType = 'prepend';
             } else if(added.newIndex === bPlays.length - 1) {
                 addType = 'append';
             } else {
                 const prevDiff = getDiffIndexState(results, index - 1);
                 const nextDiff = getDiffIndexState(results, index + 1);
                 if(prevDiff !== 'added' && nextDiff !== 'added') {
                     addType = 'insert';
                     return [false];
                 } else if(addType !== 'prepend' && nextDiff !== 'added') {
                     addType = 'insert';
                     return [false];
                 } else if(addType === 'prepend' && prevDiff !== 'added') {
                     return [false];
                 }
             }
         }
     }
    const added = results.diff.filter(x => x.status === 'added');
    return [addType !== 'insert' && addType !== undefined, added.map(x => bPlays[x.newIndex]), addType];
}

export const playsAreBumpedOnly = (aPlays: PlayObject[], bPlays: PlayObject[], transformers: ListTransformers = defaultListTransformers): PlayOrderConsistencyResults<PlayOrderBumpedType> => {
    const results = getPlaysDiff(aPlays, bPlays, transformers);
    if(results.status === 'equal' || results.status === 'deleted') {
       return [false];
   }
   if(aPlays.length !== bPlays.length) {
    return [false];
   }

   let addTypeShouldBe: 'append' | 'prepend';
   let cursor: 'moved' | 'equal';

   for(const [index, diffData] of results.diff.entries()) {
    if(diffData.status !== 'moved' && diffData.status !== 'equal') {
        return [false];
    }

        if(index === 0) {
            if(diffData.status === 'moved' && diffData.indexDiff < 0) {
               addTypeShouldBe = 'prepend';
            } else if(diffData.status === 'equal') {
                addTypeShouldBe = 'append';
            } else {
                return [false];
            }
        } else {

            if(index === results.diff.length - 1) {
                if(addTypeShouldBe === 'append' && diffData.status !== 'moved') {
                    return [false];
                }
            } else {

                if(![-1,0,1].includes(diffData.indexDiff)) {
                    return [false]; // shifted more than one spot in list which isn't a bump
                }
                if(cursor === undefined) { // first non-initial item
                    cursor = diffData.status;
                    continue;
                } else if(
                    (addTypeShouldBe === 'prepend' && cursor === 'equal' && diffData.status === 'moved')
                    || (addTypeShouldBe === 'append' && cursor === 'moved' && diffData.status === 'equal')
                ) {
                    // can't go back from equal (passed bump point) to moved b/c would mean more than one item moved and not just one bump
                    return [false];
                }

                // otherwise intermediate
                cursor = diffData.status;
            }
        }
   }

   return [true, addTypeShouldBe === 'prepend' ? [bPlays[0]] : [bPlays[bPlays.length - 1]], addTypeShouldBe];
}

export const humanReadableDiff = (aPlay: PlayObject[], bPlay: PlayObject[], result: ListDiff): string => {
    const changes: [string, string?][] = [];
    for(const [index, play] of bPlay.entries()) {
        const ab: [string, string?] = [`${index + 1}. ${buildTrackString(play, {include: ['artist', 'track', 'trackId', 'album', 'comment']})}`];

        const isEqual = result.diff.some(x => x.status === 'equal' && x.prevIndex === index && x.newIndex === index);
        if(!isEqual) {
            const moved = result.diff.filter(x => x.status === 'moved' && x.newIndex === index);
            if(moved.length > 0) {
                ab.push(`Moved -  Originally at ${moved[0].prevIndex + 1}`);
            } else {
                // look for replaced first
                const replaced = result.diff.filter(x => (x.status === 'deleted' && x.prevIndex === index) || (x.status === 'added' && x.newIndex === index));
                if(replaced.length === 2) {
                    const newPlay = replaced.filter(x => x.status === 'deleted');
                    ab.push(`Replaced - Original => ${buildTrackString( newPlay[0].value)}`);
                } else {
                    const added = result.diff.some(x => x.status === 'added' && x.newIndex === index);
                    if(added) {
                        ab.push('Added');
                    } else {
                        // was updated, probably??
                        const updated = result.diff.filter(x => x.status === 'deleted' && x.prevIndex === index);
                        if(updated.length > 0) {
                            ab.push(`Updated - Original => ${buildTrackString( aPlay[updated[0].prevIndex])}`);
                        } else {
                            ab.push('Should not have gotten this far!');
                        }
                    }
                }
            }
        }
        changes.push(ab);
    }
    return changes.map(([a,b]) => {
       if(b === undefined) {
           return a;
       }
       return `${a} => ${b}`;
    }).join('\n');
}

export const genericSourcePlayMatch = (a: PlayObject, b: PlayObject, t?: TemporalAccuracy[], temporalOptions?: TemporalPlayComparisonOptions): boolean =>
    playObjDataMatch(a, b)
    && hasAcceptableTemporalAccuracy(comparePlayTemporally(a, b, temporalOptions).match, t);

export const comparePlayArtistsNormalized = (existing: PlayObject, candidate: PlayObject): [number, number] => {
    const {
        data: {
            artists: existingArtists = [],
        } = {}
    } = existing;
    const {
        data: {
            artists: candidateArtists = [],
        } = {}
    } = candidate;
    const normExisting = existingArtists.map(x => normalizeStr(x.name, {keepSingleWhitespace: true}));
    const candidateExisting = candidateArtists.map(x => normalizeStr(x.name, {keepSingleWhitespace: true}));

    const wholeMatches = setIntersection(new Set(normExisting), new Set(candidateExisting)).size;
    return [Math.min(compareScrobbleArtists(existing, candidate)/100, 1), wholeMatches]
}

export const comparePlayTracksNormalized = (existing: PlayObject, candidate: PlayObject): [number,TrackSamenessResults]  => {
    const [highest, results] = compareScrobbleTracks(existing, candidate);
    return [Math.min(highest.highScore/100, 1), results];
}

export const scoreTrackWeightedAndNormalized = (ref: string, candidate: string, weight?: number, bonuses: {exact?: number, naive?: number} = {}): [number,TrackSamenessResults] => {
    const {
        exact,
        naive
    } = bonuses;
    const [trackSameness, trackRes] = compareTracks(ref, candidate);
    const trackHigh = Math.min(trackSameness.highScore/100, 1)

    let trackBonus = 0;
    if(trackRes.exact) {
        trackBonus = exact;
    } else if(trackRes.naive.highScore > trackRes.cleaned.highScore) {
        trackBonus = naive;
    }
    const trackScore = trackHigh * (weight + trackBonus);

    return [trackScore, trackRes];
}

export const comparePlayAlbumNormalized = (existing: PlayObject, candidate: PlayObject): [number,{result: StringSamenessResult, exact: boolean}]  => {
    const sameness = compareNormalizedStrings(existing.data.album ?? '', candidate.data.album ?? '');

    const exact = existing.data.album === candidate.data.album;

    return [Math.min(sameness.highScore/100, 1), {result: sameness, exact}];
}

export interface SamenessScoreOptions {
    weights?: {
        track?: number
        trackBonuses?: {
            exact?: number
            naive?: number
        }
        artist?: number
        artistBonuses?: {
            exact?: number
        }
        album?: number
        albumBonuses?: {
            exact?: number
            naive?: number
        }
    }
}
export const scorePlaySameness = (ref: PlayObject, candidate: PlayObject, options: SamenessScoreOptions = {}) => {

    const {
        weights: {
            track: trackWeight = TITLE_WEIGHT,
            trackBonuses: {
                exact: tExact = 0.05,
                naive: tNaive = 0.03,
            } = {},
            artist: artistWeight = ARTIST_WEIGHT,
            artistBonuses: {
                exact: arExact = 0.05
            } = {},
            album: albumWeight = 0.3,
            albumBonuses: {
                exact: alExact = 0.05,
            } =  {}
        } = {}
    } = options;

    const [trackHigh, trackRes] = comparePlayTracksNormalized(ref, candidate);
    const [artistHigh, artistRes] = comparePlayArtistsNormalized(ref, candidate);
    const [albumHigh, albumRes] = comparePlayAlbumNormalized(ref, candidate);

    let trackBonus = 0;
    if(trackRes.exact) {
        trackBonus = tExact;
    } else if(trackRes.naive.highScore > trackRes.cleaned.highScore) {
        trackBonus = tNaive;
    }
    const trackScore = trackHigh * (trackWeight + trackBonus);

    let artistBonus = 0;
    if(artistRes > 0) {
        artistBonus = arExact;
    }
    const artistScore = artistHigh * (artistWeight + artistBonus);

    let albumBonus = 0;
    if(albumRes.exact) {
        albumBonus = alExact;
    }
    const albumScore = albumHigh * (albumWeight + albumBonus);

    return trackScore + artistScore + albumScore;
}

export const playDateWithinDurationOfAny = (play: PlayObject, plays:  PlayObject[], dur: Duration): PlayObject | undefined => {
    return plays.find(x => Math.abs(x.data.playDate.diff(play.data.playDate, 's')) <= dur.asSeconds());
}

export interface ExistingScrobbleOpts {
    transformPlay?: (play: PlayObject, hookType: TransformHook) => Promise<PlayObject>
    existingSubmitted?: (play: PlayObject) => Promise<[ScrobbledPlayObject?, ScrobbledPlayObject[]?]>
    transformRules?: PlayTransformRules
    checkExistingScrobbles?: boolean
    logger?: Logger
}

export const existingScrobble = async (playObjPre: PlayObject, existingScrobbles: PlayObject[], opts: ExistingScrobbleOpts = {}, log?: boolean): Promise<PlayMatchResult> => {

    const {
        transformPlay = (play, hook) => play,
        existingSubmitted = (play) => [undefined, undefined],
        transformRules,
        checkExistingScrobbles = true,
        logger = loggerNoop
    } = opts;

        const result: PlayMatchResult = {
            match: false,
            score: 0,
            breakdowns: [],
            reason: 'No existing scrobble matched with a score higher than 0'
        };

        const playObj = await transformPlay(playObjPre, TRANSFORM_HOOK.candidate);
        if(transformRules?.compare?.candidate !== undefined) {
            result.transformedPlay = playObj;
        }

        const tr = truncateStringToLength(27);
        const scoreTrackOpts: TrackStringOptions = {include: ['track', 'artist', 'time'], transformers: {track: (t: any, data, existing) => `${existing ? '- ': ''}${tr(t)}`}};

        // return early if we don't care about checking existing
        if (false === checkExistingScrobbles) {
            logger.trace(`${capitalize(playObj.meta.source ?? 'Source')}: ${buildTrackString(playObj, scoreTrackOpts)} => No Match because existing scrobble check is FALSE`);
            result.reason = 'existing scrobble check is FALSE';
            return result;
        }

        let existingScrobble;

        // then check if we have already recorded this
        const [existingExactSubmitted, existingDataSubmitted = []] = await existingSubmitted(playObjPre);

        // if we have an submitted play with matching data and play date then we can just return the response from the original scrobble
        if (existingExactSubmitted !== undefined) {
            result.closestMatchedPlay = lifecyclelessInvariantTransform(existingExactSubmitted.play);
            result.score = 1;
            result.match = true;
            result.reason = 'Exact Match found in previously successfully scrobbled plays';

            existingScrobble = existingExactSubmitted.scrobble;
        }
        // if not though then we need to check recent scrobbles from scrobble api.
        // this will be less accurate than checking existing submitted (obv) but will happen if backlogging or on a fresh server start

        if (existingScrobble === undefined) {

            // if no recent scrobbles found then assume we haven't submitted it
            // (either user doesnt want to check history or there is no history to check!)
            if (existingScrobbles.length === 0) {
                logger.trace(`${buildTrackString(playObj, scoreTrackOpts)} => No Match because no existing scrobbles returned from API`);
                result.reason = 'no recent scrobbles returned from API';
                return result;
            }

            // only check for fuzzy if we know this play is NOT a repeat
            // otherwise we may get a false positive on the previously played track ending time == repeat start time
            // -- this is info we only know if play was generated from MS player so we can be reasonably sure
            //
            // OR if play was generated from a source that uses History (endpoint sources, lfm or lz history sources)
            // then we can be reasonably sure that our candidate play has an accurate timestamp and wouldn't fuzzy match a previous scrobble
            const looseTimeAccuracy = playObj.data.repeat || playObj.meta.sourceSOT === SOURCE_SOT.HISTORY ? [TA_DURING] : [TA_FUZZY, TA_DURING];

            
            existingScrobble = await findAsyncSequential(existingScrobbles, async (xPre) => {

                const x = await transformPlay(xPre, TRANSFORM_HOOK.existing);

                //const referenceMatch = referenceApiScrobbleResponse !== undefined && playObjDataMatch(x, referenceApiScrobbleResponse);


                const temporalComparison = comparePlayTemporally(x, playObj);
                let timeMatch = 0;
                if(hasAcceptableTemporalAccuracy(temporalComparison.match)) {
                    timeMatch = 1;
                } else if(hasAcceptableTemporalAccuracy(temporalComparison.match, looseTimeAccuracy)) {
                    timeMatch = 0.6;
                }

                const [titleMatch, titleResults] = comparePlayTracksNormalized(x, playObj);

                const [artistMatch, wholeMatches] = comparePlayArtistsNormalized(x, playObj);

                let artistScore = ARTIST_WEIGHT * artistMatch;
                const titleScore = TITLE_WEIGHT * titleMatch;
                const timeScore = TIME_WEIGHT * timeMatch;
                //const referenceScore = REFERENCE_WEIGHT * (referenceMatch ? 1 : 0);
                let score = artistScore + titleScore + timeScore;

                let artistWholeMatchBonus = 0;
                let artistBreakdown =  `Artist: ${artistMatch.toFixed(2)} * ${ARTIST_WEIGHT} = ${artistScore.toFixed(2)}`;

                if(score < 1 && timeMatch > 0 && titleMatch > 0.98 && artistMatch > 0.1 && wholeMatches > 0 && comparingMultipleArtists(x, playObj)) {
                    // address scenario where:
                    // * title is very close
                    // * time falls within plausible dup range
                    // * artist is not totally different
                    // * AND score is still not high enough for a dup
                    //
                    // if we detect the plays have multiple artists and we have at least one whole match (stricter comparison than regular score)
                    // then bump artist score a little to see if it gets it over the fence
                    //
                    // EX: Source: The Bongo Hop - Sonora @ 2023-09-28T10:54:06-04:00 => Closest Scrobble: Nidia Gongora / The Bongo Hop - Sonora @ 2023-09-28T10:59:34-04:00 => Score 0.83 => No Match
                    // one play is only returning primary artist, and timestamp is at beginning instead of end of play

                    const scoreBonus = artistMatch * 0.5;
                    const scoreGapBonus = (1 - artistMatch) * 0.75;
                    // use the smallest bump or 0.1
                    artistWholeMatchBonus = Math.max(scoreBonus, scoreGapBonus, 0.1);
                    artistScore = (ARTIST_WEIGHT + 0.05) * (artistMatch + artistWholeMatchBonus);
                    score = artistScore + titleScore + timeScore;
                    artistBreakdown = `Artist: (${artistMatch.toFixed(2)} + Whole Match Bonus ${artistWholeMatchBonus.toFixed(2)}) * (${ARTIST_WEIGHT} + Whole Match Bonus 0.05) = ${artistScore.toFixed(2)}`;
                }

                const scoreBreakdowns = [
                    //`Reference: ${(referenceMatch ? 1 : 0)} * ${REFERENCE_WEIGHT} = ${referenceScore.toFixed(2)}`,
                    artistBreakdown,
                    `Title: ${titleMatch.toFixed(2)} * ${TITLE_WEIGHT} = ${titleScore.toFixed(2)}`,
                    `Time: (${capitalize(temporalAccuracyToString(temporalComparison.match))}) ${timeMatch} * ${TIME_WEIGHT} = ${timeScore.toFixed(2)}`,
                    `Time Detail => ${temporalPlayComparisonSummary(temporalComparison, x, playObj)}`,
                    `Score ${score.toFixed(2)} => ${score >= DUP_SCORE_THRESHOLD ? 'Matched!' : 'No Match'}`
                ];

                const confidence = `Score ${score.toFixed(2)} => ${score >= DUP_SCORE_THRESHOLD ? 'Matched!' : 'No Match'}`

                if (result.score <= score && score > 0) {
                    result.reason = confidence;
                    result.closestMatchedPlay = lifecyclelessInvariantTransform(x);
                    result.match = score >= DUP_SCORE_THRESHOLD;
                    result.breakdowns = scoreBreakdowns;
                    result.score = score;
                    
                    if(result.match === false && temporalComparison.match === TA_EXACT && score >= 0.90) {
                        // if we have a score >= 90 and time is an exact match
                        // it's likely the differences are due to source-scrobbler data presentation, or deficiencies,
                        // rather than actually being unique
                        // so force match in this instance
                        result.match = true;
                        result.reason = `Score ${score.toFixed(2)} is not greater than threshold (${DUP_SCORE_THRESHOLD}) but it is very close and timestamp is an exact match, vibe matching.`;
                    }
                }

                return score >= DUP_SCORE_THRESHOLD;
            });
        }

        const closestScrobbleParts: string[] = [];
        if(result.closestMatchedPlay !== undefined) {
            closestScrobbleParts.push(`Closest Scrobble: ${buildTrackString(result.closestMatchedPlay, scoreTrackOpts)}`);
        }
        closestScrobbleParts.push(result.reason);
        let summaryStart = `${capitalize(playObj.meta.source ?? 'Source')}: ${buildTrackString(playObj, scoreTrackOpts)} => ${closestScrobbleParts.join(' => ')}`;
        const summary = `${summaryStart}${result.breakdowns.length > 0 ? `\n${result.breakdowns.join('\n')}` : ''}`
        result.summary = summary;
        if(log) {
            logger.trace(summary);
        }
        return result;
    }