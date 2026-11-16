import dayjs, { type Dayjs } from "dayjs";
import isToday from 'dayjs/plugin/isToday.js';
import { SHORT_CALENDAR_NOTZ_FORMAT, SHORT_TODAY_NOTZ_FORMAT } from "./Atomic.ts";
import type { Duration, DurationUnitType } from "dayjs/plugin/duration.js";
import * as z from "zod";
import { type NamedGroup, parseRegex } from "@foxxmd/regex-buddy-core";
import { stringIsOnlyNumbers } from "./StringUtils.ts";
import { compareWithOperator, type ComparisonOperator, comparisonOperatorSchema } from "./DataUtils.ts";

dayjs.extend(isToday);

export const todayAwareFormat = (date: Dayjs, opts: { fullFormat?: string; todayFormat?: string; } = {}): string => {
    const {
        fullFormat, todayFormat = 'HH:mm:ssZ'
    } = opts;
    return date.format(date.isToday() ? todayFormat : fullFormat);
};

export const shortTodayAwareFormat = (date: Dayjs): string => {
    return todayAwareFormat(date, {fullFormat: SHORT_CALENDAR_NOTZ_FORMAT, todayFormat: SHORT_TODAY_NOTZ_FORMAT});
};
export const timeToHumanTimestamp = (val: ReturnType<typeof dayjs.duration> | Milliseconds): string => {
    const ms = dayjs.isDuration(val) ? Math.abs(val.asMilliseconds()) : val;

    // less than one hour
    if (ms < 3600000) {
        // EX 14:07
        return new Date(ms).toISOString().substring(14, 19);
    }
    // EX 01:15:45
    return new Date(ms).toISOString().substring(11, 19);
};export type Milliseconds = number;
export const durationToHuman = (dur: Duration): string => {
    const nTime = durationToNormalizedTime(dur);

    const parts: string[] = [];
    if (nTime.hours !== 0) {
        parts.push(`${nTime.hours}hr`);
    }
    parts.push(`${nTime.minutes}min`);
    parts.push(`${nTime.seconds}sec`);
    return parts.join(' ');
};
export const durationToNormalizedTime = (dur: Duration): { hours: number; minutes: number; seconds: number; } => {
    const totalSeconds = dur.asSeconds();

    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds - (hours * 3600)) / 60);
    const seconds = totalSeconds - (hours * 3600) - (minutes * 60);

    return {
        hours,
        minutes,
        seconds
    };
};

// string must only contain ISO8601 optionally wrapped by whitespace
const ISO8601_REGEX: RegExp = /^\s*((-?)P(?=\d|T\d)(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)([DW]))?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?)\s*$/;
// finds ISO8601 in any part of a string
const ISO8601_SUBSTRING_REGEX: RegExp = /((-?)P(?=\d|T\d)(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)([DW]))?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?)/g;
// longest units first so substring matching does not stop at a shorter prefix (ms before m, mins before m...)
const DURATION_UNITS = 'milliseconds?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|months?|years?|y';
// short units mapped to units dayjs accepts. Lowercase m is minutes, months must be written out
const DURATION_SHORT_UNITS: Record<string, string> = {
    ms: 'milliseconds',
    s: 'seconds', sec: 'seconds', secs: 'seconds',
    m: 'minutes', min: 'minutes', mins: 'minutes',
    h: 'hours', hr: 'hours', hrs: 'hours',
    d: 'days',
    w: 'weeks',
    y: 'years',
};
// string must only duration optionally wrapped by whitespace
const DURATION_REGEX: RegExp = new RegExp(`^\\s*(?<time>\\d+)\\s*(?<unit>${DURATION_UNITS})\\s*$`);
// finds duration in any part of the string
const DURATION_SUBSTRING_REGEX: RegExp = new RegExp(`(?<time>\\d+)\\s*(?<unit>${DURATION_UNITS})\\b`, 'g');

export const parseDurationFromString = (val: string, strict = true): {duration: Duration, original: string}[] => {
    let matches = parseRegex(strict ? DURATION_REGEX : DURATION_SUBSTRING_REGEX, val);
    if (matches !== undefined) {
        return matches.map(x => {
            const groups = x.named as NamedGroup;
            const dur: Duration = dayjs.duration(Number.parseInt(groups.time), (DURATION_SHORT_UNITS[groups.unit] ?? groups.unit) as DurationUnitType);
            if (!dayjs.isDuration(dur)) {
                throw new Error(`Parsed value '${x.match}' did not result in a valid Dayjs Duration`);
            }
            return {duration: dur, original: `${groups.time} ${groups.unit}`};
        });
    }

    matches = parseRegex(strict ? ISO8601_REGEX : ISO8601_SUBSTRING_REGEX, val);
    if (matches !== undefined) {
        return matches.map(x => {
            const dur: Duration = dayjs.duration(x.groups[0]);
            if (!dayjs.isDuration(dur)) {
                throw new Error(`Parsed value '${x.groups[0]}' did not result in a valid Dayjs Duration`);
            }
            return {duration: dur, original: x.groups[0]};
        });
    }

    throw new Error(`Value '${val}' did not match any duration format: ${(strict ? DURATION_REGEX : DURATION_SUBSTRING_REGEX)} or ${(strict ? ISO8601_REGEX : ISO8601_SUBSTRING_REGEX)}`);
}

export const parseDuration = (val: string, strict = true): Duration => {
    const res = parseDurationFromString(val, strict);
    if(res.length > 1) {
        throw new Error(`Must only have one Duration value, found ${res.length} in: ${val}`);
    }
    return res[0].duration;
}

export const parseDurationFromDurationValue = (val: number | string): Duration => {
    if(typeof val === 'number') {
        return dayjs.duration(val, 'seconds');
    }
    if(stringIsOnlyNumbers(val) && !isNaN(Number.parseInt(val))) {
        return dayjs.duration(Number.parseInt(val), 'seconds');
    }

    return parseDuration(val, true);
}

export interface DurationComparison {
    operator: ComparisonOperator
    duration: Duration
}

// operator followed by a duration value, validated by parseDurationFromDurationValue
const DURATION_COMPARISON_REGEX: RegExp = new RegExp(`^\\s*(?<operator>${comparisonOperatorSchema.options.map((x) => RegExp.escape(x)).join('|')})\\s*(?<duration>\\S.*?)\\s*$`);

/**
 * Parse a comparison operator and duration from a string like `> 7 s`, `= 2 minutes`, `< 37s`
 *
 * The duration may be anything parseDurationFromDurationValue accepts (bare number of seconds, `[number] [unit]`, ISO8601)
 * */
export const parseDurationComparison = (val: string): DurationComparison => {
    const match = DURATION_COMPARISON_REGEX.exec(val);
    if (match === null) {
        throw new Error(`Duration comparison must be an operator (${comparisonOperatorSchema.options.join(' ')}) followed by a duration, got: ${val}`);
    }
    const { operator, duration } = match.groups as { operator: ComparisonOperator, duration: string };
    return { operator, duration: parseDurationFromDurationValue(duration) };
}

export const durationComparisonSchema = z.string().transform((val, ctx): DurationComparison => {
    try {
        return parseDurationComparison(val);
    } catch (e) {
        ctx.addIssue({ code: 'custom', message: e instanceof Error ? e.message : String(e), input: val });
        return z.NEVER;
    }
}).meta({ title: 'Duration Comparison', description: 'Operator (= > <) and duration. EX: > 7 s', examples: ['> 7 s', '= 2 minutes', '< 37s'] });

// TODO may want to round to nearest second?
/** Compare actualVal to testVal IE `actualVal > testVal`. Durations are compared in milliseconds */
export const compareDuration = (actualVal: Duration, operator: ComparisonOperator, testVal: Duration): boolean => 
    compareWithOperator(actualVal.asMilliseconds(), operator, testVal.asMilliseconds());
