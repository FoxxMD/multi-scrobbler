import type {TrackStringOptions} from "../../core/Atomic";
import React, {type ReactElement, Fragment} from "react";
import {defaultBuildTrackStringTransformers} from "../../core/StringUtils";
import dayjs from 'dayjs';
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

export const DAYJS_TIMEZ_FORMAT = 'HH:mm:ssZ';
export const DAYJS_TIME_FORMAT = 'HH:mm:ss';

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
const toDateFormatPref = (val: unknown): DateFormatPref => DATE_FORMATS.includes(val as typeof DATE_FORMATS[number]) ? val as DateFormatPref : null;

export const useDateFormat = (): [DateFormatPref, (pref: DateFormatPref) => void] => {
    const [pref, setPref] = useLocalStorage<DateFormatPref>(DATE_FORMAT_KEY, null);
    return [toDateFormatPref(pref), setPref];
}

/** Non-hook read of the Date Format preference. Does not re-render on change, use useDateFormat in components when possible */
export const getDateFormatPref = (): DateFormatPref => {
    try {
        return toDateFormatPref(JSON.parse(localStorage.getItem(DATE_FORMAT_KEY) ?? 'null'));
    } catch {
        return null;
    }
}

export const isoToHuman = (iso?: string | null, opts?: DateFormatOptions) => {
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
    parts.push(date.format(DAYJS_TIME_FORMAT));

    if(includeRelative) {
        parts.push(`(${date.fromNow()})`);
    }

    return parts.join(' ');
}

export const baseUrl = 'api/';