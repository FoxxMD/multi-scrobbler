import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

/*
 * Tables used by better-auth (https://better-auth.com)
 *
 * Shape follows `npx auth generate` output for the core schema + username, admin and api-key plugins
 * (better-auth 1.7.x) but with column names left to drizzle's default (property name) to match the rest of the MS schema.
 *
 * better-auth reads/writes these through the drizzle adapter by *property name* so column names are free to differ.
 * If plugins are added/removed regenerate the schema and diff against this file.
 * */

const nowMs = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;

export const users = sqliteTable("users", {
    id: text().primaryKey(),
    name: text().notNull(),
    email: text().notNull().unique(),
    emailVerified: integer({ mode: 'boolean' }).default(false).notNull(),
    image: text(),
    createdAt: integer({ mode: 'timestamp_ms' }).default(nowMs).notNull(),
    updatedAt: integer({ mode: 'timestamp_ms' }).default(nowMs).$onUpdate(() => new Date()).notNull(),
    // username plugin
    username: text().unique(),
    displayUsername: text(),
    // admin plugin
    role: text(),
    banned: integer({ mode: 'boolean' }).default(false),
    banReason: text(),
    banExpires: integer({ mode: 'timestamp_ms' }),
});

export const sessions = sqliteTable("sessions", {
    id: text().primaryKey(),
    expiresAt: integer({ mode: 'timestamp_ms' }).notNull(),
    token: text().notNull().unique(),
    createdAt: integer({ mode: 'timestamp_ms' }).default(nowMs).notNull(),
    updatedAt: integer({ mode: 'timestamp_ms' }).$onUpdate(() => new Date()).notNull(),
    ipAddress: text(),
    userAgent: text(),
    userId: text().notNull().references(() => users.id, { onDelete: 'cascade' }),
    // admin plugin
    impersonatedBy: text(),
}, (table) => [
    index("sessions_userId_idx").on(table.userId),
]);

export const accounts = sqliteTable("accounts", {
    id: text().primaryKey(),
    accountId: text().notNull(),
    providerId: text().notNull(),
    userId: text().notNull().references(() => users.id, { onDelete: 'cascade' }),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: integer({ mode: 'timestamp_ms' }),
    refreshTokenExpiresAt: integer({ mode: 'timestamp_ms' }),
    scope: text(),
    password: text(),
    createdAt: integer({ mode: 'timestamp_ms' }).default(nowMs).notNull(),
    updatedAt: integer({ mode: 'timestamp_ms' }).$onUpdate(() => new Date()).notNull(),
}, (table) => [
    index("accounts_userId_idx").on(table.userId),
]);

export const verifications = sqliteTable("verifications", {
    id: text().primaryKey(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: integer({ mode: 'timestamp_ms' }).notNull(),
    createdAt: integer({ mode: 'timestamp_ms' }).default(nowMs).notNull(),
    updatedAt: integer({ mode: 'timestamp_ms' }).default(nowMs).$onUpdate(() => new Date()).notNull(),
}, (table) => [
    index("verifications_identifier_idx").on(table.identifier),
]);

// api-key plugin (@better-auth/api-key)
export const apikeys = sqliteTable("apikeys", {
    id: text().primaryKey(),
    configId: text().default('default').notNull(),
    name: text(),
    start: text(),
    // owning user. The plugin also allows organizations here, MS only uses users
    referenceId: text().notNull().references(() => users.id, { onDelete: 'cascade' }),
    prefix: text(),
    key: text().notNull(),
    refillInterval: integer(),
    refillAmount: integer(),
    lastRefillAt: integer({ mode: 'timestamp_ms' }),
    enabled: integer({ mode: 'boolean' }).default(true),
    rateLimitEnabled: integer({ mode: 'boolean' }).default(true),
    rateLimitTimeWindow: integer(),
    rateLimitMax: integer(),
    requestCount: integer().default(0),
    remaining: integer(),
    lastRequest: integer({ mode: 'timestamp_ms' }),
    expiresAt: integer({ mode: 'timestamp_ms' }),
    createdAt: integer({ mode: 'timestamp_ms' }).default(nowMs).notNull(),
    updatedAt: integer({ mode: 'timestamp_ms' }).default(nowMs).$onUpdate(() => new Date()).notNull(),
    permissions: text(),
    metadata: text(),
}, (table) => [
    index("apikeys_configId_idx").on(table.configId),
    index("apikeys_referenceId_idx").on(table.referenceId),
    index("apikeys_key_idx").on(table.key),
]);

/**
 * Small key/value store for app-level state that must survive restarts
 * (applied password-reset fingerprint, etc.)
 * */
export const appSettings = sqliteTable("app_settings", {
    key: text().primaryKey(),
    value: text({ mode: 'json' }),
    updatedAt: integer({ mode: 'timestamp_ms' }).default(nowMs).$onUpdate(() => new Date()).notNull(),
});

/** Tables better-auth needs passed to its drizzle adapter, keyed by plural model name */
export const authSchema = { users, sessions, accounts, verifications, apikeys };
