import { EventEmitter } from "events";
import request from 'superagent';
import { MemoryPositionalSource } from "./MemoryPositionalSource.js";
import { RecentlyPlayedOptions } from "./AbstractSource.js";
import { PlayObject, PlayObjectLifecycleless, URLData } from "../../core/Atomic.js";
import {
    InternalConfig,
    NO_DEVICE,
    NO_USER,
    PlayerStateData,
    PlayerStateDataMaybePlay,
    REPORTED_PLAYER_STATUSES,
} from "../common/infrastructure/Atomic.js";
import { YandexMusicBridgeSourceConfig } from "../common/infrastructure/config/source/ymbridge.js";
import { isPortReachableConnect, joinedUrl, normalizeWebAddress } from "../utils/NetworkUtils.js";
import { baseFormatPlayObj } from "../utils/PlayTransformUtils.js";
import { UpstreamError } from "../common/errors/UpstreamError.js";

interface BridgeTrackData {
    title?: string
    artists?: string
    artists_list?: string[]
    album?: string
    track_id?: string
    cover?: string
    duration_ms?: number
    progress_ms?: number
    paused?: boolean
    explicit?: boolean
    context_type?: string
    queue_id?: string
    player_id?: string
    device_id?: string
    device_name?: string
    platform?: string
    source?: string
    timestamp?: number
}

interface BridgePlayersResponse {
    ok: boolean
    source?: string
    fresh?: boolean
    players_count?: number
    primary?: BridgeTrackData | null
    data?: BridgeTrackData[] | BridgeTrackData | null
}

interface SyntheticPlaybackState {
    key: string
    lastSeenAtMs: number
    lastPositionSec: number
    durationSec?: number
    reachedTrackEndAtMs?: number
}


const normalizeBridgeData = (obj: BridgeTrackData): BridgeTrackData => {
    const normalized: BridgeTrackData = { ...obj };

    if (normalized.progress_ms !== undefined && normalized.progress_ms !== null) {
        normalized.progress_ms = Math.max(0, Number(normalized.progress_ms) || 0);
    }

    if (normalized.duration_ms !== undefined && normalized.duration_ms !== null) {
        const dur = Number(normalized.duration_ms);
        normalized.duration_ms = Number.isFinite(dur) && dur > 0 ? dur : undefined;
    }

    if (normalized.duration_ms !== undefined && normalized.progress_ms !== undefined) {
        normalized.progress_ms = Math.min(normalized.progress_ms, normalized.duration_ms);
    }

    return normalized;
}

const getSafePositionSec = (obj: BridgeTrackData): number | undefined => {
    if (obj.progress_ms === undefined || obj.progress_ms === null) {
        return undefined;
    }

    const progressSec = Math.max(0, obj.progress_ms / 1000);
    const durationSec = obj.duration_ms !== undefined && obj.duration_ms !== null && obj.duration_ms > 0
        ? obj.duration_ms / 1000
        : undefined;

    if (obj.source === 'station-local') {
        return durationSec !== undefined ? Math.min(progressSec, durationSec) : 0;
    }

    return durationSec !== undefined ? Math.min(progressSec, durationSec) : progressSec;
}

export default class YandexMusicBridgeSource extends MemoryPositionalSource {

    declare config: YandexMusicBridgeSourceConfig;
    urlData!: URLData;
    private syntheticPlaybackByPlayer = new Map<string, SyntheticPlaybackState>();
    private lastBridgeDataByPlayer = new Map<string, BridgeTrackData>();
    private lastPlayByPlayer = new Map<string, PlayObject>();
    private lastBridgeSeenAtMsByPlayer = new Map<string, number>();
    private keepAliveMinSec = 90;
    private keepAlivePaddingSec = 120;
    private keepAliveHardCapSec = 600;
    private postEndStopGraceSec = 20;

    constructor(name: string, config: YandexMusicBridgeSourceConfig, internal: InternalConfig, emitter: EventEmitter) {
        super('ymbridge', name, config, internal, emitter);
        this.requiresAuth = false;
        this.canPoll = true;
        this.multiPlatform = true;
    }

    protected async doBuildInitData(): Promise<true | string | undefined> {
        const { data: { url } = {} } = this.config;
        if (url === null || url === undefined || url === '') {
            throw new Error('data.url must be defined');
        }
        this.urlData = normalizeWebAddress(url, { defaultPath: '/' });
        this.logger.verbose(`Config URL: '${url}' => Normalized: '${this.urlData.normal}'`);
        return true;
    }

    protected async doCheckConnection(): Promise<true | string | undefined> {
        try {
            await isPortReachableConnect(this.urlData.port, { host: this.urlData.url.hostname });
            const healthUrl = joinedUrl(this.urlData.url, 'health').toString();
            const req = request.get(healthUrl).timeout({ response: 5000, deadline: 10000 });
            const apiKey = this.config.data?.apiKey;
            if (apiKey !== undefined && apiKey.trim() !== '') {
                req.set('X-API-Key', apiKey);
            }
            const resp = await req;
            if (resp.body !== undefined && typeof resp.body === 'object') {
                this.logger.info(`Yandex Music bridge is reachable at ${this.urlData.url.host}`);
                return true;
            }
            throw new UpstreamError('Bridge health endpoint did not return JSON', { responseBody: resp.body, showStopper: true });
        } catch (e: any) {
            const hint = e?.response?.text ?? e?.message ?? undefined;
            throw new UpstreamError(`Could not connect to Yandex Music bridge${hint !== undefined ? ` (${hint})` : ''}`, { cause: e, responseBody: e?.response?.text, showStopper: true });
        }
    }

    private async callBridge(): Promise<BridgePlayersResponse> {
        const apiKey = this.config.data?.apiKey;
        const makeReq = (path: string) => {
            const req = request.get(joinedUrl(this.urlData.url, path).toString()).timeout({ response: 5000, deadline: 10000 });
            if (apiKey !== undefined && apiKey.trim() !== '') {
                req.set('X-API-Key', apiKey);
            }
            return req;
        };

        try {
            const resp = await makeReq('players');
            if (resp.body === undefined || typeof resp.body !== 'object') {
                throw new UpstreamError('Bridge returned no JSON payload', { responseBody: resp.body, showStopper: true });
            }
            return resp.body as BridgePlayersResponse;
        } catch (e: any) {
            if (e?.status !== 404) {
                throw new UpstreamError('Bridge did not return an expected response from /players', { responseBody: e?.response?.text, cause: e, showStopper: true });
            }
            const resp = await makeReq('now-playing');
            if (resp.body === undefined || typeof resp.body !== 'object') {
                throw new UpstreamError('Bridge returned no JSON payload', { responseBody: resp.body, showStopper: true });
            }
            const body = resp.body as any;
            const single = body?.data ?? null;
            return {
                ok: body?.ok ?? true,
                source: body?.source,
                fresh: body?.fresh,
                players_count: single ? 1 : 0,
                primary: single,
                data: single ? [single] : [],
            };
        }
    }

    private getPlayerId(bridgeData: BridgeTrackData): string {
        const raw = bridgeData.player_id ?? bridgeData.device_id ?? bridgeData.queue_id ?? bridgeData.track_id;
        return raw !== undefined && raw !== null && `${raw}`.trim() !== '' ? `${raw}` : NO_DEVICE;
    }

    private isStationLocal(bridgeData: BridgeTrackData): boolean {
        return bridgeData.source === 'station-local';
    }

    private removePlayerState(playerId: string): void {
        this.syntheticPlaybackByPlayer.delete(playerId);
        this.lastBridgeDataByPlayer.delete(playerId);
        this.lastPlayByPlayer.delete(playerId);
        this.lastBridgeSeenAtMsByPlayer.delete(playerId);
    }

    private clearSyntheticPlayback(playerId: string): void {
        this.syntheticPlaybackByPlayer.delete(playerId);
    }

    private getSyntheticKey(bridgeData: BridgeTrackData, play: PlayObject): string {
        const artists = Array.isArray(bridgeData.artists_list) && bridgeData.artists_list.length > 0
            ? bridgeData.artists_list.join(',')
            : (bridgeData.artists ?? play.data.artists?.join(',') ?? '');
        return [
            this.getPlayerId(bridgeData),
            bridgeData.track_id ?? '',
            bridgeData.title ?? play.data.track ?? '',
            artists,
            bridgeData.album ?? play.data.album ?? '',
        ].join('::');
    }

    private getPlaybackState(playerId: string, bridgeData: BridgeTrackData, play: PlayObject): { status: typeof REPORTED_PLAYER_STATUSES.playing, position: number } {
        const now = Date.now();
        const reportedPositionSec = bridgeData.progress_ms !== undefined && bridgeData.progress_ms !== null
            ? Math.max(0, bridgeData.progress_ms / 1000)
            : undefined;
        const durationSec = play.data.duration;

        if (this.isStationLocal(bridgeData)) {
            const position = durationSec !== undefined && durationSec > 0
                ? Math.min(reportedPositionSec ?? play.meta.trackProgressPosition ?? 0, durationSec)
                : (reportedPositionSec ?? play.meta.trackProgressPosition ?? 0);
            this.clearSyntheticPlayback(playerId);
            return {
                status: REPORTED_PLAYER_STATUSES.playing,
                position: Math.max(0, position),
            };
        }
        const key = this.getSyntheticKey(bridgeData, play);
        const current = this.syntheticPlaybackByPlayer.get(playerId);

        if (current === undefined || current.key !== key) {
            const initialPosition = reportedPositionSec ?? play.meta.trackProgressPosition ?? 0;
            this.syntheticPlaybackByPlayer.set(playerId, {
                key,
                lastSeenAtMs: now,
                lastPositionSec: initialPosition,
                durationSec,
                reachedTrackEndAtMs: durationSec !== undefined && durationSec > 0 && initialPosition >= durationSec ? now : undefined,
            });
            return {
                status: REPORTED_PLAYER_STATUSES.playing,
                position: durationSec !== undefined && durationSec > 0 ? Math.min(initialPosition, durationSec) : initialPosition,
            };
        }

        const elapsedSec = Math.max(0, (now - current.lastSeenAtMs) / 1000);
        const startingPoint = reportedPositionSec !== undefined
            ? Math.max(reportedPositionSec, current.lastPositionSec)
            : current.lastPositionSec;

        let nextPosition = startingPoint + elapsedSec;
        if (durationSec !== undefined && durationSec > 0 && nextPosition >= durationSec) {
            nextPosition = durationSec;
            if (current.reachedTrackEndAtMs === undefined) {
                current.reachedTrackEndAtMs = now;
            }
        }

        current.lastSeenAtMs = now;
        current.lastPositionSec = nextPosition;
        current.durationSec = durationSec;
        this.syntheticPlaybackByPlayer.set(playerId, current);

        return {
            status: REPORTED_PLAYER_STATUSES.playing,
            position: nextPosition,
        };
    }

    private shouldKeepAliveSynthetic(playerId: string, nowMs: number = Date.now()): boolean {
        const lastBridgeData = this.lastBridgeDataByPlayer.get(playerId);
        if (lastBridgeData !== undefined && this.isStationLocal(lastBridgeData)) {
            return false;
        }

        const synthetic = this.syntheticPlaybackByPlayer.get(playerId);
        const lastPlay = this.lastPlayByPlayer.get(playerId);
        const lastSeen = this.lastBridgeSeenAtMsByPlayer.get(playerId);
        if (synthetic === undefined || lastPlay === undefined || lastBridgeData === undefined || lastSeen === undefined) {
            return false;
        }

        const silenceSec = Math.max(0, (nowMs - lastSeen) / 1000);
        const durationSec = synthetic.durationSec ?? lastPlay.data.duration;
        const currentPosSec = synthetic.lastPositionSec ?? lastPlay.meta.trackProgressPosition ?? 0;

        let allowedSilenceSec = this.keepAliveMinSec;
        if (durationSec !== undefined && durationSec > 0) {
            const remainingSec = Math.max(0, durationSec - currentPosSec);
            allowedSilenceSec = Math.max(this.keepAliveMinSec, remainingSec + this.keepAlivePaddingSec);
        }
        allowedSilenceSec = Math.min(allowedSilenceSec, this.keepAliveHardCapSec);

        if (silenceSec <= allowedSilenceSec) {
            return true;
        }

        this.logger.debug(`Dropping synthetic keepalive for player ${playerId} after ${silenceSec.toFixed(0)}s without bridge data (allowed ${allowedSilenceSec.toFixed(0)}s)`);
        return false;
    }

    private shouldFinalizeSyntheticTrack(playerId: string, nowMs: number = Date.now()): boolean {
        const synthetic = this.syntheticPlaybackByPlayer.get(playerId);
        const lastPlay = this.lastPlayByPlayer.get(playerId);
        if (synthetic === undefined || lastPlay === undefined) {
            return false;
        }
        const durationSec = synthetic.durationSec ?? lastPlay.data.duration;
        if (durationSec === undefined || durationSec <= 0) {
            return false;
        }
        if (synthetic.lastPositionSec < durationSec) {
            return false;
        }
        if (synthetic.reachedTrackEndAtMs === undefined) {
            synthetic.reachedTrackEndAtMs = nowMs;
            this.syntheticPlaybackByPlayer.set(playerId, synthetic);
            return false;
        }
        const sinceEndSec = Math.max(0, (nowMs - synthetic.reachedTrackEndAtMs) / 1000);
        return sinceEndSec >= this.postEndStopGraceSec;
    }

    private buildStoppedState(playerId: string): PlayerStateDataMaybePlay | undefined {
        const bridgeData = this.lastBridgeDataByPlayer.get(playerId);
        if (bridgeData === undefined) {
            return undefined;
        }
        return {
            platformId: [playerId, NO_USER],
            sessionId: bridgeData.queue_id ?? bridgeData.track_id ?? playerId,
            status: REPORTED_PLAYER_STATUSES.stopped,
        };
    }

    getRecentlyPlayed = async (options: RecentlyPlayedOptions = {}) => {
        const payload = await this.callBridge();
        const rawData = payload.data;
        const players = Array.isArray(rawData)
            ? rawData.filter((x): x is BridgeTrackData => x !== null && x !== undefined && typeof x === 'object')
            : (rawData !== undefined && rawData !== null && typeof rawData === 'object' ? [rawData as BridgeTrackData] : []);
        const nowMs = Date.now();
        const seenPlayerIds = new Set<string>();
        const states: PlayerStateDataMaybePlay[] = [];

        for (const rawBridgeData of players) {
            const bridgeData = normalizeBridgeData(rawBridgeData);
            if (!payload.ok || bridgeData.title === undefined || bridgeData.title === null || `${bridgeData.title}`.trim() === '') {
                continue;
            }
            const playerId = this.getPlayerId(bridgeData);
            seenPlayerIds.add(playerId);
            const play = formatPlayObj(bridgeData, playerId);
            this.lastBridgeDataByPlayer.set(playerId, bridgeData);
            this.lastPlayByPlayer.set(playerId, play);
            this.lastBridgeSeenAtMsByPlayer.set(playerId, nowMs);

            if (this.isStationLocal(bridgeData) && bridgeData.paused === true) {
                this.clearSyntheticPlayback(playerId);
                states.push({
                    platformId: [playerId, NO_USER],
                    sessionId: bridgeData.queue_id ?? bridgeData.track_id ?? playerId,
                    status: REPORTED_PLAYER_STATUSES.paused,
                    play,
                    position: getSafePositionSec(bridgeData) ?? play.meta.trackProgressPosition ?? 0,
                });
                continue;
            }

            const playbackState = this.getPlaybackState(playerId, bridgeData, play);

            if (this.shouldFinalizeSyntheticTrack(playerId, nowMs)) {
                const durationSec = this.syntheticPlaybackByPlayer.get(playerId)?.durationSec ?? play.data.duration ?? 0;
                this.logger.info(`Synthetic playback exceeded track duration for player ${playerId} '${play.data.artists?.join(', ') ?? 'Unknown'} - ${play.data.track ?? 'Unknown'}'; emitting STOP after ${this.postEndStopGraceSec}s past track end at ${durationSec.toFixed(0)}s.`);
                const stoppedState = this.buildStoppedState(playerId);
                this.removePlayerState(playerId);
                if (stoppedState !== undefined) {
                    states.push(stoppedState);
                }
                continue;
            }

            states.push({
                platformId: [playerId, NO_USER],
                sessionId: bridgeData.queue_id ?? bridgeData.track_id ?? playerId,
                status: playbackState.status,
                play,
                position: playbackState.position,
            });
        }

        for (const [playerId, lastPlay] of Array.from(this.lastPlayByPlayer.entries())) {
            if (seenPlayerIds.has(playerId)) {
                continue;
            }
            if (this.shouldKeepAliveSynthetic(playerId, nowMs)) {
                const bridgeDataForKeepAlive = this.lastBridgeDataByPlayer.get(playerId)!;
                const playbackState = this.getPlaybackState(playerId, bridgeDataForKeepAlive, lastPlay);

                if (this.shouldFinalizeSyntheticTrack(playerId, nowMs)) {
                    const durationSec = this.syntheticPlaybackByPlayer.get(playerId)?.durationSec ?? lastPlay.data.duration ?? 0;
                    this.logger.info(`Synthetic keepalive exceeded track duration for player ${playerId} '${lastPlay.data.artists?.join(', ') ?? 'Unknown'} - ${lastPlay.data.track ?? 'Unknown'}'; emitting STOP after ${this.postEndStopGraceSec}s past track end at ${durationSec.toFixed(0)}s.`);
                    const stoppedState = this.buildStoppedState(playerId);
                    this.removePlayerState(playerId);
                    if (stoppedState !== undefined) {
                        states.push(stoppedState);
                    }
                    continue;
                }

                this.logger.trace(`Bridge returned no current track for player ${playerId}; keeping synthetic playback alive for ${lastPlay.data.artists?.join(', ') ?? 'Unknown'} - ${lastPlay.data.track ?? 'Unknown'}`);
                states.push({
                    platformId: [playerId, NO_USER],
                    sessionId: bridgeDataForKeepAlive.queue_id ?? bridgeDataForKeepAlive.track_id ?? playerId,
                    status: REPORTED_PLAYER_STATUSES.playing,
                    play: lastPlay,
                    position: playbackState.position,
                });
                continue;
            }

            this.removePlayerState(playerId);
        }

        return await this.processRecentPlays(states);
    }
}

const formatPlayObj = (obj: BridgeTrackData, playerId: string): PlayObject => {
    const artists = Array.isArray(obj.artists_list) && obj.artists_list.length > 0
        ? obj.artists_list
        : (obj.artists ? obj.artists.split(/\s*,\s*/).filter(x => x.trim() !== '') : []);

    const play: PlayObjectLifecycleless = {
        data: {
            artists,
            album: obj.album ?? undefined,
            track: obj.title ?? undefined,
            duration: obj.duration_ms !== undefined && obj.duration_ms !== null
                ? obj.duration_ms / 1000
                : undefined,
        },
        meta: {
            trackProgressPosition: getSafePositionSec(obj),
            deviceId: playerId || NO_DEVICE,
            mediaPlayerName: obj.device_name ?? (obj.source === 'station-local' ? 'Yandex Station' : 'Yandex Music'),
            mediaPlayerVersion: obj.platform ?? (obj.source === 'station-local' ? 'station-local' : 'bridge'),
            comment: obj.track_id !== undefined ? `Yandex Track ${obj.track_id}` : undefined,
            art: obj.cover !== undefined && obj.cover !== null && obj.cover !== '' ? { album: obj.cover } : undefined,
        }
    }

    return baseFormatPlayObj(obj, play);
}
