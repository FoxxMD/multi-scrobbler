
import dayjs, { Dayjs } from "dayjs";
import isToday from 'dayjs/plugin/isToday.js';
import {
    AcceptableTemporalDuringReference,
    PlayObject,
    SCROBBLE_TS_SOC_END,
    SCROBBLE_TS_SOC_START,
    ScrobbleTsSOC,
    TA_CLOSE,
    TA_DEFAULT_ACCURACY,
    TA_DURING,
    TA_EXACT,
    TA_FUZZY,
    TA_NONE,
    TemporalAccuracy,
    TemporalPlayComparison,
} from "../../core/Atomic.js";
import { capitalize } from "../../core/StringUtils.js";
import {
    DEFAULT_CLOSE_POSITION_ABSOLUTE,
    DEFAULT_CLOSE_POSITION_PERCENT,
    DEFAULT_DURATION_REPEAT_ABSOLUTE,
    DEFAULT_DURATION_REPEAT_PERCENT,
    DEFAULT_SCROBBLE_DURATION_THRESHOLD,
    DEFAULT_SCROBBLE_PERCENT_THRESHOLD,
    lowGranularitySources,
    ScrobbleThresholdResult,
} from "../common/infrastructure/Atomic.js";
import { ScrobbleThresholds } from "../common/infrastructure/config/source/index.js";
import { formatNumber } from "../utils.js";

dayjs.extend(isToday);

export const temporalPlayComparisonSummary = (data: TemporalPlayComparison, existingPlay?: PlayObject, candidatePlay?: PlayObject) => {
    const parts: string[] = [];
    if (existingPlay !== undefined && candidatePlay !== undefined) {
        const existingDate = existingPlay.data.playDate;
        const candidateDate = candidatePlay.data.playDate;

        // Check if dates are valid before comparing/formatting
        if (!existingDate?.isValid() || !candidateDate?.isValid()) {
            parts.push(`Existing: ${existingDate?.isValid() ? existingDate.toISOString() : 'Invalid Date'} - Candidate: ${candidateDate?.isValid() ? candidateDate.toISOString() : 'Invalid Date'}`);
        } else if (existingDate.isSame(candidateDate, 'day')) {
            parts.push(`Existing: ${existingDate.format('HH:mm:ssZ')} - Candidate: ${candidateDate.format('HH:mm:ssZ')}`);
        } else {
            parts.push(`Existing: ${existingDate.toISOString()} - Candidate: ${candidateDate.toISOString()}`);
        }
    }
    parts.push(`Temporal Sameness: ${capitalize(temporalAccuracyToString(data.match))}`);
    if (data.date !== undefined) {
        parts.push(`Play Diff: ${formatNumber(data.date.diff, {toFixed: 0})}s (Needed <${data.date.threshold}s)`)
    }
    if (data.date.fuzzyDurationDiff !== undefined) {
        parts.push(`Fuzzy Duration Diff: ${formatNumber(data.date.fuzzyDurationDiff, {toFixed: 0})}s (Needed <= ${data.date.fuzzyDiffThreshold}s)`);
    }
    if (data.date.fuzzyListenedDiff !== undefined) {
        parts.push(`Fuzzy Listened Diff: ${formatNumber(data.date.fuzzyDurationDiff, {toFixed: 0})}s (Needed <= ${data.date.fuzzyDiffThreshold}s)`);
    }

    if(data.range === undefined) {
        parts.push('Range Comparison N/A');
    } else if(data.range.type === 'none') {
        parts.push(`Candidate not played during Existing ${data.duringReferences.join(' or ')}`);
    } else {
        parts.push(`Candidate played during tracked listening range from Existing "${data.range.type}" ${data.range.timestamps[0].format('HH:mm:ssZ')} => ${data.range.timestamps[1].format('HH:mm:ssZ')}`);
    }
    return parts.join(' | ');
}

export interface TemporalPlayComparisonOptions {
    diffThreshold?: number,
    fuzzyDuration?: boolean,
    fuzzyDiffThreshold?: number
    duringReferences?: AcceptableTemporalDuringReference
}

export const comparePlayTemporally = (existingPlay: PlayObject, candidatePlay: PlayObject, options: TemporalPlayComparisonOptions = {}): TemporalPlayComparison => {


    const {
        meta: {
            source,
            //scrobbleTsSOC: existingScrobbleTsSOC = SCROBBLE_TS_SOC_START,
        },
        data: {
            // playDate: existingPlayDate,
            // playDateCompleted: existingPlayDateCompleted,
            duration: existingDuration,
            listenRanges: existingRanges,
            listenedFor: existingListenedFor,
        }
    } = existingPlay;

    const [existingTsSOCDate, existingTsSOC] = getScrobbleTsSOCDateWithContext(existingPlay);

    const {
        // meta: {
        //   scrobbleTsSOC: candidateScrobbleTsSOC = SCROBBLE_TS_SOC_START,
        // },
        data: {
            // playDate: newPlayDate,
            // playDateCompleted: candidatePlayDateCompleted,
            duration: newDuration,
            listenRanges: newRanges,
            listenedFor: newListenedFor,
        }
    } = candidatePlay;

    const [candidateTsSOCDate, candidateTsSOC] = getScrobbleTsSOCDateWithContext(candidatePlay);

    const {
        diffThreshold = lowGranularitySources.some(x => x.toLocaleLowerCase() === source) ? 60 : 10,
        fuzzyDuration = false,
        fuzzyDiffThreshold = 10,
        duringReferences = ['range']
    } = options;

    const result: TemporalPlayComparison = {
        match: TA_NONE,
        duringReferences
    };

    // cant compare!
    if (existingTsSOCDate === undefined || candidateTsSOCDate === undefined) {
        return result;
    }

    const referenceDuration = newDuration ?? existingDuration;
    const referenceListenedFor = newListenedFor ?? existingListenedFor;

    const playDiffThreshold = diffThreshold;

    // check if existing play time is same as new play date
    const scrobblePlayDiff = Math.abs(existingTsSOCDate.unix() - candidateTsSOCDate.unix());
    result.date = {
        threshold: diffThreshold,
        diff: scrobblePlayDiff,
        fuzzyDiffThreshold
    };

    if(scrobblePlayDiff <= 1) {
        result.match = TA_EXACT;
    } else if (scrobblePlayDiff <= playDiffThreshold) {
        result.match = TA_CLOSE;
    }

    if(result.match !== TA_NONE) {
        return result;
    }

    if(duringReferences.length > 0) {

        if (duringReferences.includes('range') && existingRanges !== undefined) {
            // since we know when the existing track was listened to
            // we can check if the new track play date took place while the existing one was being listened to
            // which would indicate (assuming same source) the new track is a duplicate
            for (const range of existingRanges) {
                if (candidateTsSOCDate.isBetween(range.start.timestamp, range.end.timestamp)) {
                    result.range = {
                        type: 'range',
                        timestamps: [range.start.timestamp, range.end.timestamp]
                    }
                    result.match = TA_DURING;
                    return result;
                }
            }
        }

        if(duringReferences.includes('listenedFor') && existingPlay.data.listenedFor !== undefined) {
            if (candidateTsSOCDate.isBetween(existingTsSOCDate, existingTsSOCDate.add(existingPlay.data.listenedFor, 's'))) {
                result.match = TA_DURING;
                result.range = {
                        type: 'listenedFor',
                        timestamps: [existingTsSOCDate, existingTsSOCDate.add(existingPlay.data.listenedFor, 's')]
                }
                return result;
            }
        }

        if(duringReferences.includes('duration') && existingPlay.data.duration !== undefined) {
            if (candidateTsSOCDate.isBetween(existingTsSOCDate, existingTsSOCDate.add(existingPlay.data.duration, 's'))) {
                result.match = TA_DURING;
                result.range = {
                        type: 'duration',
                        timestamps: [existingTsSOCDate, existingTsSOCDate.add(existingPlay.data.duration, 's')]
                }
                return result;
            }
        }

    }

    // if the source has a duration its possible one play was scrobbled at the beginning of the track and the other at the end
    // so check if the duration matches the diff between the two play dates
    if (result.match === TA_NONE && referenceDuration !== undefined) {
        result.date.fuzzyDurationDiff = Math.abs(scrobblePlayDiff - referenceDuration);
        if (result.date.fuzzyDurationDiff <= fuzzyDiffThreshold) { // TODO use finer comparison for this?
            result.match = TA_FUZZY;
        }
    }
    // if the source has listened duration (maloja) it may differ from actual track duration
    // and its possible (spotify) the candidate play date is set at the end of this duration
    // so check if there is a close match between candidate play date and source + listened for
    if (result.match === TA_NONE && referenceListenedFor !== undefined && fuzzyDuration) {
        result.date.fuzzyListenedDiff = Math.abs(scrobblePlayDiff - referenceListenedFor);
        if (result.date.fuzzyListenedDiff <= fuzzyDiffThreshold) { // TODO use finer comparison for this?
            result.match = TA_FUZZY
        }
    }

    return result;
}
export const timePassesScrobbleThreshold = (thresholds: ScrobbleThresholds, secondsTracked: number, playDuration?: number): ScrobbleThresholdResult => {
    let durationPasses = undefined,
        percentPasses = undefined,
        percent: number | undefined;

    const durationThreshold: number | null = thresholds.duration ?? DEFAULT_SCROBBLE_DURATION_THRESHOLD,
        percentThreshold: number | null = thresholds.percent ?? DEFAULT_SCROBBLE_PERCENT_THRESHOLD;


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

export const hasAcceptableTemporalAccuracy = (found: TemporalAccuracy, expected: TemporalAccuracy[] = TA_DEFAULT_ACCURACY): boolean => expected.includes(found);

export const temporalAccuracyToString = (acc: TemporalAccuracy): string => {
    switch(acc) {
        case 1:
            return 'exact';
        case 2:
            return 'close';
        case 3:
            return 'fuzzy';
        case 4:
            return 'during';
        case 99:
            return 'no correlation';
    }
}

export const getScrobbleTsSOCDateWithContext = (data: PlayObject): [Dayjs, ScrobbleTsSOC] => {
    const {
        meta: {
            scrobbleTsSOC = SCROBBLE_TS_SOC_START,
        },
        data: {
            playDate = dayjs(),
            playDateCompleted
        }
    } = data;

    if(scrobbleTsSOC === SCROBBLE_TS_SOC_END && playDateCompleted !== undefined) {
        return [playDateCompleted, SCROBBLE_TS_SOC_END];
    }
    return [playDate, SCROBBLE_TS_SOC_START];
}

export const getScrobbleTsSOCDate = (data: PlayObject): Dayjs => {
    const [date, _] = getScrobbleTsSOCDateWithContext(data);
    return date;
}

export const todayAwareFormat = (date: Dayjs, opts: {fullFormat?: string, todayFormat?: string} = {}): string => {
    const {
        fullFormat,
        todayFormat = 'HH:mm:ssZ'
    } = opts;
    return date.format(date.isToday() ? todayFormat : fullFormat);
};
export const parseDurationFromTimestamp = (timestamp: any) => {
    if (timestamp === null || timestamp === undefined) {
        return undefined;
    }
    if (!(typeof timestamp === 'string')) {
        throw new Error('Timestamp must be a string');
    }
    if (timestamp.trim() === '') {
        return undefined;
    }
    const parsedRuntime = timestamp.split(':');
    let hours = '0', minutes = '0', seconds = '0', milli = '0';

    switch (parsedRuntime.length) {
        case 3:
            hours = parsedRuntime[0];
            minutes = parsedRuntime[1];
            seconds = parsedRuntime[2];
            break;
        case 2:
            minutes = parsedRuntime[0];
            seconds = parsedRuntime[1];
            break;
        case 1:
            seconds = parsedRuntime[0];
    }
    const splitSec = seconds.split('.');
    if (splitSec.length > 1) {
        seconds = splitSec[0];
        milli = splitSec[1];
    }
    return dayjs.duration({
        hours: Number.parseInt(hours),
        minutes: Number.parseInt(minutes),
        seconds: Number.parseInt(seconds),
        milliseconds: Number.parseInt(milli)
    });
};

export type Milliseconds = number;

export const timeToHumanTimestamp = (val: ReturnType<typeof dayjs.duration> | Milliseconds): string => {
    const ms = dayjs.isDuration(val) ? Math.abs(val.asMilliseconds()) : val;

    // less than one hour
    if(ms < 3600000) {
        // EX 14:07
        return new Date(ms).toISOString().substring(14, 19)
    }
    // EX 01:15:45
    return new Date(ms).toISOString().substring(11, 19);
}

/** Is Position earlier than X seconds or Y% percent of the start of a Play? */
export const closeToPlayStart = (play: PlayObject, position: number, thresholds: {absolute?: number, percent?: number, hintPrefix?: boolean} = {}): [boolean, string] => {
    const {
        absolute = DEFAULT_CLOSE_POSITION_ABSOLUTE,
        percent = DEFAULT_CLOSE_POSITION_PERCENT,
        hintPrefix = true
    } = thresholds;

        let hintStart = hintPrefix ? `Position (${position}) ` : '';
        const trackDur = play.data.duration;
        const closeStartNum = position <= absolute;
        const hints: string[] = [];
        hints.push(`${closeStartNum ? 'is' : 'is not'} within ${absolute}s of track start`);

        let closeStartPer = false;
        if(trackDur !== undefined) {
            const positionPercent = (position / trackDur);
            closeStartPer = (positionPercent <= percent);
            if(!closeStartNum) {
                hints.push(`${closeStartPer ? 'is' : 'is not'} within ${formatNumber(percent * 100, {toFixed: 0})}% of track start (${formatNumber(positionPercent*100)}%)`);
            }
        }

        return [closeStartNum || closeStartPer, `${hintStart}${hints.join(' and ')}`];
}

/** Is Position closer than X seconds or Y% percent of the end of a Play? */
export const closeToPlayEnd = (play: PlayObject, position: number, thresholds: {absolute?: number, percent?: number, hintPrefix?: boolean} = {}): [boolean, string] => {
    const {
        absolute = DEFAULT_CLOSE_POSITION_ABSOLUTE,
        percent = DEFAULT_CLOSE_POSITION_PERCENT,
        hintPrefix = true
    } = thresholds;

        let hintStart = hintPrefix ? `Position (${position}) ` : '';
        const trackDur = play.data.duration;

        if(trackDur === undefined) {
            return [false, `Cannot determine how close Position ${position} is to end of track because no duration data is available.`];
        }

        const nearEndNum = trackDur - position <= absolute;
        const hints: string[] = [];
        hints.push(`${nearEndNum ? 'is' : 'is not'} within ${absolute}s of track end`);
        const positionPercent = 1 - (position / trackDur);
        const nearEndPer = (positionPercent < percent);
        if(!nearEndNum) {
            hints.push(`${nearEndPer ? 'is' : 'is not'} within ${formatNumber(percent * 100, {toFixed: 0})}% of track end (${formatNumber(positionPercent*100)}%)`);
        }
        return [nearEndNum || nearEndPer, `${hintStart}${hints.join(' and ')}`];
}

/** Has more than X seconds or Y% percent of Play duration been played? */
export const repeatDurationPlayed = (play: PlayObject, duration: number, thresholds: {absolute?: number, percent?: number, hintPrefix?: boolean} = {}): [boolean, string] => {
    const {
        absolute =  DEFAULT_DURATION_REPEAT_ABSOLUTE,
        percent = DEFAULT_DURATION_REPEAT_PERCENT,
        hintPrefix = true
    } = thresholds;

        let hintStart = hintPrefix ? `Duration listened (${duration}s) ` : '';
        const trackDur = play.data.duration;
        const absPlayed = duration >= absolute;
        const hints: string[] = [];
        hints.push(`${absPlayed ? 'is' : 'is not'} more than ${absolute}s`);

        let majorityDurationPercent = false;
        if(trackDur !== undefined) {
            const durationPercent = (duration / trackDur);
            majorityDurationPercent = (durationPercent >= percent);
            if(!absPlayed) {
                hints.push(`${majorityDurationPercent ? 'is' : 'is not'} more than ${formatNumber(percent * 100, {toFixed: 0})}% of track duration (${formatNumber(durationPercent*100)}%)`);
            }
        }

        return [absPlayed || majorityDurationPercent, `${hintStart}${hints.join(' and ')}`];
}