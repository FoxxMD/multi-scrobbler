import { childLogger, Logger } from "@foxxmd/logging";
import EventEmitter from "events";
import normalizeUrl from "normalize-url";
import { PlayObject } from "../../core/Atomic.js";
import { buildTrackString, capitalize } from "../../core/StringUtils.js";
import { isNodeNetworkException } from "../common/errors/NodeErrors.js";
import { FormatPlayObjectOptions } from "../common/infrastructure/Atomic.js";
import { MalojaClientConfig } from "../common/infrastructure/config/client/maloja.js";
import {
    MalojaScrobbleRequestData,
} from "../common/vendor/maloja/interfaces.js";
import { Notifiers } from "../notifier/Notifiers.js";
import AbstractScrobbleClient from "./AbstractScrobbleClient.js";
import { MalojaApiClient, formatPlayObj as formatMalojaScrobbleToPlay, playToScrobblePayload } from "../common/vendor/maloja/MalojaApiClient.js";
import { ScrobbleSubmitError } from "../common/errors/MSErrors.js";

const feat = ["ft.", "ft", "feat.", "feat", "featuring", "Ft.", "Ft", "Feat.", "Feat", "Featuring"];

export default class MalojaScrobbler extends AbstractScrobbleClient {

    requiresAuth = true;
    serverVersion: any;
    webUrl: string;

    api: MalojaApiClient;

    declare config: MalojaClientConfig

    constructor(name: any, config: MalojaClientConfig, notifier: Notifiers, emitter: EventEmitter, logger: Logger) {
        super('maloja', name, config, notifier, emitter, logger);
        this.api = new MalojaApiClient(name, this.config.data, { logger: childLogger(this.logger, 'API') });
        this.MAX_INITIAL_SCROBBLES_FETCH = 100;
    }

    formatPlayObj = (obj: any, options: FormatPlayObjectOptions = {}) => formatMalojaScrobbleToPlay(obj, { url: this.webUrl });

    protected async doBuildInitData(): Promise<true | string | undefined> {
        const { data: { url, apiKey } = {} } = this.config;
        if (apiKey === undefined) {
            throw new Error("'apiKey' not found in config!");
        }
        if (url === undefined) {
            throw new Error("Missing 'url' for Maloja config");
        }
        this.webUrl = normalizeUrl(url);
        return true;
    }

    protected async doCheckConnection(): Promise<true | string | undefined> {

        try {
            await this.api.testConnection();
            await this.api.testHealth();
            return true;
        } catch (e) {
            throw e;
        }

    }


    doAuthentication = async () => {

        const { data: { url, apiKey } = {} } = this.config;
        if (apiKey === undefined) {
            throw new Error("'apiKey' not found in config!");
        }
        try {
            await this.api.testAuth();
            return true;
        } catch (e) {
            if (isNodeNetworkException(e)) {
                this.logger.error('Could not communicate with Maloja API');
            }
            throw e;
        }
    }

    getScrobblesForRefresh = async (limit: number) => {
        const resp = await this.api.getPaginatedTimeRangeListens({limit, page: 0});
        return resp.data;
    }

    alreadyScrobbled = async (playObj: any, log = false) => (await this.existingScrobble(playObj)) !== undefined

    public playToClientPayload(playObj: PlayObject): MalojaScrobbleRequestData {

        const { apiKey } = this.config.data;

        return playToScrobblePayload(playObj);
    }

    doScrobble = async (playObj: PlayObject) => {
        const {
            meta: {
                source,
                newFromSource = false,
            } = {}
        } = playObj;

        const scrobbleData = playToScrobblePayload(playObj);

        try {
            const result = await this.api.scrobble(playObj);
            const scrobbleInfo = `Scrobbled (${newFromSource ? 'New' : 'Backlog'})     => (${source}) ${buildTrackString(playObj)}`;
            if (result.warnings?.length > 0) {
                this.logger.warn(`${scrobbleInfo} | ${result.warnings.join(' | ')}`);
            } else {
                this.logger.info(scrobbleInfo);
            }
            return result;
        } catch (e) {
            await this.notifier.notify({ title: `Client - ${capitalize(this.type)} - ${this.name} - Scrobble Error`, message: `Failed to scrobble => ${buildTrackString(playObj)} | Error: ${e.message}`, priority: 'error' });
            throw e;
        }
    }
}