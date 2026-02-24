import { Logger } from "@foxxmd/logging";
import EventEmitter from "events";
import { PlayObject, SourcePlayerObj } from "../../core/Atomic.js";
import { CALCULATED_PLAYER_STATUSES, FormatPlayObjectOptions, REPORTED_PLAYER_STATUSES, ReportedPlayerStatus } from "../common/infrastructure/Atomic.js";
import { Notifiers } from "../notifier/Notifiers.js";

import AbstractScrobbleClient, { nowPlayingUpdateByPlayDuration } from "./AbstractScrobbleClient.js";
import { DiscordClientConfig, DiscordStrongData } from "../common/infrastructure/config/client/discord.js";
import { DiscordWSClient } from "../common/vendor/discord/DiscordWSClient.js";
import { configToStrong } from "../common/vendor/discord/DiscordUtils.js";
import { DiscordIPCClient } from "../common/vendor/discord/DiscordIPCClient.js";
import { playStateToActivityData } from "../common/vendor/discord/DiscordUtils.js";

export default class DiscordScrobbler extends AbstractScrobbleClient {

    api: DiscordWSClient | DiscordIPCClient;
    requiresAuth = true;
    requiresAuthInteraction = false;
    apiMode!: 'ws' | 'ipc';

    declare config: DiscordClientConfig & {data: DiscordStrongData };

    constructor(name: any, config: DiscordClientConfig, options = {}, notifier: Notifiers, emitter: EventEmitter, logger: Logger) {
        const strong = configToStrong(config.data);
        super('discord', name, {...config, data: strong}, notifier, emitter, logger);
        this.supportsNowPlaying = true;
        this.nowPlayingMaxThreshold = nowPlayingUpdateByPlayDuration;
        this.nowPlayingMinThreshold = (_) => 5;
    }

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
            this.api.emitter.on('stopped', async (e) => {
                if(e.authFailure) {
                    this.authFailure = true;
                    this.authed = false;
                    this.connectionOK = false;
                } else {
                    this.authFailure = false;
                    this.authed = false;
                    this.connectionOK = false;
                }
                await this.tryStopScrobbling();
            });
        } else if(applicationId !== undefined) {
            this.logger.info('Detected applicationId, using IPC Discord Client');
            this.api = new DiscordIPCClient(this.name, { ...this.config.data, ...this.config.options }, { logger: this.logger });
            this.apiMode = 'ipc';
        } else {
            throw new Error('Config must include token, applicationId, or both');
        }

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
            throw e;
        }
    }

    doAuthentication = async () => {

        if (this.api instanceof DiscordWSClient) {
            try {
                await this.api.tryAuthenticate();
                return true;
            } catch (e) {
                throw e;
            }
        }
        return true;
    }

    getScrobblesForRefresh = async (limit: number) => {
        return [];
    }

    alreadyScrobbled = async (playObj: PlayObject, log = false) => true

    public playToClientPayload(playObj: PlayObject): any {
        return playStateToActivityData(playObj).activity;
    }

    doScrobble = async (playObj: PlayObject) => {
        return { play: playObj, payload: {} };
    }

    doPlayingNow = async (data: SourcePlayerObj) => {
        try {
            if([CALCULATED_PLAYER_STATUSES.stopped, CALCULATED_PLAYER_STATUSES.paused].includes(data.status.calculated as ReportedPlayerStatus)) {
                await this.api.sendActivity(undefined);
            } else {
                await this.api.sendActivity(data.play);
            }
        } catch (e) {
            throw e;
        }
    }

    shouldUpdatePlayingNowPlatformSpecific = async (data: SourcePlayerObj) => {
        if ([CALCULATED_PLAYER_STATUSES.stopped, CALCULATED_PLAYER_STATUSES.paused, CALCULATED_PLAYER_STATUSES.playing].includes(data.status.calculated as ReportedPlayerStatus)
            || data.status.stale) {

            if(this.api instanceof DiscordWSClient) {
                const [sendOk, reasons] = this.api.checkOkToSend();
                if (!sendOk) {
                    this.logger.warn(`Cannot update playing now because api client is ${reasons}`);
                    return false;
                }

                const [allowed, reason] = this.api.presenceIsAllowed();
                if(!allowed) {
                    this.logger.debug(reason);
                }

                return true;
            } else {
                if(!this.api.ready) {
                    return false;
                }
                return true;
            }
        }
    }
}
