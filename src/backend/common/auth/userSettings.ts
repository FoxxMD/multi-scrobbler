import { and, eq } from "drizzle-orm";
import * as z from 'zod';
import { userSettings } from "../database/drizzle/schema/auth.ts";
import type { DbConcrete } from "../database/drizzle/drizzleUtils.ts";

const componentDetailLevel = z.enum(['count','detailed']);

const publicDashboardSettings = z.object({
    /** Show listening stats like total Plays, Scrobbles, and Listened (minutes). undefined = disabled */
    listenStats: z.boolean().optional(),
    /** Show Source components as only count or count + unique (detailed) types. undefined = disabled  */
    sources: componentDetailLevel.optional(),
    /** Show Client components as only count or count + unique (detailed) types. undefined = disabled  */
    clients: componentDetailLevel.optional(),
    /** Show recently scrobbled Plays. undefined = disabled  */
    recent: z.boolean().optional(),
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
    publicDashboardSettings: publicDashboardSettings.optional()
} satisfies Record<string, z.ZodType>;

export type UserSettingKey = keyof typeof userSettingSchemas;
export type UserSettingValue<K extends UserSettingKey> = z.infer<(typeof userSettingSchemas)[K]>;
export type UserSettingsValues = { [K in UserSettingKey]?: UserSettingValue<K> };

export const isUserSettingKey = (key: string): key is UserSettingKey => Object.hasOwn(userSettingSchemas, key);

/** Validate a value for a key. Throws for an unknown key or a ZodError for an invalid value */
export const parseUserSetting = <K extends UserSettingKey>(key: K | string, value: unknown): UserSettingValue<K> => {
    if (!isUserSettingKey(key)) {
        throw new Error(`Unknown user setting '${key}'`);
    }
    return userSettingSchemas[key].parse(value) as UserSettingValue<K>;
}

const parseStored = (key: string, value: unknown): unknown | undefined => {
    if (!isUserSettingKey(key)) {
        return undefined;
    }
    const res = userSettingSchemas[key].safeParse(value);
    return res.success ? res.data : undefined;
}

export const getUserSetting = async <K extends UserSettingKey>(db: DbConcrete, userId: string, key: K): Promise<UserSettingValue<K> | undefined> => {
    const row = await db.query.userSettings.findFirst({where: {userId, key}});
    return row === undefined ? undefined : parseStored(key, row.value) as UserSettingValue<K> | undefined;
}

/** All valid settings for a user. Unknown keys and values that no longer validate are left out */
export const getUserSettings = async (db: DbConcrete, userId: string): Promise<UserSettingsValues> => {
    const rows = await db.query.userSettings.findMany({where: {userId}});
    const values: Record<string, unknown> = {};
    for (const row of rows) {
        const val = parseStored(row.key, row.value);
        if (val !== undefined) {
            values[row.key] = val;
        }
    }
    return values as UserSettingsValues;
}

/** Validates then upserts. Throws for an unknown key or a ZodError for an invalid value */
export const setUserSetting = async <K extends UserSettingKey>(db: DbConcrete, userId: string, key: K | string, value: unknown): Promise<UserSettingValue<K>> => {
    const parsed = parseUserSetting<K>(key, value);
    await db.insert(userSettings).values({userId, key, value: parsed})
        .onConflictDoUpdate({target: [userSettings.userId, userSettings.key], set: {value: parsed}});
    return parsed;
}

export const deleteUserSetting = async (db: DbConcrete, userId: string, key: string): Promise<void> => {
    await db.delete(userSettings).where(and(eq(userSettings.userId, userId), eq(userSettings.key, key)));
}
