import * as z from "zod";
import type {Duration} from "dayjs/plugin/duration.js";
import {durationValueSchema} from "../Atomic.ts";

export const retentionPlayTypeSchema = z.enum(['failed', 'completed', 'duped']);

export type RetentionPlayType = z.infer<typeof retentionPlayTypeSchema>;

export const retentionPlayTypes: RetentionPlayType[] = ['failed','completed','duped'];

// `Duration` (from `dayjs/plugin/duration.js`) is a class instance with dozens of methods (`asSeconds`,
// `humanize`, `add`, `clone`, etc.), not a plain data shape - reconstructing its full interface as a zod
// object wouldn't provide any real validation value. This checks for a Duration-shaped object via one of its
// signature methods and relies on the imported type for full static typing.
const durationSchema = z.custom<Duration>(
    (val) => val !== null && typeof val === 'object' && typeof (val as Duration).asMilliseconds === 'function',
    {message: 'Expected a dayjs Duration instance'}
);

export const retentionValueUnparsedSchema = z.union([durationValueSchema, durationSchema, z.literal(false)]);

export type RetentionValueUnparsed = z.infer<typeof retentionValueUnparsedSchema>;

export const retentionValueSchema = z.union([durationSchema, z.literal(false)]);

export type RetentionValue = z.infer<typeof retentionValueSchema>;

// `RententionGranular<T>`, `RetentionConfigValue<T>`, and `RetentionOption<T>` are generic and are consumed
// elsewhere via generic type-argument syntax with several different concrete `T`s (e.g.
// `RetentionConfigValue<DurationValue>`, `RetentionOption<Duration>`, `RetentionOption<RetentionValue>` in
// Database.ts). Zod can't represent a generic object schema the way a TS interface can, and replacing these
// with a single concrete schema would break those call sites, so they're left as plain generic types.
export interface RententionGranular<T extends RetentionValueUnparsed> {
    failed?: T
    completed?: T
    duped?: T
}
export type RetentionConfigValue<T extends RetentionValueUnparsed> =  T | RententionGranular<T>;
export type RetentionOption<T extends RetentionValue> = Required<RententionGranular<T>>;

export const compactablePropertySchema = z.enum(['transform', 'input']);

export type CompactableProperty = z.infer<typeof compactablePropertySchema>;

export const COMPACTABLE = {
    transform: 'transform',
    input: 'input'
} as const satisfies Record<string, CompactableProperty>;

export const compactableProperties: CompactableProperty[] = [COMPACTABLE.transform, COMPACTABLE.input];

// `RetentionConfig<T>` is generic and is consumed elsewhere via generic type-argument syntax
// (`RetentionConfig<DurationValue>` in source/index.ts, aioConfig.ts, and client/index.ts). Left untouched
// for the same reason as `RententionGranular`/`RetentionConfigValue`/`RetentionOption` above.
export interface RetentionConfig<T extends RetentionValueUnparsed> {
    deleteAfter?: RetentionConfigValue<T>
    compactAfter?: RetentionConfigValue<T>
    compact?: CompactableProperty[]
}

// Concrete instantiations of the generic `RetentionOption<T>` (`Required<RententionGranular<T>>`), needed
// here since `RetentionOptions` itself is non-generic and always uses these exact two `T`s.
const retentionOptionDurationSchema = z.object({
    failed: durationSchema,
    completed: durationSchema,
    duped: durationSchema,
});
const retentionOptionRetentionValueSchema = z.object({
    failed: retentionValueSchema,
    completed: retentionValueSchema,
    duped: retentionValueSchema,
});

export const retentionOptionsSchema = z.object({
    deleteAfter: retentionOptionDurationSchema,
    compactAfter: retentionOptionRetentionValueSchema,
    compact: z.array(compactablePropertySchema),
});

export type RetentionOptions = z.infer<typeof retentionOptionsSchema>;

export const DEFAULT_RETENTION_DELETE_AFTER = 604800; // 7 days
export const DEFAULT_RETENTION_COMPACT_AFTER = 259200; // 3 days
