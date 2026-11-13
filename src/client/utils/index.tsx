import type {TrackStringOptions} from "../../core/Atomic";
import React, {type ReactElement, Fragment} from "react";
import {defaultBuildTrackStringTransformers} from "../../core/StringUtils";
import dayjs, {type Dayjs} from 'dayjs';
import {useLocalStorage} from 'usehooks-ts';
import {browserLocale} from "../components/Country";

export const buildTrackStringReactOptions: TrackStringOptions<ReactElement> = {
    transformers: {
        ...defaultBuildTrackStringTransformers,
        reducer: arr => {
            const allFrags = arr.map((x, index) => {
                if (typeof x === 'string') {
                    return <Fragment key={index}>{x}</Fragment>;
                } else {
                    return x;
                }
            });
            const spacedFrags = allFrags.reduce((acc, curr, index) => {
                return acc.concat([curr, <Fragment key={`${index} space`}> </Fragment>]);
            }, [] as (ReactElement | undefined)[]);
            return <Fragment>{spacedFrags}</Fragment>
        }
    }
}

const LOG_LINE_REGEX = new RegExp(/\[(?<timestamp>.+)]\s+(?<level>\w+)\s*:\s*(?<message>(?:.|\n)*)/m, 'm');
export const parseLogLine = (line: string) => {
    const match = line.match(LOG_LINE_REGEX);
    if (match === null) {
        return undefined;
    }
    return {
        timestamp: match[1],
        level: match[2],
        message: match[3]
    }
}

export interface DateFormatOptions {
    includeRelative?: boolean
    includeDate?: boolean
}


export const DATE_FORMATS = ['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD'] as const;
/** null = use browser locale */
export type DateFormatPref = typeof DATE_FORMATS[number] | null;

export interface NumericDate {
    year: number
    month: number
    day: number
}

const pad = (n: number) => n.toString().padStart(2, '0');

/** Format an all-number date using the user's Date Format preference */
export const formatNumericDate = (pref: DateFormatPref, {year, month, day}: NumericDate): string => {
    switch (pref) {
        case 'MM/DD/YYYY':
            return `${pad(month)}/${pad(day)}/${year}`;
        case 'DD/MM/YYYY':
            return `${pad(day)}/${pad(month)}/${year}`;
        case 'YYYY-MM-DD':
            return `${year}-${pad(month)}-${pad(day)}`;
        default:
            return new Intl.DateTimeFormat(browserLocale, {day: '2-digit', month: '2-digit', year: 'numeric'}).format(new Date(year, month - 1, day));
    }
}

/** Parse user-typed date in the order of the given format. Accepts any of / - . or space as separators and optional leading zeros */
export const parseNumericDate = (pref: Exclude<DateFormatPref, null>, value: string): NumericDate | undefined => {
    const nums = value.trim().split(/[\s/.-]+/).map(x => /^\d+$/.test(x) ? Number.parseInt(x, 10) : NaN);
    if (nums.length !== 3 || nums.some(Number.isNaN)) {
        return undefined;
    }
    const [a, b, c] = nums;
    const date: NumericDate = pref === 'MM/DD/YYYY' ? {month: a, day: b, year: c}
        : pref === 'DD/MM/YYYY' ? {day: a, month: b, year: c}
        : {year: a, month: b, day: c};
    if (date.year < 1000 || date.year > 9999) {
        return undefined;
    }
    // reject overflow like 02/31 instead of letting Date roll it into March
    const check = new Date(date.year, date.month - 1, date.day);
    if (check.getMonth() !== date.month - 1 || check.getDate() !== date.day) {
        return undefined;
    }
    return date;
}

const DATE_FORMAT_KEY = 'pref-date-format';
const TIME_FORMAT_KEY = 'pref-time-format';

/** Returns val if it is one of allowed, otherwise null (browser default) */
const toPref = <T extends string>(allowed: readonly T[], val: unknown): T | null => allowed.includes(val as T) ? val as T : null;

/** Non-hook read of a preference (stored as JSON by usehooks-ts). Does not re-render on change, use the hook version in components when possible */
const readPref = <T extends string>(key: string, allowed: readonly T[]): T | null => {
    try {
        return toPref(allowed, JSON.parse(localStorage.getItem(key) ?? 'null'));
    } catch {
        return null;
    }
}

export const useDateFormat = (): [DateFormatPref, (pref: DateFormatPref) => void] => {
    const [pref, setPref] = useLocalStorage<DateFormatPref>(DATE_FORMAT_KEY, null);
    return [toPref(DATE_FORMATS, pref), setPref];
}
export const getDateFormatPref = (): DateFormatPref => readPref(DATE_FORMAT_KEY, DATE_FORMATS);

export const TIME_FORMATS = ['12h', '24h'] as const;
/** null = use browser locale */
export type TimeFormatPref = typeof TIME_FORMATS[number] | null;

const browserUses12h = ['h11', 'h12'].includes(new Intl.DateTimeFormat(browserLocale, {hour: 'numeric'}).resolvedOptions().hourCycle ?? '');

export const useTimeFormat = (): [TimeFormatPref, (pref: TimeFormatPref) => void] => {
    const [pref, setPref] = useLocalStorage<TimeFormatPref>(TIME_FORMAT_KEY, null);
    return [toPref(TIME_FORMATS, pref), setPref];
}
export const getTimeFormatPref = (): TimeFormatPref => readPref(TIME_FORMAT_KEY, TIME_FORMATS);

/** dayjs format tokens for time-of-day using the Time Format preference */
export const dayjsTimeFormat = (pref: TimeFormatPref = getTimeFormatPref()): string => (pref === null ? browserUses12h : pref === '12h') ? 'h:mm:ss A' : 'HH:mm:ss';

/** Client version of core shortTodayAwareFormat that respects Time Format preference. EX today: 2:05:00 PM, otherwise: Nov 13 2:05:00 PM */
export const shortTodayAwareFormat = (date: Dayjs): string => {
    const time = dayjsTimeFormat();
    return date.format(dayjs().isSame(date, 'day') ? time : `MMM D ${time}`);
}

export const isoToHuman = (iso?: string | Date | null, opts?: DateFormatOptions) => {
    const {
        includeRelative = false,
        includeDate
    } = opts ?? {};

    if(iso === undefined || iso === null) {
        return 'N/A';
    }

    const parts = [];

    const date = dayjs(iso);
    // by default only show date when not today
    const useDate = includeDate ?? !dayjs().isSame(date, 'day');
    if(useDate) {
        parts.push(formatNumericDate(getDateFormatPref(), {year: date.year(), month: date.month() + 1, day: date.date()}));
    }
    parts.push(date.format(dayjsTimeFormat()));

    if(includeRelative) {
        parts.push(`(${date.fromNow()})`);
    }

    return parts.join(' ');
}

export const baseUrl = 'api/';