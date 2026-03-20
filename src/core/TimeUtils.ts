import dayjs, { Dayjs } from "dayjs";
import isToday from 'dayjs/plugin/isToday.js';
import { SHORT_CALENDAR_NOTZ_FORMAT, SHORT_TODAY_NOTZ_FORMAT } from "./Atomic.js";

dayjs.extend(isToday);

export const todayAwareFormat = (date: Dayjs, opts: { fullFormat?: string; todayFormat?: string; } = {}): string => {
    const {
        fullFormat, todayFormat = 'HH:mm:ssZ'
    } = opts;
    return date.format(date.isToday() ? todayFormat : fullFormat);
};

export const shortTodayAwareFormat = (date: Dayjs): string => {
    return todayAwareFormat(date, {fullFormat: SHORT_CALENDAR_NOTZ_FORMAT, todayFormat: SHORT_TODAY_NOTZ_FORMAT});
}