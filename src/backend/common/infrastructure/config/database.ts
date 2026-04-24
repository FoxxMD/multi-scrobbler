import { Duration } from "dayjs/plugin/duration.js";
import { DurationValue } from "../Atomic.js";

export interface RententionGranular<T extends (DurationValue | Duration)> {
    failed?: T
    completed?: T
    duped?: T
}

export interface RetentionOptions<T extends (DurationValue | Duration)> {
    deleteAfter?: T | RententionGranular<T>
}

export interface RetentionOptionsFull {
    deleteAfter: RententionGranular<Duration>
}

export const DEFAULT_RETENTION_DELETE_AFTER = 604800; // 7 days