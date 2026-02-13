import { Logger } from "@foxxmd/logging";
import EventEmitter from "events";
import { PlayObject } from "../../core/Atomic.js";
import { FormatPlayObjectOptions } from "../common/infrastructure/Atomic.js";
import { Notifiers } from "../notifier/Notifiers.js";

import AbstractScrobbleClient, { nowPlayingUpdateByPlayDuration } from "./AbstractScrobbleClient.js";
import { DiscordClientConfig } from "../common/infrastructure/config/client/discord.js";
import { DiscordWSClient } from "../common/vendor/discord/DiscordWSClient.js";

export default class DiscordScrobbler extends AbstractScrobbleClient {

    api: DiscordWSClient;
    requiresAuth = true;
    requiresAuthInteraction = false;

    declare config: DiscordClientConfig;

    constructor(name: any, config: DiscordClientConfig, options = {}, notifier: Notifiers, emitter: EventEmitter, logger: Logger) {
        super('discord', name, config, notifier, emitter, logger);
        this.api = new DiscordWSClient(name, { ...config.data, ...config.options }, { logger: this.logger });
        this.supportsNowPlaying = true;
        this.nowPlayingMaxThreshold = nowPlayingUpdateByPlayDuration;
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
        return this.api.playStateToActivity(playObj);
    }

    doScrobble = async (playObj: PlayObject) => {
        return { play: playObj, payload: {} };
    }

    doPlayingNow = async (data: PlayObject) => {
        try {
            await this.api.sendActivity(data);
        } catch (e) {
            throw e;
        }
    }
}
