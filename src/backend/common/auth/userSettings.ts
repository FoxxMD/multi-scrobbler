import { and, eq } from "drizzle-orm";
import { userSettings } from "../database/drizzle/schema/auth.ts";
import type { DbConcrete } from "../database/drizzle/drizzleUtils.ts";
import { invalidateDashboardCache } from "../dashboard.ts";
import { userSettingSchemas, type UserSettingKey, type UserSettingValue, type UserSettingsValues } from "../../../core/UserSettings.ts";

export * from "../../../core/UserSettings.ts";

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
    invalidateIfDashboard(userId, key);
    return parsed;
}

export const deleteUserSetting = async (db: DbConcrete, userId: string, key: string): Promise<void> => {
    await db.delete(userSettings).where(and(eq(userSettings.userId, userId), eq(userSettings.key, key)));
    invalidateIfDashboard(userId, key);
}

// a cached public dashboard may expose data the user just disabled, rebuild on next request
const invalidateIfDashboard = (userId: string, key: string) => {
    if (key.startsWith('publicDashboard')) {
        invalidateDashboardCache(userId);
    }
}
