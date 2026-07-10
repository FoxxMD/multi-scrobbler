import type {Logger, LogLevel} from "@foxxmd/logging";
import type EventEmitter from "events";
import type {PlayMatchResult, PlayObject, SourcePlayerObj} from "../../core/Atomic.ts";
import { type FormatPlayObjectOptions, SINGLE_USER_PLATFORM_ID_STR } from "../common/infrastructure/Atomic.ts";
import { CALCULATED_PLAYER_STATUSES } from '../../core/Atomic.ts';
import { REPORTED_PLAYER_STATUSES } from '../../core/Atomic.ts';

import AbstractScrobbleClient, { nowPlayingUpdateByPlayDuration, shouldClearNPStatus } from "./AbstractScrobbleClient.ts";
import type {DiscordClientConfig, DiscordStrongData} from "../common/infrastructure/config/client/discord.ts";
import { DiscordWSClient } from "../common/vendor/discord/DiscordWSClient.ts";
import { configToStrong } from "../common/vendor/discord/DiscordUtils.ts";
import { DiscordIPCClient } from "../common/vendor/discord/DiscordIPCClient.ts";
import { playStateToActivityData } from "../common/vendor/discord/DiscordUtils.ts";
import { mergeSimpleError, SimpleError } from "../common/errors/MSErrors.ts";
import dayjs from "dayjs";

export default class DiscordScrobbler extends AbstractScrobbleClient {

    api: DiscordWSClient | DiscordIPCClient;
    requiresAuth = true;
    requiresAuthInteraction = false;
    override nowPlayingIsRealtime: boolean = true;
    apiMode!: 'ws' | 'ipc';

    declare config: DiscordClientConfig & {data: DiscordStrongData };

    constructor(name: any, config: DiscordClientConfig, options = {}, emitter: EventEmitter, logger: Logger) {
        const strong = configToStrong(config.data);
        super('discord', name, {...config, data: strong}, emitter, logger);
        this.supportsNowPlaying = true;
        this.nowPlayingMaxThreshold = nowPlayingUpdateByPlayDuration;
        this.nowPlayingMinThreshold = (_) => 5;
    }

    getScrobblesForTimeRange = async (_) => [];

    formatPlayObj = (obj: any, options: FormatPlayObjectOptions = {}) => obj;

    protected async doBuildInitData(): Promise<true | string | undefined> {
        const {
            data: {
                token,
                applicationId,
                artwork = false
            } = {}
        } = this.config;

        if(token !== undefined) {
            this.logger.info('Detected token, using WS (Headless) Discord Client');
            this.apiMode = 'ws';

            this.logger.verbose(`Allow override statuses: ${this.config.data.statusOverrideAllow.join(', ')}`);
            this.logger.verbose(`Allow broadcasting during other listening activities: ${this.config.data.listeningActivityAllow.join(', ')}`);
            this.api = new DiscordWSClient(this.name, { ...this.config.data, ...this.config.options }, { logger: this.logger });
        } else if(applicationId !== undefined) {
            this.logger.info('Detected applicationId, using IPC Discord Client');
            this.api = new DiscordIPCClient(this.name, { ...this.config.data, ...this.config.options }, { logger: this.logger });
            this.apiMode = 'ipc';
        } else {
            throw new Error('Config must include token, applicationId, or both');
        }

        this.api.emitter.on('stopped', async (e) => {
            if(e.authFailure) {
                this.authFailure = true;
                this.authed = false;
                this.connectionOK = this.api instanceof DiscordIPCClient ? true : false;
            } else {
                this.authFailure = false;
                this.authed = false;
                this.connectionOK = false;
            }
            await this.tryStopScrobbling();
        });

        if(typeof artwork === 'boolean') {
            this.logger.verbose(`Artwork: ${artwork ? 'Allow any non-known domains with HTTPS' : 'Allow no non-known domains'}`);
        } else if(artwork === 'string') {
            this.logger.verbose(`Artwork: Allow non-known domains with HTTPS containing: ${artwork.join(', ')}`);
        }
        this.logger.verbose(`Artwork Fallback Url: ${this.config.data.artworkDefaultUrl}`);

        if(this.api instanceof DiscordWSClient) {
            await this.api.fetchGatewayUrl();
        }

        await this.api.initClient();
        return true;
    }

    protected async doCheckConnection(): Promise<true | string | undefined> {
        try {
            await this.api.tryConnect();
            return true;
        } catch (e) {
            if(this.api instanceof DiscordIPCClient) {
                if(e.message.includes(4000)) {
                    // swallow this for now since we know that comms work but auth is bad
                    return true;
                } else {
                    const err = new SimpleError('Ignoring IPC connection failure. This will be retried each time Now Playing is updated.', {cause: e, shortStack: true});
                    mergeSimpleError(err);
                    this.logger.warn(err);
                    return true;
                }
            }
            throw e;
        }
    }

    doAuthentication = async () => {

        try {
            await this.api.tryAuthenticate();
            return true;
        } catch (e) {
            throw e;
        }
    }

    queueScrobble = async (data: PlayObject | PlayObject[], source: string) => {
        // discord does not handle scrobbles, only Now Playing
        // so don't bother queueing any scrobbles as we don't want to cache them
        // or give the user the impression they are used (in UI as a number of queued scrobbles)
        return [];
    }

    alreadyScrobbled = async (playObj: PlayObject, log = false): Promise<[boolean, PlayMatchResult]> => ([false, {match: false, breakdowns: [], score: 0, createdAt: dayjs().toISOString()}])

    public playToClientPayload(playObj: PlayObject): any {
        return playStateToActivityData({
            play: playObj, 
            platformId: SINGLE_USER_PLATFORM_ID_STR,
            playerLastUpdatedAt: dayjs().toISOString(),
            listenedDuration: 0,
            status: {
                reported: REPORTED_PLAYER_STATUSES.unknown,
                calculated: CALCULATED_PLAYER_STATUSES.unknown,
                stale: false,
                orphaned: false
            }
        }).activity;
    }

    doScrobble = async (playObj: PlayObject) => {
        return { play: playObj, payload: {}, createdAt: dayjs().toISOString() };
    }

    doPlayingNow = async (data: SourcePlayerObj) => {
        try {
            if(shouldClearNPStatus(data)) {
                await this.api.sendActivity(undefined);
            } else {
                await this.api.sendActivity(data);
            }
        } catch (e) {
            throw e;
        }
    }

    shouldUpdatePlayingNowPlatformSpecific = async (data: SourcePlayerObj): Promise<[boolean, string?, LogLevel?]> => {
        const [sendOk, reasons, level = 'warn'] = await this.api.checkOkToSend();
        if (!sendOk) {
            return [false, `Cannot update playing now because api client is ${reasons}`, level as LogLevel];
        }

        if(this.api instanceof DiscordWSClient) {
            const [allowed, reason] = this.api.presenceIsAllowed();
            if(!allowed) {
                this.npLogger.debug(reason);
                return [false, reason];
            }
        }

        return [true];
    }
}
