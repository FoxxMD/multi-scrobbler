import { Logger } from "@foxxmd/logging";
import EventEmitter from "events";
import { PlayObject } from "../../core/Atomic.js";
import { buildTrackString, capitalize } from "../../core/StringUtils.js";
import { isNodeNetworkException } from "../common/errors/NodeErrors.js";
import { UpstreamError } from "../common/errors/UpstreamError.js";
import { FormatPlayObjectOptions } from "../common/infrastructure/Atomic.js";
import { playToListenPayload } from "../common/vendor/ListenbrainzApiClient.js";
import { Notifiers } from "../notifier/Notifiers.js";

import AbstractScrobbleClient from "./AbstractScrobbleClient.js";
import { ListRecord, ScrobbleRecord, TealClientConfig } from "../common/infrastructure/config/client/tealfm.js";
import { BlueSkyAppApiClient } from "../common/vendor/bluesky/BlueSkyAppApiClient.js";
import { BlueSkyOauthApiClient } from "../common/vendor/bluesky/BlueSkyOauthApiClient.js";
import { AbstractBlueSkyApiClient, listRecordToPlay, playToRecord, recordToPlay } from "../common/vendor/bluesky/AbstractBlueSkyApiClient.js";

export default class TealScrobbler extends AbstractScrobbleClient {

    requiresAuth = true;
    requiresAuthInteraction = false;

    declare config: TealClientConfig;

    client: AbstractBlueSkyApiClient;

    constructor(name: any, config: TealClientConfig, options = {}, notifier: Notifiers, emitter: EventEmitter, logger: Logger) {
        super('tealfm', name, config, notifier, emitter, logger);
        this.MAX_INITIAL_SCROBBLES_FETCH = 20;
        this.scrobbleDelay = 1500;
        this.supportsNowPlaying = false;
        if(config.data.appPassword !== undefined) {
            this.client = new BlueSkyAppApiClient(name, {...config.data, pds: config.options?.pds}, {...options, logger});
            this.requiresAuthInteraction = false;
        } else if(config.data.baseUri !== undefined) {
            this.client = new BlueSkyOauthApiClient(name, {...config.data, pds: config.options?.pds}, {...options, logger});
        } else {
            throw new Error(`Must define either 'baseUri' or 'appPassword' in configuration!`);
        }
    }

    formatPlayObj = (obj: any, options: FormatPlayObjectOptions = {}) => recordToPlay(obj);

    public playToClientPayload(playObject: PlayObject): object {
        return playToListenPayload(playObject);
    }


    protected async doBuildInitData(): Promise<true | string | undefined> {
        const {
            data: {
                identifier,
            } = {}
        } = this.config;
        if (identifier === undefined) {
            throw new Error('Must provide an identifier');
        }
        this.client.initClient();
        return true;
    }

    protected async doCheckConnection(): Promise<true | string | undefined> {
        return true;
    }

    async getAuthorizeUrl(): Promise<string> {
        return await (this.client as BlueSkyOauthApiClient).createAuthorizeUrl(this.config.data.identifier);
    }

    doAuthentication = async () => {

        try {
            const sessionRes = await this.client.restoreSession();
            if(sessionRes) {
                return true;
            }
            if(this.client instanceof BlueSkyAppApiClient) {
                return await this.client.appLogin();
            }
        } catch (e) {
            if(isNodeNetworkException(e)) {
                this.logger.error('Could not communicate with ATProto API');
            }
            throw e;
        }
    }

    getScrobblesForRefresh = async (limit: number) => {
        let list: ListRecord<ScrobbleRecord>[];
        try {
            list = await this.client.listScrobbleRecord(limit)
        } catch (e) {
            throw new Error('Error occurred while trying to fetch records', {cause: e});
        }
        return list.map(x => listRecordToPlay(x));
    }

    alreadyScrobbled = async (playObj: PlayObject, log = false) => (await this.existingScrobble(playObj)) !== undefined

    doScrobble = async (playObj: PlayObject) => {
        const {
            meta: {
                source,
                newFromSource = false,
            } = {}
        } = playObj;

        try {
            await this.client.createScrobbleRecord(playToRecord(playObj))
            if (newFromSource) {
                this.logger.info(`Scrobbled (New)     => (${source}) ${buildTrackString(playObj)}`);
            } else {
                this.logger.info(`Scrobbled (Backlog) => (${source}) ${buildTrackString(playObj)}`);
            }
            return playObj;
        } catch (e) {
            await this.notifier.notify({title: `Client - ${capitalize(this.type)} - ${this.name} - Scrobble Error`, message: `Failed to scrobble => ${buildTrackString(playObj)} | Error: ${e.message}`, priority: 'error'});
            throw new UpstreamError(`Error occurred while making Teal API scrobble request: ${e.message}`, {cause: e, showStopper: !(e instanceof UpstreamError)});
        }
    }
}

