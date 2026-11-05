import * as z from 'zod';

export const componentDetailLevel = z.enum(['count','detailed']);

export const publicDashboardSettingsSchema = z.object({
    /** Show listening stats like total Plays, Scrobbles, and Listened (minutes). undefined = disabled */
    listenStats: z.boolean().optional(),
    /** Show Source components as only count or count + unique (detailed) types. undefined = disabled  */
    sources: componentDetailLevel.optional(),
    /** Show Client components as only count or count + unique (detailed) types. undefined = disabled  */
    clients: componentDetailLevel.optional(),
    /** Number of unique, recently scrobbled Plays to show. undefined = disabled  */
    recent: z.number().int().positive().max(50).optional(),
    /** how often to expire cache, in seconds. true = never cache, always so freshest/live. */
    refresh: z.union([z.literal(true), z.number().positive()])
})

/**
 * Every allowed user setting key and the schema its value must satisfy.
 *
 * Add a key here to make it storable. Keys not listed are rejected on write and ignored on read.
 * If a schema changes, stored values that no longer parse are treated as unset (the client falls back to its default).
 * */
export const userSettingSchemas = {
    /** Enable the public dashboard for unauthenticated users */
    publicDashboardEnabled: z.boolean().optional(),
    publicDashboardSettings: publicDashboardSettingsSchema.optional()
} satisfies Record<string, z.ZodType>;

export type UserSettingKey = keyof typeof userSettingSchemas;
export type UserSettingValue<K extends UserSettingKey> = z.infer<(typeof userSettingSchemas)[K]>;
export type UserSettingsValues = { [K in UserSettingKey]?: UserSettingValue<K> };

export type PublicDashboardSettings = z.infer<typeof publicDashboardSettingsSchema>;

/** Response for GET/PUT/DELETE /api/user/:userId/setting/:key, value is null when unset */
export interface UserSettingResponse<K extends UserSettingKey = UserSettingKey> {
    key: K
    value: UserSettingValue<K> | null
}
