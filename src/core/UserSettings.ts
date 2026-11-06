import * as z from 'zod';

export const componentDetailLevel = z.enum(['count','detailed']);

/**
 * Where the public Now Playing comes from
 *
 * * anySource -- any Source with players, picked deterministically when several are playing
 * * source -- only the Source with this uid (AbstractComponent.getUid())
 * * client -- mirror the Now Playing of the scrobble client with this uid, which must have Now Playing enabled
 * */
export const publicNowPlayingSchema = z.discriminatedUnion('from', [
    z.object({from: z.literal('anySource')}),
    z.object({from: z.literal('source'), uid: z.string().min(1)}),
    z.object({from: z.literal('client'), uid: z.string().min(1)}),
]);

/** An origin allowed to embed the dashboard, used in CSP frame-ancestors so it must never contain spaces or ';' */
export const embedAncestorSchema = z.string().trim().toLowerCase().regex(/^https?:\/\/(\*\.)?[a-z0-9-]+(\.[a-z0-9-]+)*(:\d{1,5})?$/, 'Must be an origin like https://blog.example.com or https://*.example.com');

export const publicDashboardEmbedSchema = z.object({
    /** Origins allowed to embed. undefined or empty = any site */
    ancestors: embedAncestorSchema.array().max(20).optional(),
});

export const publicDashboardSettingsSchema = z.object({
    /** Show listening stats like total Plays, Scrobbles, and Listened (minutes). undefined = disabled */
    listenStats: z.boolean().optional(),
    /** Show Source components as only count or count + unique (detailed) types. undefined = disabled  */
    sources: componentDetailLevel.optional(),
    /** Show Client components as only count or count + unique (detailed) types. undefined = disabled  */
    clients: componentDetailLevel.optional(),
    /** Number of unique, recently scrobbled Plays to show. undefined = disabled  */
    recent: z.number().int().positive().max(50).optional(),
    /** Show what is currently playing. undefined = disabled */
    nowPlaying: publicNowPlayingSchema.optional(),
    /** Allow the dashboard to be embedded on other sites (iframe of /embed). undefined = disabled */
    embed: publicDashboardEmbedSchema.optional(),
    /** how often to expire cache, in seconds. true = always live (still cached for a few seconds, see MIN_DASHBOARD_TTL) */
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
export type PublicNowPlaying = z.infer<typeof publicNowPlayingSchema>;
export type PublicDashboardEmbed = z.infer<typeof publicDashboardEmbedSchema>;

/** Response for GET/PUT/DELETE /api/user/:userId/setting/:key, value is null when unset */
export interface UserSettingResponse<K extends UserSettingKey = UserSettingKey> {
    key: K
    value: UserSettingValue<K> | null
}
