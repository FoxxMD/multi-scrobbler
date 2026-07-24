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

// `RententionGranular<T>`, `RetentionConfigValue<T>`, `RetentionOption<T>`, and `RetentionConfig<T>` were
// previously left as plain generics since zod can't represent a generic object schema the way a TS interface
// can. In practice though each is only ever instantiated with one of three known terms - `DurationValue`,
// `Duration`, and `RetentionValue` - so below builds one concrete schema per term actually valid for each
// family (per each type's original generic constraint) and unifies them with `z.union` into a single
// non-generic replacement. Call sites elsewhere now use the specific per-term type where the term is
// statically known.

export const rententionGranularDurationValueSchema = z.object({
    failed: durationValueSchema.optional(),
    completed: durationValueSchema.optional(),
    duped: durationValueSchema.optional(),
});
export type RententionGranularDurationValue = z.infer<typeof rententionGranularDurationValueSchema>;

export const rententionGranularDurationSchema = z.object({
    failed: durationSchema.optional(),
    completed: durationSchema.optional(),
    duped: durationSchema.optional(),
});
export type RententionGranularDuration = z.infer<typeof rententionGranularDurationSchema>;

export const rententionGranularRetentionValueSchema = z.object({
    failed: retentionValueSchema.optional(),
    completed: retentionValueSchema.optional(),
    duped: retentionValueSchema.optional(),
});
export type RententionGranularRetentionValue = z.infer<typeof rententionGranularRetentionValueSchema>;

export const rententionGranularSchema = z.union([
    rententionGranularDurationValueSchema,
    rententionGranularDurationSchema,
    rententionGranularRetentionValueSchema,
]);
export type RententionGranular = z.infer<typeof rententionGranularSchema>;

export const retentionConfigValueDurationValueSchema = z.union([durationValueSchema, rententionGranularDurationValueSchema]);
export type RetentionConfigValueDurationValue = z.infer<typeof retentionConfigValueDurationValueSchema>;

export const retentionConfigValueDurationSchema = z.union([durationSchema, rententionGranularDurationSchema]);
export type RetentionConfigValueDuration = z.infer<typeof retentionConfigValueDurationSchema>;

export const retentionConfigValueRetentionValueSchema = z.union([retentionValueSchema, rententionGranularRetentionValueSchema]);
export type RetentionConfigValueRetentionValue = z.infer<typeof retentionConfigValueRetentionValueSchema>;

export const retentionConfigValueSchema = z.union([
    retentionConfigValueDurationValueSchema,
    retentionConfigValueDurationSchema,
    retentionConfigValueRetentionValueSchema,
]);
export type RetentionConfigValue = z.infer<typeof retentionConfigValueSchema>;

export const compactablePropertySchema = z.enum(['transform', 'input']);

export type CompactableProperty = z.infer<typeof compactablePropertySchema>;

export const COMPACTABLE = {
    transform: 'transform',
    input: 'input'
} as const satisfies Record<string, CompactableProperty>;

export const compactableProperties: CompactableProperty[] = [COMPACTABLE.transform, COMPACTABLE.input];

// `RetentionOption<T>`'s original constraint (`T extends RetentionValue`) only ever admits `Duration` and
// `RetentionValue` itself - not `DurationValue` - so there are only two valid terms here.
export const retentionOptionDurationSchema = z.object({
    failed: durationSchema,
    completed: durationSchema,
    duped: durationSchema,
});
export type RetentionOptionDuration = z.infer<typeof retentionOptionDurationSchema>;

export const retentionOptionRetentionValueSchema = z.object({
    failed: retentionValueSchema,
    completed: retentionValueSchema,
    duped: retentionValueSchema,
});
export type RetentionOptionRetentionValue = z.infer<typeof retentionOptionRetentionValueSchema>;

export const retentionOptionSchema = z.union([retentionOptionDurationSchema, retentionOptionRetentionValueSchema]);
export type RetentionOption = z.infer<typeof retentionOptionSchema>;

export const retentionConfigDurationValueSchema = z.object({
    deleteAfter: retentionConfigValueDurationValueSchema.optional(),
    compactAfter: retentionConfigValueDurationValueSchema.optional(),
    compact: z.array(compactablePropertySchema).optional(),
});
export type RetentionConfigDurationValue = z.infer<typeof retentionConfigDurationValueSchema>;

export const retentionConfigDurationSchema = z.object({
    deleteAfter: retentionConfigValueDurationSchema.optional(),
    compactAfter: retentionConfigValueDurationSchema.optional(),
    compact: z.array(compactablePropertySchema).optional(),
});
export type RetentionConfigDuration = z.infer<typeof retentionConfigDurationSchema>;

export const retentionConfigRetentionValueSchema = z.object({
    deleteAfter: retentionConfigValueRetentionValueSchema.optional(),
    compactAfter: retentionConfigValueRetentionValueSchema.optional(),
    compact: z.array(compactablePropertySchema).optional(),
});
export type RetentionConfigRetentionValue = z.infer<typeof retentionConfigRetentionValueSchema>;

export const retentionConfigSchema = z.union([
    retentionConfigDurationValueSchema,
    retentionConfigDurationSchema,
    retentionConfigRetentionValueSchema,
]);
export type RetentionConfig = z.infer<typeof retentionConfigSchema>;

export const retentionOptionsSchema = z.object({
    deleteAfter: retentionOptionDurationSchema,
    compactAfter: retentionOptionRetentionValueSchema,
    compact: z.array(compactablePropertySchema),
});

export type RetentionOptions = z.infer<typeof retentionOptionsSchema>;

export const DEFAULT_RETENTION_DELETE_AFTER = 604800; // 7 days
export const DEFAULT_RETENTION_COMPACT_AFTER = 259200; // 3 days
