import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { appSettings, users } from "../database/drizzle/schema/auth.ts";
import type { DbConcrete } from "../database/drizzle/drizzleUtils.ts";

export const OWNER_SETTING_KEY = 'ownerUserId';
export const DEFAULT_ADMIN_USERNAME = 'admin';
/** RFC 2606 reserved TLD, better-auth requires an email but MS does not use it */
export const PLACEHOLDER_EMAIL_DOMAIN = 'multi-scrobbler.invalid';

export const getAdminUsername = (): string => {
    const name = process.env.ADMIN_USERNAME?.trim();
    return name === undefined || name === '' ? DEFAULT_ADMIN_USERNAME : name.toLowerCase();
}

export type OwnerUser = typeof users.$inferSelect;

export const getSetting = async <T = unknown>(db: DbConcrete, key: string): Promise<T | undefined> => {
    const row = await db.query.appSettings.findFirst({where: {key}});
    return row === undefined ? undefined : row.value as T;
}

export const setSetting = async (db: DbConcrete, key: string, value: unknown): Promise<void> => {
    await db.insert(appSettings).values({key, value}).onConflictDoUpdate({target: appSettings.key, set: {value}});
}

export const deleteSetting = async (db: DbConcrete, key: string): Promise<void> => {
    await db.delete(appSettings).where(eq(appSettings.key, key));
}

/**
 * Get the instance owner, creating it if it does not exist.
 *
 * The owner is the single admin user that all file-configured components (and anything else not explicitly owned) belong to.
 * It is created *without* a credential (password) so that nothing about an upgrade requires user interaction.
 * A password is attached later through setup/env (see auth setup).
 * */
export const ensureOwner = async (db: DbConcrete): Promise<OwnerUser> => {
    const ownerId = await getSetting<string>(db, OWNER_SETTING_KEY);
    if (ownerId !== undefined) {
        const existing = await db.query.users.findFirst({where: {id: ownerId}});
        if (existing !== undefined) {
            return existing;
        }
    }

    const username = getAdminUsername();
    // re-use a user with the admin username if one somehow exists without the setting (restored partial db, etc...)
    let owner = await db.query.users.findFirst({where: {username}});
    if (owner === undefined) {
        owner = (await db.insert(users).values({
            id: randomUUID(),
            name: username,
            username,
            displayUsername: username,
            email: `${username}@${PLACEHOLDER_EMAIL_DOMAIN}`,
            emailVerified: true,
            role: 'admin',
        }).returning())[0];
    }
    await setSetting(db, OWNER_SETTING_KEY, owner.id);
    return owner;
}

export const getOwnerId = async (db: DbConcrete): Promise<string> => (await ensureOwner(db)).id;
