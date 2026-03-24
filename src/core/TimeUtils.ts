import dayjs, { Dayjs } from "dayjs";
import isToday from 'dayjs/plugin/isToday.js';
import { SHORT_CALENDAR_NOTZ_FORMAT, SHORT_TODAY_NOTZ_FORMAT } from "./Atomic.js";
import { Milliseconds } from "../backend/utils/TimeUtils.js";

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
};
