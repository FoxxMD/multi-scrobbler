import { eq, sql } from "drizzle-orm";
import type { ComponentStat, PublicDashboardData, PublicPlay } from "../../core/Api.ts";
import type { PlayObject } from "../../core/Atomic.ts";
import { getUserSettings, type UserSettingsValues } from "./auth/userSettings.ts";
import { components } from "./database/drizzle/schema/schema.ts";
import type { DbConcrete } from "./database/drizzle/drizzleUtils.ts";

export interface DashboardComponents {
    sources: {type: string}[]
    clients: {type: string}[]
}

// ponytail: in-process cache, move to MSCache if the dashboard is ever served by multiple instances
const cache = new Map<string, {expires: number, data: PublicDashboardData}>();

/** Drop the cached dashboard so the next request is rebuilt (called when any publicDashboard setting changes) */
export const invalidateDashboardCache = (userId: string) => {
    cache.delete(userId);
}

const componentStat = (list: {type: string}[], level: 'count' | 'detailed'): ComponentStat => ({
    count: list.length,
    ...(level === 'detailed' ? {types: Array.from(new Set(list.map(x => x.type))) as ComponentStat['types']} : {})
});

const toPublicPlay = (play: PlayObject): PublicPlay => {
    const {artists, albumArtists, album, track, duration, meta, listenedFor, repeat} = play.data;
    const {source, musicService, url} = play.meta;
    return {
        data: {artists, albumArtists, album, track, duration, meta, listenedFor, repeat},
        meta: {source, musicService, url},
    };
}

/**
 * Build the public dashboard for a user, including only what is enabled in their publicDashboardSettings.
 * Returns an empty object when the dashboard is not enabled.
 * */
export const buildPublicDashboard = async (db: DbConcrete, userId: string, comps: DashboardComponents, userSettings: UserSettingsValues): Promise<PublicDashboardData> => {
    const {publicDashboardEnabled, publicDashboardSettings: settings} = userSettings;
    if (publicDashboardEnabled !== true || settings === undefined) {
        return {};
    }
    const data: PublicDashboardData = {};

    if (settings.listenStats === true) {
        // from db rows so components removed from config still count towards lifetime totals
        const rows = await db.select({
            mode: components.mode,
            count: sql<number>`sum(${components.countLive})`,
            listened: sql<number>`sum(${components.listenedLive})`,
        }).from(components).where(eq(components.userId, userId)).groupBy(components.mode);
        const source = rows.find(x => x.mode === 'source');
        data.plays = source?.count ?? 0;
        data.listened = source?.listened ?? 0;
        data.scrobbles = rows.find(x => x.mode === 'client')?.count ?? 0;
    }
    // in-memory components are only the currently configured ones. No owner filter, all are the single owner's for now
    if (settings.sources !== undefined) {
        data.sources = componentStat(comps.sources, settings.sources);
    }
    if (settings.clients !== undefined) {
        data.clients = componentStat(comps.clients, settings.clients);
    }

    if (settings.recent !== undefined) {
        // ponytail: over-fetches 5x to dedupe the same discovered play scrobbled to many clients, a user with more clients than that gets fewer than `recent` plays
        const scrobbled = await db.query.plays.findMany({
            where: {state: 'scrobbled', component: {mode: 'client', userId}},
            orderBy: {playedAt: 'desc'},
            limit: settings.recent * 5,
            with: {parent: true},
        });
        const seen = new Set<number>();
        const recent: PublicPlay[] = [];
        for (const row of scrobbled) {
            const key = row.parentId ?? row.id;
            if (seen.has(key)) {
                continue;
            }
            seen.add(key);
            recent.push(toPublicPlay((row.parent ?? row).play));
            if (recent.length === settings.recent) {
                break;
            }
        }
        data.recent = recent;
    }
    return data;
}

/** buildPublicDashboard, cached for publicDashboardSettings.refresh seconds (refresh: true never caches) */
export const getPublicDashboard = async (db: DbConcrete, userId: string, comps: DashboardComponents): Promise<PublicDashboardData> => {
    const cached = cache.get(userId);
    if (cached !== undefined && cached.expires > Date.now()) {
        return cached.data;
    }
    const userSettings = await getUserSettings(db, userId);
    const data = await buildPublicDashboard(db, userId, comps, userSettings);
    const refresh = userSettings.publicDashboardSettings?.refresh;
    if (typeof refresh === 'number') {
        cache.set(userId, {expires: Date.now() + refresh * 1000, data});
    } else {
        cache.delete(userId);
    }
    return data;
}
