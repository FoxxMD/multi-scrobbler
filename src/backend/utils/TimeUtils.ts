import {
    PlayObject,
    TA_CLOSE,
    TA_EXACT,
    TA_FUZZY,
    TA_NONE,
    TemporalAccuracy,
    TemporalPlayComparison
} from "../../core/Atomic";
import {
    DEFAULT_SCROBBLE_DURATION_THRESHOLD,
    DEFAULT_SCROBBLE_PERCENT_THRESHOLD,
    lowGranularitySources,
    ScrobbleThresholdResult
} from "../common/infrastructure/Atomic";
import {formatNumber} from "../utils";
import {ScrobbleThresholds} from "../common/infrastructure/config/source";
import {capitalize} from "../../core/StringUtils";

export const temporalPlayComparisonSummary = (data: TemporalPlayComparison, existingPlay?: PlayObject, candidatePlay?: PlayObject) => {
    const parts: string[] = [];
    if (existingPlay !== undefined && candidatePlay !== undefined) {
        if (existingPlay.data.playDate.isSame(candidatePlay.data.playDate, 'day')) {
            parts.push(`Existing: ${existingPlay.data.playDate.format('HH:mm:ssZ')} - Candidate: ${candidatePlay.data.playDate.format('HH:mm:ssZ')}`);
        } else {
            parts.push(`Existing: ${existingPlay.data.playDate.toISOString()} - Candidate: ${candidatePlay.data.playDate.toISOString()}`);
        }
    }
    parts.push(`Temporal Sameness: ${capitalize(temporalAccuracyToString(data.match))}`);
    if (data.date !== undefined) {
        parts.push(`Play Diff: ${formatNumber(data.date.diff, {toFixed: 0})}s (Needed <${data.date.threshold}s)`)
    }
    if (data.date.fuzzyDurationDiff !== undefined) {
        parts.push(`Fuzzy Duration Diff: ${formatNumber(data.date.fuzzyDurationDiff, {toFixed: 0})}s (Needed <10s)`);
    }
    if (data.date.fuzzyListenedDiff !== undefined) {
        parts.push(`Fuzzy Listened Diff: ${formatNumber(data.date.fuzzyDurationDiff, {toFixed: 0})}s (Needed <10s)`);
    }
    if (data.range !== undefined) {
        if (data.range === false) {
            parts.push('Candidate not played during Existing tracked listening');
        } else {
            parts.push(`Candidate played during tracked listening range from Existing ${data.range[0].timestamp.format('HH:mm:ssZ')} => ${data.range[1].timestamp.format('HH:mm:ssZ')}`);
        }
    } else {
        parts.push('Range Comparison N/A');
    }
    return parts.join(' | ');
}
export const comparePlayTemporally = (existingPlay: PlayObject, candidatePlay: PlayObject, options: {
    diffThreshold?: number,
    fuzzyDuration?: boolean,
    useListRanges?: boolean
} = {}): TemporalPlayComparison => {

    const result: TemporalPlayComparison = {
        match: TA_NONE
    };

    const {
        meta: {
            source,
        },
        data: {
            playDate: existingPlayDate,
            duration: existingDuration,
            listenRanges: existingRanges,
            listenedFor: existingListenedFor,
        }
    } = existingPlay;

    const {
        data: {
            playDate: newPlayDate,
            duration: newDuration,
            listenRanges: newRanges,
            listenedFor: newListenedFor,
        }
    } = candidatePlay;

    const {
        diffThreshold = lowGranularitySources.some(x => x.toLocaleLowerCase() === source) ? 60 : 10,
        fuzzyDuration = false,
        useListRanges = true,
    } = options;

    // cant compare!
    if (existingPlayDate === undefined || newPlayDate === undefined) {
        return result;
    }

    const referenceDuration = newDuration ?? existingDuration;
    const referenceListenedFor = newListenedFor ?? existingListenedFor;

    let playDiffThreshold = diffThreshold;

    // check if existing play time is same as new play date
    let scrobblePlayDiff = Math.abs(existingPlayDate.unix() - newPlayDate.unix());
    result.date = {
        threshold: diffThreshold,
        diff: scrobblePlayDiff
    };

    if(scrobblePlayDiff <= 1) {
        result.match = TA_EXACT;
    } else if (scrobblePlayDiff <= playDiffThreshold) {
        result.match = TA_CLOSE;
    }

    if (useListRanges && existingRanges !== undefined) {
        // since we know when the existing track was listened to
        // we can check if the new track play date took place while the existing one was being listened to
        // which would indicate (assuming same source) the new track is a duplicate
        for (const range of existingRanges) {
            if (newPlayDate.isBetween(range.start.timestamp, range.end.timestamp)) {
                result.range = range;
                if(!temporalAccuracyIsAtLeast(TA_CLOSE, result.match)) {
                    result.match = TA_CLOSE;
                }
                break;
            }
        }
        if (result.range === undefined) {
            result.range = false;
        }
    }

    // if the source has a duration its possible one play was scrobbled at the beginning of the track and the other at the end
    // so check if the duration matches the diff between the two play dates
    if (result.match === TA_NONE && referenceDuration !== undefined) {
        result.date.fuzzyDurationDiff = Math.abs(scrobblePlayDiff - referenceDuration);
        if (result.date.fuzzyDurationDiff < 10) { // TODO use finer comparison for this?
            result.match = TA_FUZZY;
        }
    }
    // if the source has listened duration (maloja) it may differ from actual track duration
    // and its possible (spotify) the candidate play date is set at the end of this duration
    // so check if there is a close match between candidate play date and source + listened for
    if (result.match === TA_NONE && referenceListenedFor !== undefined && fuzzyDuration) {
        result.date.fuzzyListenedDiff = Math.abs(scrobblePlayDiff - referenceListenedFor);
        if (result.date.fuzzyListenedDiff < 10) { // TODO use finer comparison for this?
            result.match = TA_FUZZY
        }
    }

    return result;
}
export const timePassesScrobbleThreshold = (thresholds: ScrobbleThresholds, secondsTracked: number, playDuration?: number): ScrobbleThresholdResult => {
    let durationPasses = undefined,
        durationThreshold: number | null = thresholds.duration ?? DEFAULT_SCROBBLE_DURATION_THRESHOLD,
        percentPasses = undefined,
        percentThreshold: number | null = thresholds.percent ?? DEFAULT_SCROBBLE_PERCENT_THRESHOLD,
        percent: number | undefined;

    if (percentThreshold !== null && playDuration !== undefined && playDuration !== 0) {
        percent = Math.round(((secondsTracked / playDuration) * 100));
        percentPasses = percent >= percentThreshold;
    }
    if (durationThreshold !== null || percentPasses === undefined) {
        durationPasses = secondsTracked >= durationThreshold;
    }

    return {
        passes: (durationPasses ?? false) || (percentPasses ?? false),
        duration: {
            passes: durationPasses,
            threshold: durationThreshold,
            value: secondsTracked
        },
        percent: {
            passes: percentPasses,
            value: percent,
            threshold: percentThreshold
        }
    }
}

export const temporalAccuracyIsAtLeast = (expected: TemporalAccuracy, found: TemporalAccuracy): boolean => {
    if(typeof expected === 'number') {
        if(typeof found === 'number') {
            return found <= expected;
        }
        return false;
    }
    return found === false;
}

export const temporalAccuracyToString = (acc: TemporalAccuracy): string => {
    switch(acc) {
        case 1:
            return 'exact';
        case 2:
            return 'close';
        case 3:
            return 'fuzzy';
        case false:
            return 'no correlation';
    }
}
