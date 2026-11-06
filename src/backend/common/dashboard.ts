import { eq, sql } from "drizzle-orm";
import type { Logger } from "@foxxmd/logging";
import dayjs from "dayjs";
import type { ComponentStat, NowPlayingOption, PublicDashboardData, PublicPlay } from "../../core/Api.ts";
import { CALCULATED_PLAYER_STATUSES, type PlayObject, type SourcePlayerJson, type SourcePlayerObj } from "../../core/Atomic.ts";
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

/** A scrobble client (AbstractScrobbleClient), only the parts needed to mirror its Now Playing */
export interface NowPlayingClient {
    type: string
    getUid(): string
    supportsNowPlaying: boolean
    nowPlayingEnabled: boolean
    /** Source the current Now Playing came from */
    nowPlayingLastSource?: {type: string}
    getNowPlayingPlayers(): Record<string, SourcePlayerJson & {expiration?: string}>
}

/** Every component also has a name, only used for the (authenticated) Now Playing options */
type Named = {name?: string};

export interface DashboardComponents {
    sources: (({type: string} | NowPlayingSource) & Named)[]
    clients: (({type: string} | NowPlayingClient) & Named)[]
}

const hasPlayers = (source: DashboardComponents['sources'][number]): source is NowPlayingSource => 'players' in source;
const canNowPlay = (client: DashboardComponents['clients'][number]): client is NowPlayingClient => 'getNowPlayingPlayers' in client && client.supportsNowPlaying && client.nowPlayingEnabled;

/** The dashboard is cached at least this long, even with refresh: true, so unauthenticated polling can't force a rebuild on every request */
export const MIN_DASHBOARD_TTL = 5;

export interface DashboardCacheEntry {
    /** epoch ms */
    expires: number
    data: PublicDashboardData
}

// ponytail: in-process cache, move to MSCache if the dashboard is ever served by multiple instances
const cache = new Map<string, DashboardCacheEntry>();
/** key of the player last shown as Now Playing, per user, so the pick does not flip-flop between players that are playing at the same time */
const lastNowPlaying = new Map<string, string>();
/** configured Now Playing components that were not found, so each is only logged once */
const missingNowPlaying = new Set<string>();

/** Drop the cached dashboard so the next request is rebuilt (called when any publicDashboard setting changes) */
export const invalidateDashboardCache = (userId: string) => {
    cache.delete(userId);
    lastNowPlaying.delete(userId);
}

/** Sources and clients that can be picked as publicDashboardSettings.nowPlaying */
export const getNowPlayingOptions = (comps: DashboardComponents): NowPlayingOption[] => [
    ...comps.sources.filter(hasPlayers).map(x => ({from: 'source' as const, uid: x.getUid(), name: (x as Named).name ?? x.getUid(), type: x.type})),
    ...comps.clients.filter(canNowPlay).map(x => ({from: 'client' as const, uid: x.getUid(), name: (x as Named).name ?? x.getUid(), type: x.type})),
];

const componentStat = (list: {type: string}[], level: 'count' | 'detailed'): ComponentStat => ({
    count: list.length,
    ...(level === 'detailed' ? {types: Array.from(new Set(list.map(x => x.type))) as ComponentStat['types']} : {})
});

/** Only absolute http(s) URLs, anything else (javascript:, data:, relative...) is dropped. Play urls can come from anyone who can send to an ingress Source */
const httpUrl = (val?: string): string | undefined => {
    try {
        return val !== undefined && ['http:', 'https:'].includes(new URL(val).protocol) ? val : undefined;
    } catch {
        return undefined;
    }
}

const toPublicPlay = (play: PlayObject): PublicPlay => {
    const {artists, albumArtists, album, track, duration, meta, listenedFor, repeat} = play.data;
    const {source, musicService, url} = play.meta;
    const web = httpUrl(url?.web);
    const origin = httpUrl(url?.origin);
    return {
        data: {artists, albumArtists, album, track, duration, meta, listenedFor, repeat},
        meta: {source, musicService, url: web === undefined && origin === undefined ? undefined : {web, origin}},
    };
}

/**
 * Pick the public Now Playing from Source players.
 *
 * Only players that are playing (paused/stopped/stale/orphaned are hidden) from Sources that are monitoring, like scrobble clients do.
 * When several are playing keep showing the last picked one, otherwise sort by source then platform so the pick is deterministic.
 * Returns null when nothing is playing or the configured Source does not exist (anymore).
 * */
export const sourceNowPlaying = (userId: string, sources: DashboardComponents['sources'], from: Exclude<PublicNowPlaying, {from: 'client'}>): PublicPlay | null => {
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
 * Mirror the Now Playing a scrobble client last reported upstream.
 *
 * Non-realtime clients (last.fm, listenbrainz...) only update Now Playing while a player is playing, never when it pauses/stops,
 * so their Now Playing is only shown until it expires upstream. Realtime clients clear it themselves.
 * Returns null when nothing is playing or the client cannot report Now Playing.
 * */
export const clientNowPlaying = (client: NowPlayingClient): PublicPlay | null => {
    if (!client.supportsNowPlaying || !client.nowPlayingEnabled) {
        return null;
    }
    const [player] = Object.values(client.getNowPlayingPlayers());
    if (player?.play === undefined || (player.expiration !== undefined && !dayjs(player.expiration).isAfter(dayjs()))) {
        return null;
    }
    const publicPlay = toPublicPlay(player.play as unknown as PlayObject);
    publicPlay.meta.source = client.nowPlayingLastSource?.type;
    return publicPlay;
}

const resolveNowPlaying = (userId: string, comps: DashboardComponents, from: PublicNowPlaying, logger?: Logger): PublicPlay | null => {
    if (from.from !== 'anySource') {
        const list: {getUid?: () => string}[] = from.from === 'client' ? comps.clients.filter(canNowPlay) : comps.sources.filter(hasPlayers);
        const found = list.find(x => x.getUid?.() === from.uid);
        const missingKey = `${userId}-${from.from}-${from.uid}`;
        if (found === undefined) {
            if (!missingNowPlaying.has(missingKey)) {
                missingNowPlaying.add(missingKey);
                logger?.verbose(`Public dashboard Now Playing ${from.from} '${from.uid}' does not exist or cannot report Now Playing, nothing will be shown`);
            }
            return null;
        }
        missingNowPlaying.delete(missingKey);
        if (from.from === 'client') {
            return clientNowPlaying(found as NowPlayingClient);
        }
    }
    return sourceNowPlaying(userId, comps.sources, from as Exclude<PublicNowPlaying, {from: 'client'}>);
}

/**
 * Build the public dashboard for a user, including only what is enabled in their publicDashboardSettings.
 * Returns an empty object when the dashboard is not enabled.
 * */
export const buildPublicDashboard = async (db: DbConcrete, userId: string, comps: DashboardComponents, userSettings: UserSettingsValues, logger?: Logger): Promise<PublicDashboardData> => {
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
            // source type, from the component that discovered the play
            with: {parent: {with: {component: {columns: {type: true}}}}},
        });
        const seen = new Set<number>();
        const recent: PublicPlay[] = [];
        for (const row of scrobbled) {
            const key = row.parentId ?? row.id;
            if (seen.has(key)) {
                continue;
            }
            seen.add(key);
            const publicPlay = toPublicPlay((row.parent ?? row).play);
            // the play's own meta.source is whatever the source set (sometimes its name), only expose the type
            publicPlay.meta.source = row.parent?.component?.type;
            recent.push(publicPlay);
            if (recent.length === settings.recent) {
                break;
            }
        }
        data.recent = recent;
    }

    if (settings.nowPlaying !== undefined) {
        data.nowPlaying = resolveNowPlaying(userId, comps, settings.nowPlaying, logger);
    }
    return data;
}

/**
 * buildPublicDashboard, cached for publicDashboardSettings.refresh seconds.
 * refresh: true (always live) is still cached for MIN_DASHBOARD_TTL seconds.
 * */
export const getPublicDashboardEntry = async (db: DbConcrete, userId: string, comps: DashboardComponents, logger?: Logger): Promise<DashboardCacheEntry> => {
    const cached = cache.get(userId);
    if (cached !== undefined && cached.expires > Date.now()) {
        return cached;
    }
    const userSettings = await getUserSettings(db, userId);
    const data = await buildPublicDashboard(db, userId, comps, userSettings, logger);
    const refresh = userSettings.publicDashboardSettings?.refresh;
    const entry = {expires: Date.now() + Math.max(typeof refresh === 'number' ? refresh : 0, MIN_DASHBOARD_TTL) * 1000, data};
    cache.set(userId, entry);
    return entry;
}

export const getPublicDashboard = async (db: DbConcrete, userId: string, comps: DashboardComponents, logger?: Logger): Promise<PublicDashboardData> =>
    (await getPublicDashboardEntry(db, userId, comps, logger)).data;
