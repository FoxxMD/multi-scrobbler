import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { appSettings, users } from "../database/drizzle/schema/auth.ts";
import type { DbConcrete } from "../database/drizzle/drizzleUtils.ts";

export const OWNER_SETTING_KEY = 'ownerUserId';
export const DEFAULT_ADMIN_USERNAME = 'admin';
/** RFC 2606 reserved TLD, better-auth requires an email but MS does not use it */
export const PLACEHOLDER_EMAIL_DOMAIN = 'multi-scrobbler.invalid';

/**
 * Placeholder email for users without a real one.
 *
 * Built from the user id, not the username: the username can change, so a username-based email could collide with
 * a later user who takes the old username (users.email is unique). Ids are 32+ chars, longer than any username (max 30).
 * */
export const placeholderEmail = (userId: string) => `${userId}@${PLACEHOLDER_EMAIL_DOMAIN}`;

// same rules as the better-auth username plugin defaults, otherwise the owner could never sign in
const USERNAME_REGEX = /^[a-z0-9_.]{3,30}$/;

export const getAdminUsername = (): string => {
    const name = process.env.ADMIN_SETUP_USER?.trim();
    if (name === undefined || name === '') {
        return DEFAULT_ADMIN_USERNAME;
    }
    const normalized = name.toLowerCase();
    if (!USERNAME_REGEX.test(normalized)) {
        throw new Error(`ADMIN_SETUP_USER must be 3-30 characters of letters, numbers, underscores or dots -- given: ${name}`);
    }
    return normalized;
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
 *
 * ADMIN_SETUP_USER is only used when the owner is created, it is ignored afterwards (the username can be changed from the dashboard).
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
        const id = randomUUID();
        owner = (await db.insert(users).values({
            id,
            name: username,
            username,
            displayUsername: username,
            email: placeholderEmail(id),
            // placeholder emails are never verified, see placeholderEmail
            emailVerified: false,
            role: 'admin',
        }).returning())[0];
    }
    await setSetting(db, OWNER_SETTING_KEY, owner.id);
    return owner;
}

export const getOwnerId = async (db: DbConcrete): Promise<string> => (await ensureOwner(db)).id;
