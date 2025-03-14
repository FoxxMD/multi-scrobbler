import { MemoryPositionalSource } from "./MemoryPositionalSource.js";
import { sleep } from "../utils.js";
import { RecentlyPlayedOptions } from "./AbstractSource.js";
import { childLogger, Logger } from "@foxxmd/logging";
import { EventEmitter } from "events";
import { WS, CloseEvent, ErrorEvent, RetryEvent } from 'iso-websocket'
import pEvent from 'p-event';
import { PlayObject, URLData } from "../../core/Atomic.js";
import { UpstreamError } from "../common/errors/UpstreamError.js";
import {
    FormatPlayObjectOptions,
    InternalConfig,
    PlayerStateData,
    PlayPlatformId,
    REPORTED_PLAYER_STATUSES,
    SINGLE_USER_PLATFORM_ID,
} from "../common/infrastructure/Atomic.js";
import { AzuracastSourceConfig, AzuraNowPlayingResponse, AzuraStationResponse } from "../common/infrastructure/config/source/azuracast.js";
import { isPortReachable, normalizeWSAddress } from "../utils/NetworkUtils.js";
import { PlayerStateOptions } from "./PlayerState/AbstractPlayerState.js";
import { AzuracastPlayerState } from "./PlayerState/AzuracastPlayerState.js";


export class AzuracastSource extends MemoryPositionalSource {

    declare config: AzuracastSourceConfig;

    urlData!: URLData;

    wsNowPlaying: AzuraStationResponse
    wsCurrenTime: number = 0;
    client!: WS;


    constructor(name: any, config: AzuracastSourceConfig, internal: InternalConfig, emitter: EventEmitter) {
        const {
            data = {}
        } = config;
        const {
            ...rest
        } = data;
        super('azuracast', name, { ...config, data: { ...rest } }, internal, emitter);

        const {
            data: {
                url,
            } = {}
        } = config;
        this.requiresAuth = false;
        this.canPoll = true;
        this.supportsManualListening = true;
    }

    protected async doBuildInitData(): Promise<true | string | undefined> {
        const {
            data: {
                url
            } = {}
        } = this.config;
        if (url === null || url === undefined || url === '') {
            throw new Error('url must be defined');
        }
        this.urlData = normalizeWSAddress(url, { defaultPath: '/api/live/nowplaying/websocket' });
        const normal = this.urlData.normal;
        this.logger.verbose(`Config URL: '${url ?? '(None Given)'}' => Normalized: '${normal}'`)
        if (!normal.includes('ws://') && !normal.includes('wss://')) {
            throw new Error(`Server URL must be start with with ws:// or wss://`);
        }
        this.client = new WS(this.urlData.url.toString(), {
            automaticOpen: false,
            retry: {
                retries: 0
            }
        });
        const wsLogger = childLogger(this.logger, 'WS');
        this.client.addEventListener('retry', (e) => {
            wsLogger.verbose(`Retrying connection, attempt ${e.attempt}`, { labels: 'WS' });
        });
        this.client.addEventListener('close', (e) => {
            wsLogger.warn(`Connection was closed: ${e.code} => ${e.reason}`, { labels: 'WS' });
            if (e.reason.includes('unauthenticated')) {
                this.authed = false;
            }
        });
        this.client.addEventListener('open', (e) => {
            wsLogger.verbose(`Connection was established.`, { labels: 'WS' });
            // if (this.authed) {
            //     // was a reconnect, try auto authenticating
            //     wsLogger.verbose('Resending auth message after (probably) reconnection...');
            //     this.client.send(JSON.stringify(this.getAuthPayload()));
            // }
        });
        this.client.addEventListener('error', (e) => {
            if (e.message.includes('Connection failed after')) {
                this.connectionOK = false;
                //this.authed = false;
            }
            const hint = e.error?.cause?.message ?? undefined;
            wsLogger.error(new Error(`Communication with server failed${hint !== undefined ? ` (${hint})` : ''}`, { cause: e.error }));
        });

        this.client.addEventListener('message', (e) => {
            this.parseWSData(getMessageData<any>(e));
            // if (isAuthenticateResponse(data)) {
            //     wsLogger.verbose(`${!data.options.authenticated ? 'NOT ' : ''}Authenticated for Muiskcube ${data.options.environment.app_version} with API v${data.options.environment.api_version}`);
            // }
        });
        return true;
    }

    private parseWSPayload(payload: any, useTime = true) {
        const jsonData = payload.data;

        if (useTime && 'current_time' in jsonData) {
            this.wsCurrenTime = jsonData.current_time;
        }

        this.wsNowPlaying = jsonData.np as AzuraStationResponse;
    }

    private parseWSData(jsonData: any) {

        if ('connect' in jsonData) {
            const connectData = jsonData.connect;

            if ('data' in connectData) {
                // Legacy SSE data
                connectData.data.forEach(
                    (initialRow) => this.parseWSPayload(initialRow)
                );
            } else {
                // New Centrifugo time format
                if ('time' in connectData) {
                    this.wsCurrenTime = Math.floor(connectData.time / 1000);
                }

                // New Centrifugo cached NowPlaying initial push.
                for (const subName in connectData.subs) {
                    const sub = connectData.subs[subName];
                    if ('publications' in sub && sub.publications.length > 0) {
                        sub.publications.forEach((initialRow) => this.parseWSPayload(initialRow, false));
                    }
                }
            }
        } else if ('pub' in jsonData) {
            this.parseWSPayload(jsonData.pub);
        }
    }

    protected async doCheckConnection(): Promise<true | string | undefined> {
        try {
            try {
                await isPortReachable(this.urlData.port, { host: this.urlData.url.hostname });
                this.logger.verbose(`${this.urlData.url.hostname}:${this.urlData.port} is reachable.`);
            } catch (e) {
                throw e;
            }

            this.client.open();
            const opened = await pEvent(this.client, 'open');
            return true;
        } catch (e) {
            this.client.close();
            const hint = e.error?.cause?.message ?? undefined;
            throw new Error(`Could not connect to Azuracast server${hint !== undefined ? ` (${hint})` : ''}`, { cause: e.error ?? e });
        }
    }

    onPollPostAuthCheck = async (): Promise<boolean> => {
        this.logger.verbose(`Listening for activity on Station ${this.config.data.station}`);
        this.client.send(JSON.stringify({
            subs: {
                [`station:${this.config.data.station}`]: { "recover": true }
            }
        }));
        return true;
    }

    // TODO return based on user intervention
    protected isStationValidListen = () => {
        if(this.wsNowPlaying === undefined) {
            this.logger.debug({labels: `Station ${this.config.data.station}`}, `No data returned yet (check station name is correct?)`);
            return false;
        }
        if(!this.wsNowPlaying.is_online && this.config.data.monitorWhenLive) {
            this.logger.debug({labels: `Station ${this.config.data.station}`}, `Currently offline`);
            return false;
        }
        if(this.manualListening !== undefined) {
            this.logger.debug({labels: `Station ${this.config.data.station}`}, `Using manual listening status ${this.manualListening}`);
            return this.manualListening;
        }
        if(this.config.data.monitorWhenListeners !== undefined) {
            if(this.config.data.monitorWhenListeners === true && this.wsNowPlaying.listeners.current === 0) {
                this.logger.debug({labels: `Station ${this.config.data.station}`}, `No listeners`);
                return false;
            }
            if(typeof this.config.data.monitorWhenListeners === 'number' && this.wsNowPlaying.listeners.current < this.config.data.monitorWhenListeners) {
                this.logger.debug({labels: `Station ${this.config.data.station}`}, `Requries ${this.config.data.monitorWhenListeners} listeners to be active but currently only ${this.wsNowPlaying.listeners.current}`);
                return false;
            }
        }
        return true;
    }

    getRecentlyPlayed = async (options: RecentlyPlayedOptions = {}) => {
        if (this.client.readyState !== this.client.OPEN) {
            throw new Error('WS connection is no longer open.');
        }

        let play: PlayObject | undefined;
        const online = this.isStationValidListen();

        if(this.isStationValidListen() && this.wsNowPlaying.now_playing !== undefined) {
            play = formatPlayObj(this.wsNowPlaying.now_playing);
        }

        const playerState: PlayerStateData = {
            platformId: SINGLE_USER_PLATFORM_ID,
            status: online ? REPORTED_PLAYER_STATUSES.playing : REPORTED_PLAYER_STATUSES.stopped,
            play,
            position: online && play !== undefined ? play.meta.trackProgressPosition : undefined
        }

        return this.processRecentPlays([playerState]);
    }

        getNewPlayer = (logger: Logger, id: PlayPlatformId, opts: PlayerStateOptions) => new AzuracastPlayerState(logger, id, opts);
}

const formatPlayObj = (obj: AzuraNowPlayingResponse, options: FormatPlayObjectOptions = {}): PlayObject => {

    const {
        song,
        duration,
        elapsed,
        remaining,
    } = obj;

    const {
        text,
        artist,
        title,
        album
    } = song;

    const track: string = title ?? text;

    return {
        data: {
            artists: artist !== undefined && artist !== '' ? [artist] : [],
            album: album !== '' ? album : undefined,
            track,
            duration
        },
        meta: {
            trackProgressPosition: elapsed
        }
    }
}

const getMessageData = <T>(e: any): T => {
    return JSON.parse(e.data) as T;
}

const isCloseEvent = (e: Event): e is CloseEvent => {
    return e.type === 'close';
}
const isErrorEvent = (e: Event): e is ErrorEvent => {
    return e.type === 'error';
}
const isRetryEvent = (e: Event): e is RetryEvent => {
    return e.type === 'retry';
}
