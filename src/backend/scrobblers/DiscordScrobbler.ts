import { Logger } from "@foxxmd/logging";
import EventEmitter from "events";
import { PlayObject, SourcePlayerObj } from "../../core/Atomic.js";
import { CALCULATED_PLAYER_STATUSES, FormatPlayObjectOptions, REPORTED_PLAYER_STATUSES, ReportedPlayerStatus } from "../common/infrastructure/Atomic.js";
import { Notifiers } from "../notifier/Notifiers.js";

import AbstractScrobbleClient, { nowPlayingUpdateByPlayDuration } from "./AbstractScrobbleClient.js";
import { DiscordClientConfig, DiscordStrongData, StatusType } from "../common/infrastructure/config/client/discord.js";
import { configToStrong, DiscordWSClient, playStateToActivityData } from "../common/vendor/discord/DiscordWSClient.js";

export default class DiscordScrobbler extends AbstractScrobbleClient {

    api: DiscordWSClient;
    requiresAuth = true;
    requiresAuthInteraction = false;

    declare config: DiscordClientConfig & {data: DiscordStrongData };

    constructor(name: any, config: DiscordClientConfig, options = {}, notifier: Notifiers, emitter: EventEmitter, logger: Logger) {
        const strong = configToStrong(config.data);
        super('discord', name, {...config, data: strong}, notifier, emitter, logger);
        this.api = new DiscordWSClient(name, { ...strong, ...config.options }, { logger: this.logger });
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
                token,
                artwork = false
            } = {}
        } = this.config;
        if (token === undefined) {
            throw new Error('Must provide a user token');
        }
        if(typeof artwork === 'boolean') {
            this.logger.verbose(`Artwork: ${artwork ? 'Allow any non-known domains with HTTPS' : 'Allow no non-known domains'}`);
        } else if(artwork === 'string') {
            this.logger.verbose(`Artwork: Allow non-known domains with HTTPS containing: ${artwork.join(', ')}`);
        }
        this.logger.verbose(`Artwork Fallback Url: ${this.config.data.artworkDefaultUrl}`);
        this.logger.verbose(`Allow override statuses: ${this.config.data.statusOverrideAllow.join(', ')}`);
        this.logger.verbose(`Allow override activity types: ${this.config.data.activitiesOverrideAllow.join(', ')}`);
        this.logger.verbose(`Disallow override activity names: ${this.config.data.applicationsOverrideDisallow.join(', ')}`);
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
        if ([CALCULATED_PLAYER_STATUSES.stopped, CALCULATED_PLAYER_STATUSES.paused, CALCULATED_PLAYER_STATUSES.playing].includes(data.status.calculated as ReportedPlayerStatus)
            || data.status.stale) {

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

        }
        return false;
    }
}
