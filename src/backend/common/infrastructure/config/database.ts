import { Duration } from "dayjs/plugin/duration.js";
import { DurationValue } from "../Atomic.js";

export type RetentionValueUnparsed = DurationValue | Duration | false;
export type RetentionValue = Duration | false;
export interface RententionGranular<T extends RetentionValueUnparsed> {
    failed?: T
    completed?: T
    duped?: T
}

export type RetentionConfigValue<T extends RetentionValueUnparsed> =  T | RententionGranular<T>;
export type RetentionOption<T extends RetentionValue> = Required<RententionGranular<T>>;

export type CompactableProperty = 'transform' | 'input';
export const COMPACTABLE = {
    transform: 'transform',
    input: 'input'
} as const satisfies Record<string, CompactableProperty>;
export const compactableProperties: CompactableProperty[] = [COMPACTABLE.transform, COMPACTABLE.input];
export interface RetentionConfig<T extends RetentionValueUnparsed> {
    deleteAfter?: RetentionConfigValue<T>
    compactAfter?: RetentionConfigValue<T>
    compact?: CompactableProperty[]
}

export interface RetentionOptions {
    deleteAfter: RetentionOption<Duration>
    compactAfter: RetentionOption<RetentionValue>
    compact: CompactableProperty[]
}

export const DEFAULT_RETENTION_DELETE_AFTER = 604800; // 7 days