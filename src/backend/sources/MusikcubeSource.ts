import { childLogger } from "@foxxmd/logging";
import { EventEmitter } from "events";
import { WS, CloseEvent, ErrorEvent, RetryEvent } from 'iso-websocket'
import { randomUUID } from "node:crypto";
import normalizeUrl from 'normalize-url';
import pEvent from 'p-event';
import { URL } from "url";
import { PlayObject, URLData } from "../../core/Atomic.ts";
import { UpstreamError } from "../common/errors/UpstreamError.ts";
import {
    FormatPlayObjectOptions,
    InternalConfig,
    PlayerStateData,
    SINGLE_USER_PLATFORM_ID,
} from "../common/infrastructure/Atomic.ts";
import {
    MCAuthenticateRequest,
    MCAuthenticateResponse,
    MCPlaybackOverviewRequest,
    MCPlaybackOverviewResponse,
    MusikcubeSourceConfig
} from "../common/infrastructure/config/source/musikcube.ts";
import { sleep } from "../utils.ts";
import { RecentlyPlayedOptions } from "./AbstractSource.ts";
import { MemoryPositionalSource } from "./MemoryPositionalSource.ts";
import { normalizeWSAddress } from "../utils/NetworkUtils.ts";

const CLIENT_STATE = {
    0: 'connecting',
    1: 'open',
    2: 'closing',
    3: 'closed'
}

export class MusikcubeSource extends MemoryPositionalSource {
    declare config: MusikcubeSourceConfig;

    url: URLData;


    client!: WS;
    deviceId: string

    constructor(name: any, config: MusikcubeSourceConfig, internal: InternalConfig, emitter: EventEmitter) {
        const {
            data = {}
        } = config;
        const {
            ...rest
        } = data;
        super('musikcube', name, {...config, data: {...rest}}, internal, emitter);

        const {
            data: {
                url = 'ws://localhost:7905',
                device_id
            } = {}
        } = config;
        this.deviceId = device_id ?? name;
        this.url = normalizeWSAddress(url, {defaultPort: 7905});
        this.requiresAuth = true;
        this.canPoll = true;
    }

    protected async doBuildInitData(): Promise<true | string | undefined> {
        const {
            data: {
                url
            } = {}
        } = this.config;
        const normal = this.url.normal;
        this.logger.verbose(`Config URL: '${url ?? '(None Given)'}' => Normalized: '${normal}'`)
        if (!normal.includes('ws://') && !normal.includes('wss://')) {
            throw new Error(`Server URL must start with ws:// or wss://`);
        }
        this.client = new WS(this.url.url.toString(), {
            automaticOpen: false,
            retry: {
                retries: 0
            }
        });
        const wsLogger = childLogger(this.logger, 'WS');
        this.client.addEventListener('retry', (e) => {
            wsLogger.verbose(`Retrying connection, attempt ${e.attempt}`, {labels: 'WS'});
        });
        this.client.addEventListener('close', (e) => {
            wsLogger.warn(`Connection was closed: ${e.code} => ${e.reason}`, {labels: 'WS'});
            if (e.reason.includes('unauthenticated')) {
                this.authed = false;
            }
        });
        this.client.addEventListener('open', (e) => {
            wsLogger.verbose(`Connection was established.`, {labels: 'WS'});
            if (this.authed) {
                // was a reconnect, try auto authenticating
                wsLogger.verbose('Resending auth message after (probably) reconnection...');
                this.client.send(JSON.stringify(this.getAuthPayload()));
            }
        });
        this.client.addEventListener('error', (e) => {
            if (e.message.includes('Connection failed after')) {
                this.connectionOK = false;
                this.authed = false;
            }
            const hint = e.error?.cause?.message ?? undefined;
            wsLogger.error(new Error(`Communication with server failed${hint !== undefined ? ` (${hint})` : ''}`, {cause: e.error}));
        });

        this.client.addEventListener('message', (e) => {
            const data = getMessageData<any>(e);
            if(isAuthenticateResponse(data)) {
                wsLogger.verbose(`${!data.options.authenticated ? 'NOT ' : ''}Authenticated for Muiskcube ${data.options.environment.app_version} with API v${data.options.environment.api_version}`);
            }
        });
        return true;
    }

    protected async doCheckConnection(): Promise<true | string | undefined> {
        try {
            this.client.open();
            const opened = await pEvent(this.client, 'open');
            return true;
        } catch (e) {
            this.client.close();
            const hint = e.error?.cause?.message ?? undefined;
            throw new Error(`Could not connect to Musikcube metadata server${hint !== undefined ? ` (${hint})` : ''}`, {cause: e.error ?? e});
        }

    }

    protected getAuthPayload = (): MCAuthenticateRequest => {
        return {
            name: 'authenticate',
            type: 'request',
            id: randomUUID(),
            device_id: this.deviceId,
            options: {
                password: this.config.data.password
            }
        }
    }

    doAuthentication = async () => {
        try {
            const authRace = Promise.race([
                pEvent(this.client, 'message'),
                pEvent(this.client, 'close'),
                sleep(2000),
            ]);
            this.client.send(JSON.stringify(this.getAuthPayload()));
            const authE = await authRace;
            if(authE === undefined) {
                throw new Error('Musikcube did not respond to auth message after 2000 ms');
            } else if(isCloseEvent(authE)) {
                throw new Error(`Password is not correct: ${authE.code} => ${authE.reason}`);
            } else if(isErrorEvent(authE)) {
                throw new Error(`Unexpected error occurred while authenticating: ${authE.message}`, {cause: authE.error});
            }

            return true;
        } catch (e) {
            throw e;
        }
    }

    formatPlayObj(obj: MCPlaybackOverviewResponse, options: FormatPlayObjectOptions = {}): PlayObject {
        const {
            options: {
                playing_duration,
                playing_current_time,
                playing_track: {
                    album,
                    album_artist,
                    artist,
                    title,
                    id,
                    external_id
                }
            },
        } = obj;
        const artists = [];
        const albumArtists = [];
        if(artist !== undefined) {
            artists.push(artist);
        }
        if(album_artist !== undefined && album_artist !== artist) {
            albumArtists.push(album_artist);
        }
        return {
            data: {
                artists: artists,
                albumArtists,
                album: album === '' ? undefined : album,
                track: title === '' ? undefined: title,
                duration: playing_duration
            },
            meta: {
                trackProgressPosition: playing_current_time,
                deviceId: this.deviceId,
                trackId: external_id
            }
        }
    }

    getRecentlyPlayed = async (options: RecentlyPlayedOptions = {}) => {
        if (this.client.readyState !== this.client.OPEN) {
            throw new Error('WS connection is no longer open.');
        }

        const overviewPayload: MCPlaybackOverviewRequest = {
            name: 'get_playback_overview',
            type: 'request',
            device_id: this.deviceId,
            id: randomUUID()
        }

        const messageEventPromise = pEvent(this.client, 'message');
        this.client.send(JSON.stringify(overviewPayload));
        const messageEvent = await Promise.race([
            messageEventPromise,
            sleep(2000),
        ]);

        if(messageEvent === undefined) {
            throw new UpstreamError('Did not receive playback message after waiting 2000ms');
        }

        const playbackOverview = getMessageData<MCPlaybackOverviewResponse>(messageEvent)

        const play: PlayObject | undefined = playbackOverview.options.playing_track === undefined ? undefined : this.formatPlayObj(playbackOverview);

        const playerState: PlayerStateData = {
            platformId: SINGLE_USER_PLATFORM_ID,
            status: playbackOverview.options.state,
            play,
            position: playbackOverview.options.playing_current_time
        }

        return this.processRecentPlays([playerState]);
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

const isAuthenticateResponse = (data: any): data is MCAuthenticateResponse => {
    return 'name' in data && data.name === 'authenticate';
}
