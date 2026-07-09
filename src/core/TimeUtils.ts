import dayjs, { type Dayjs } from "dayjs";
import isToday from 'dayjs/plugin/isToday.js';
import { SHORT_CALENDAR_NOTZ_FORMAT, SHORT_TODAY_NOTZ_FORMAT } from "./Atomic.ts";
import type { Duration } from "dayjs/plugin/duration.js";

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

