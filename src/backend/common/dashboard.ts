import { eq, sql } from "drizzle-orm";
import type { ComponentStat, PublicDashboardData, PublicPlay } from "../../core/Api.ts";
import { CALCULATED_PLAYER_STATUSES, type PlayObject, type SourcePlayerObj } from "../../core/Atomic.ts";
import type { PublicNowPlaying } from "../../core/UserSettings.ts";
import { getUserSettings, type UserSettingsValues } from "./auth/userSettings.ts";
import { components } from "./database/drizzle/schema/schema.ts";
import type { DbConcrete } from "./database/drizzle/drizzleUtils.ts";

/** A Source with players (MemorySource), only the parts needed to pick a public Now Playing */
export interface NowPlayingSource {
    type: string
    getUid(): string
    isMonitoring(): boolean
    players: Map<string, {getApiState(): SourcePlayerObj}>
}

export interface DashboardComponents {
    sources: ({type: string} | NowPlayingSource)[]
    clients: {type: string}[]
}

const hasPlayers = (source: DashboardComponents['sources'][number]): source is NowPlayingSource => 'players' in source;

// ponytail: in-process cache, move to MSCache if the dashboard is ever served by multiple instances
const cache = new Map<string, {expires: number, data: PublicDashboardData}>();
/** key of the player last shown as Now Playing, per user, so the pick does not flip-flop between players that are playing at the same time */
const lastNowPlaying = new Map<string, string>();

/** Drop the cached dashboard so the next request is rebuilt (called when any publicDashboard setting changes) */
export const invalidateDashboardCache = (userId: string) => {
    cache.delete(userId);
    lastNowPlaying.delete(userId);
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
 * Pick the public Now Playing from Source players.
 *
 * Only players that are playing (paused/stopped/stale/orphaned are hidden) from Sources that are monitoring, like scrobble clients do.
 * When several are playing keep showing the last picked one, otherwise sort by source then platform so the pick is deterministic.
 * Returns null when nothing is playing or the configured Source does not exist (anymore).
 * */
export const sourceNowPlaying = (userId: string, sources: DashboardComponents['sources'], from: PublicNowPlaying): PublicPlay | null => {
    const candidates: {key: string, sourceType: string, play: PlayObject}[] = [];
    for (const source of sources) {
        if (!hasPlayers(source) || (from.from === 'source' && source.getUid() !== from.uid) || !source.isMonitoring()) {
            continue;
        }
        for (const player of source.players.values()) {
            const {platformId, play, status} = player.getApiState();
            if (play !== undefined && status.calculated === CALCULATED_PLAYER_STATUSES.playing && status.stale !== true && status.orphaned !== true) {
                candidates.push({key: `${source.type}-${source.getUid()}-${platformId}`, sourceType: source.type, play: play as PlayObject});
            }
        }
    }
    if (candidates.length === 0) {
        lastNowPlaying.delete(userId);
        return null;
    }
    const picked = candidates.find(x => x.key === lastNowPlaying.get(userId)) ?? candidates.sort((a, b) => a.key.localeCompare(b.key))[0];
    lastNowPlaying.set(userId, picked.key);
    const publicPlay = toPublicPlay(picked.play);
    publicPlay.meta.source = picked.sourceType;
    return publicPlay;
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

    if (settings.nowPlaying !== undefined) {
        data.nowPlaying = sourceNowPlaying(userId, comps.sources, settings.nowPlaying);
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
