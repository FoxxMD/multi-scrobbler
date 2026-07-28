import * as z from "zod";
import type {Duration} from "dayjs/plugin/duration.js";
import {durationValueSchema} from "../Atomic.ts";

export const retentionPlayTypeSchema = z.enum(['failed', 'completed', 'duped']);

export type RetentionPlayType = z.infer<typeof retentionPlayTypeSchema>;

export const retentionPlayTypes: RetentionPlayType[] = ['failed','completed','duped'];

const durationSchema = z.custom<Duration>(
    (val) => val !== null && typeof val === 'object' && typeof (val as Duration).asMilliseconds === 'function',
    {message: 'Expected a dayjs Duration instance'}
);

export const retentionValueUnparsedSchema = z.union([durationValueSchema, z.literal(false)]);

export type RetentionValueUnparsed = z.infer<typeof retentionValueUnparsedSchema>;

export const retentionValueSchema = z.union([durationSchema, z.literal(false)]);

export type RetentionValue = z.infer<typeof retentionValueSchema>;

export const rententionGranularDurationValueSchema = z.object({
    failed: durationValueSchema.optional(),
    completed: durationValueSchema.optional(),
    duped: durationValueSchema.optional()
}).meta({
    description: 'Individual duration policies based on the state of the Play',
    title: 'Duration Value per Play Type'
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

export const compactablePropertySchema = z.enum(['transform', 'input']).meta({
    description: 'The type of data to compact on the Play'
});

export type CompactableProperty = z.infer<typeof compactablePropertySchema>;

export const COMPACTABLE = {
    transform: 'transform',
    input: 'input'
} as const satisfies Record<string, CompactableProperty>;

export const compactableProperties: CompactableProperty[] = [COMPACTABLE.transform, COMPACTABLE.input];

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
    deleteAfter: retentionConfigValueDurationValueSchema.optional().meta({description: 'Delete Plays using these retention policies'}),
    compactAfter: retentionConfigValueDurationValueSchema.optional().meta({description: 'Compact Plays using these retention policies'}),
    compact: z.array(compactablePropertySchema).optional().meta({ description: 'The type of data to compact on the Play'})
}).meta({description: 'Retention policy for Plays stored in the database'});
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
