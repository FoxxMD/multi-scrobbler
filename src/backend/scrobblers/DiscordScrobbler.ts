import { Logger } from "@foxxmd/logging";
import EventEmitter from "events";
import { PlayObject, SourcePlayerObj } from "../../core/Atomic.js";
import { CALCULATED_PLAYER_STATUSES, CalculatedPlayerStatus, FormatPlayObjectOptions, REPORTED_PLAYER_STATUSES, ReportedPlayerStatus } from "../common/infrastructure/Atomic.js";
import { Notifiers } from "../notifier/Notifiers.js";

import AbstractScrobbleClient, { nowPlayingUpdateByPlayDuration } from "./AbstractScrobbleClient.js";
import { DiscordClientConfig } from "../common/infrastructure/config/client/discord.js";
import { DiscordWSClient, playStateToActivityData } from "../common/vendor/discord/DiscordWSClient.js";
import { PresenceUpdateStatus } from "discord.js";

export default class DiscordScrobbler extends AbstractScrobbleClient {

    api: DiscordWSClient;
    requiresAuth = true;
    requiresAuthInteraction = false;

    declare config: DiscordClientConfig;

    constructor(name: any, config: DiscordClientConfig, options = {}, notifier: Notifiers, emitter: EventEmitter, logger: Logger) {
        super('discord', name, config, notifier, emitter, logger);
        this.api = new DiscordWSClient(name, { ...config.data, ...config.options }, { logger: this.logger });
        this.api.emitter.on('stopped', async (e) => {
            if(e.authFailure) {
                this.authFailure = true;
                this.authed = false;
            }
            await this.tryStopScrobbling();
        });
        this.supportsNowPlaying = true;
        this.nowPlayingMaxThreshold = nowPlayingUpdateByPlayDuration;
        this.nowPlayingMinThreshold = (_) => 5;
    }

    formatPlayObj = (obj: any, options: FormatPlayObjectOptions = {}) => obj;

    protected async doBuildInitData(): Promise<true | string | undefined> {
        const {
            data: {
                token
            } = {}
        } = this.config;
        if (token === undefined) {
            throw new Error('Must provide a user token');
        }
        await this.api.initClient();
        return true;
    }

    doAuthentication = async () => {

        try {
            return await this.api.connect();
        } catch (e) {
            throw e;
        }
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
        if(data.status.reported === REPORTED_PLAYER_STATUSES.playing
             || [CALCULATED_PLAYER_STATUSES.stopped, CALCULATED_PLAYER_STATUSES.paused].includes(data.status.calculated as ReportedPlayerStatus)
             || data.status.stale)
        if ([PresenceUpdateStatus.Offline, PresenceUpdateStatus.Invisible].includes(this.api.lastActiveStatus)) {
            this.logger.debug('Not updating presence because no user sessions have a visible status');
            return false;
        }
        const [sendOk, reasons] = this.api.checkOkToSend();
        if (!sendOk) {
            this.logger.warn(`Cannot update playing now because api client is ${reasons}`);
            return false;
        }
        return true;
    }
}
