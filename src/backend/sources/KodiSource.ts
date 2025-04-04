import { EventEmitter } from "events";
import { PlayObject } from "../../core/Atomic.ts";
import { FormatPlayObjectOptions, InternalConfig } from "../common/infrastructure/Atomic.ts";
import { KodiSourceConfig } from "../common/infrastructure/config/source/kodi.ts";
import { KodiApiClient } from "../common/vendor/KodiApiClient.ts";
import { RecentlyPlayedOptions } from "./AbstractSource.ts";
import { MemoryPositionalSource } from "./MemoryPositionalSource.ts";

export class KodiSource extends MemoryPositionalSource {
    declare config: KodiSourceConfig;

    client: KodiApiClient;
    clientReady: boolean = false;

    constructor(name: any, config: KodiSourceConfig, internal: InternalConfig, emitter: EventEmitter) {
        const {
            data,
        } = config;
        const {
            ...rest
        } = data || {};
        super('kodi', name, {...config, data: {...rest}}, internal, emitter);

        this.requiresAuth = true;
        this.canPoll = true;
        this.multiPlatform = true;
    }

    protected async doBuildInitData(): Promise<true | string | undefined> {
        const {
            data: {
                url
            } = {}
        } = this.config;
        this.client = new KodiApiClient(this.name, this.config.data, {logger: this.logger});
        this.logger.verbose(`Config URL: '${url ?? '(None Given)'}' => Normalized: '${this.client.url.toString()}'`)
        return true;
    }

    doAuthentication = async () => {
        try {
            const resp = await this.client.testAuth();
            this.clientReady = true;
            return true;
        } catch (e) {
            throw e;
        }
    }

    static formatPlayObj(obj: any, options: FormatPlayObjectOptions = {}): PlayObject {
        return KodiApiClient.formatPlayObj(obj, options);
    }

    getRecentlyPlayed = async (options: RecentlyPlayedOptions = {}) => {
        if (!this.clientReady) {
            this.logger.warn('Cannot actively poll since client is not connected.');
            return [];
        }

        const play = await this.client.getRecentlyPlayed(options);

        return this.processRecentPlays(play);
    }

}
