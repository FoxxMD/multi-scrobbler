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
    source?: string
    timestamp?: number
}

interface BridgeNowPlayingResponse {
    ok: boolean
    source?: string
    fresh?: boolean
    data?: BridgeTrackData | null
}

interface SyntheticPlaybackState {
    key: string
    lastSeenAtMs: number
    lastPositionSec: number
    durationSec?: number
    reachedTrackEndAtMs?: number
}

export default class YandexMusicBridgeSource extends MemoryPositionalSource {

    declare config: YandexMusicBridgeSourceConfig;
    urlData!: URLData;
    private syntheticPlayback?: SyntheticPlaybackState;
    private lastBridgeData?: BridgeTrackData;
    private lastPlay?: PlayObject;
    private lastBridgeSeenAtMs?: number;
    private keepAliveMinSec = 90;
    private keepAlivePaddingSec = 120;
    private keepAliveHardCapSec = 600;
    private postEndStopGraceSec = 20;

    constructor(name: string, config: YandexMusicBridgeSourceConfig, internal: InternalConfig, emitter: EventEmitter) {
        super('ymbridge', name, config, internal, emitter);
        this.requiresAuth = false;
        this.canPoll = true;
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
            throw new UpstreamError('Bridge health endpoint did not return JSON', {responseBody: resp.body, showStopper: true});
        } catch (e: any) {
            const hint = e?.response?.text ?? e?.message ?? undefined;
            throw new UpstreamError(`Could not connect to Yandex Music bridge${hint !== undefined ? ` (${hint})` : ''}`, { cause: e, responseBody: e?.response?.text, showStopper: true });
        }
    }

    private async callBridge(): Promise<BridgeNowPlayingResponse> {
        const bridgeUrl = joinedUrl(this.urlData.url, 'now-playing').toString();
        const req = request.get(bridgeUrl).timeout({ response: 5000, deadline: 10000 });
        const apiKey = this.config.data?.apiKey;
        if (apiKey !== undefined && apiKey.trim() !== '') {
            req.set('X-API-Key', apiKey);
        }
        try {
            const resp = await req;
            if (resp.body === undefined || typeof resp.body !== 'object') {
                throw new UpstreamError('Bridge returned no JSON payload', {responseBody: resp.body, showStopper: true});
            }
            return resp.body as BridgeNowPlayingResponse;
        } catch (e) {
            throw new UpstreamError('Bridge not return an expected response', {responseBody: e?.response?.text, cause: e, showStopper: true});
        }
    }

    private resetSyntheticPlayback() {
        this.syntheticPlayback = undefined;
        this.lastBridgeData = undefined;
        this.lastPlay = undefined;
        this.lastBridgeSeenAtMs = undefined;
    }

    private getSyntheticKey(bridgeData: BridgeTrackData, play: PlayObject): string {
        const artists = Array.isArray(bridgeData.artists_list) && bridgeData.artists_list.length > 0
            ? bridgeData.artists_list.join(',')
            : (bridgeData.artists ?? play.data.artists?.join(',') ?? '');
        return [
            bridgeData.queue_id ?? '',
            bridgeData.track_id ?? '',
            bridgeData.title ?? play.data.track ?? '',
            artists,
            bridgeData.album ?? play.data.album ?? '',
        ].join('::');
    }

    private getPlaybackState(
        bridgeData: BridgeTrackData,
        play: PlayObject,
        options: { keepAlive?: boolean } = {},
    ): { status: typeof REPORTED_PLAYER_STATUSES.playing, position: number } {
        const { keepAlive = false } = options;
        const now = Date.now();
        const reportedPositionSec = bridgeData.progress_ms !== undefined && bridgeData.progress_ms !== null
            ? Math.max(0, bridgeData.progress_ms / 1000)
            : undefined;
        const durationSec = play.data.duration;
        const key = this.getSyntheticKey(bridgeData, play);

        if (this.syntheticPlayback === undefined || this.syntheticPlayback.key !== key) {
            const initialPosition = reportedPositionSec ?? play.meta.trackProgressPosition ?? 0;
            this.syntheticPlayback = {
                key,
                lastSeenAtMs: now,
                lastPositionSec: initialPosition,
                durationSec,
                reachedTrackEndAtMs: durationSec !== undefined && durationSec > 0 && initialPosition >= durationSec ? now : undefined,
            };
            return {
                status: REPORTED_PLAYER_STATUSES.playing,
                position: durationSec !== undefined && durationSec > 0 ? Math.min(initialPosition, durationSec) : initialPosition,
            };
        }

        const elapsedSec = Math.max(0, (now - this.syntheticPlayback.lastSeenAtMs) / 1000);
        const startingPoint = reportedPositionSec !== undefined
            ? Math.max(reportedPositionSec, this.syntheticPlayback.lastPositionSec)
            : this.syntheticPlayback.lastPositionSec;

        let nextPosition = startingPoint + elapsedSec;

        if (durationSec !== undefined && durationSec > 0) {
            // Never let synthetic time run past track duration. Once it reaches the end
            // we will keep the player alive briefly and then emit a synthetic STOP.
            if (nextPosition >= durationSec) {
                nextPosition = durationSec;
                if (this.syntheticPlayback.reachedTrackEndAtMs === undefined) {
                    this.syntheticPlayback.reachedTrackEndAtMs = now;
                }
            }
        }

        this.syntheticPlayback.lastSeenAtMs = now;
        this.syntheticPlayback.lastPositionSec = nextPosition;
        this.syntheticPlayback.durationSec = durationSec;

        return {
            status: REPORTED_PLAYER_STATUSES.playing,
            position: nextPosition,
        };
    }

    private shouldKeepAliveSynthetic(nowMs: number = Date.now()): boolean {
        if (this.syntheticPlayback === undefined || this.lastPlay === undefined || this.lastBridgeData === undefined || this.lastBridgeSeenAtMs === undefined) {
            return false;
        }

        const silenceSec = Math.max(0, (nowMs - this.lastBridgeSeenAtMs) / 1000);
        const durationSec = this.syntheticPlayback.durationSec ?? this.lastPlay.data.duration;
        const currentPosSec = this.syntheticPlayback.lastPositionSec ?? this.lastPlay.meta.trackProgressPosition ?? 0;

        let allowedSilenceSec = this.keepAliveMinSec;
        if (durationSec !== undefined && durationSec > 0) {
            const remainingSec = Math.max(0, durationSec - currentPosSec);
            allowedSilenceSec = Math.max(this.keepAliveMinSec, remainingSec + this.keepAlivePaddingSec);
        }
        allowedSilenceSec = Math.min(allowedSilenceSec, this.keepAliveHardCapSec);

        if (silenceSec <= allowedSilenceSec) {
            return true;
        }

        this.logger.debug(`Dropping synthetic keepalive after ${silenceSec.toFixed(0)}s without bridge data (allowed ${allowedSilenceSec.toFixed(0)}s)`);
        return false;
    }

    private shouldFinalizeSyntheticTrack(nowMs: number = Date.now()): boolean {
        if (this.syntheticPlayback === undefined || this.lastPlay === undefined) {
            return false;
        }
        const durationSec = this.syntheticPlayback.durationSec ?? this.lastPlay.data.duration;
        if (durationSec === undefined || durationSec <= 0) {
            return false;
        }
        if (this.syntheticPlayback.lastPositionSec < durationSec) {
            return false;
        }
        if (this.syntheticPlayback.reachedTrackEndAtMs === undefined) {
            this.syntheticPlayback.reachedTrackEndAtMs = nowMs;
            return false;
        }
        const sinceEndSec = Math.max(0, (nowMs - this.syntheticPlayback.reachedTrackEndAtMs) / 1000);
        return sinceEndSec >= this.postEndStopGraceSec;
    }

    private buildStoppedState(): PlayerStateDataMaybePlay | undefined {
        if (this.lastBridgeData === undefined) {
            return undefined;
        }
        return {
            platformId: [NO_DEVICE, NO_USER],
            sessionId: this.lastBridgeData.queue_id ?? this.lastBridgeData.track_id,
            status: REPORTED_PLAYER_STATUSES.stopped,
        };
    }

    getRecentlyPlayed = async (options: RecentlyPlayedOptions = {}) => {
        const payload = await this.callBridge();
        const bridgeData = payload.data;
        const nowMs = Date.now();

        if (payload.ok && bridgeData !== undefined && bridgeData !== null && bridgeData.title) {
            const play = formatPlayObj(bridgeData);
            const playbackState = this.getPlaybackState(bridgeData, play);
            this.lastBridgeData = bridgeData;
            this.lastPlay = play;
            this.lastBridgeSeenAtMs = nowMs;

            if (this.shouldFinalizeSyntheticTrack(nowMs)) {
                const durationSec = this.syntheticPlayback?.durationSec ?? play.data.duration ?? 0;
                this.logger.info(`Synthetic playback exceeded track duration for '${play.data.artists?.join(', ') ?? 'Unknown'} - ${play.data.track ?? 'Unknown'}'; emitting STOP after ${this.postEndStopGraceSec}s past track end at ${durationSec.toFixed(0)}s.`);
                const stoppedState = this.buildStoppedState();
                this.resetSyntheticPlayback();
                return await this.processRecentPlays(stoppedState !== undefined ? [stoppedState] : []);
            }

            const playerState: PlayerStateData = {
                platformId: [NO_DEVICE, NO_USER],
                sessionId: bridgeData.queue_id ?? bridgeData.track_id,
                status: playbackState.status,
                play,
                position: playbackState.position,
            };

            return await this.processRecentPlays([playerState]);
        }

        if (this.shouldKeepAliveSynthetic(nowMs)) {
            const bridgeDataForKeepAlive = this.lastBridgeData!;
            const playForKeepAlive = this.lastPlay!;
            const playbackState = this.getPlaybackState(bridgeDataForKeepAlive, playForKeepAlive, { keepAlive: true });

            if (this.shouldFinalizeSyntheticTrack(nowMs)) {
                const durationSec = this.syntheticPlayback?.durationSec ?? playForKeepAlive.data.duration ?? 0;
                this.logger.info(`Synthetic keepalive exceeded track duration for '${playForKeepAlive.data.artists?.join(', ') ?? 'Unknown'} - ${playForKeepAlive.data.track ?? 'Unknown'}'; emitting STOP after ${this.postEndStopGraceSec}s past track end at ${durationSec.toFixed(0)}s.`);
                const stoppedState = this.buildStoppedState();
                this.resetSyntheticPlayback();
                return await this.processRecentPlays(stoppedState !== undefined ? [stoppedState] : []);
            }

            this.logger.trace(`Bridge returned no current track; keeping synthetic playback alive for ${playForKeepAlive.data.artists?.join(', ') ?? 'Unknown'} - ${playForKeepAlive.data.track ?? 'Unknown'}`);

            const playerState: PlayerStateData = {
                platformId: [NO_DEVICE, NO_USER],
                sessionId: bridgeDataForKeepAlive.queue_id ?? bridgeDataForKeepAlive.track_id,
                status: REPORTED_PLAYER_STATUSES.playing,
                play: playForKeepAlive,
                position: playbackState.position,
            };

            return await this.processRecentPlays([playerState]);
        }

        this.resetSyntheticPlayback();
        return await this.processRecentPlays([]);
    }
}

const formatPlayObj = (obj: BridgeTrackData): PlayObject => {
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
            trackProgressPosition: obj.progress_ms !== undefined && obj.progress_ms !== null ? obj.progress_ms / 1000 : undefined,
            deviceId: NO_DEVICE,
            mediaPlayerName: 'Yandex Music',
            mediaPlayerVersion: 'bridge',
            comment: obj.track_id !== undefined ? `Yandex Track ${obj.track_id}` : undefined,
            art: obj.cover !== undefined && obj.cover !== null && obj.cover !== '' ? { album: obj.cover } : undefined,
        }
    }

    return baseFormatPlayObj(obj, play);
}
