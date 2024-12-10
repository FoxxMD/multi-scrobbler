import dayjs from "dayjs";
import { EventEmitter } from "events";
import normalizeUrl from 'normalize-url';
import { URL } from "url";
import { PlayObject } from "../../core/Atomic.js";
import { FormatPlayObjectOptions, InternalConfig } from "../common/infrastructure/Atomic.js";
import { JRiverSourceConfig } from "../common/infrastructure/config/source/jriver.js";
import { Info, JRiverApiClient, PLAYER_STATE } from "../common/vendor/JRiverApiClient.js";
import { RecentlyPlayedOptions } from "./AbstractSource.js";
import { MemoryPositionalSource } from "./MemoryPositionalSource.js";

export class JRiverSource extends MemoryPositionalSource {
    declare config: JRiverSourceConfig;

    url: URL;

    client: JRiverApiClient;
    clientReady: boolean = false;

    constructor(name: any, config: JRiverSourceConfig, internal: InternalConfig, emitter: EventEmitter) {
        const {
            data,
        } = config;
        const {
            ...rest
        } = data || {};
        super('jriver', name, {...config, data: {...rest}}, internal, emitter);

        const {
            data: {
                url = 'http://localhost:52199/MCWS/v1/'
            } = {},
        } = config;
        this.url = JRiverSource.parseConnectionUrl(url);
        this.client = new JRiverApiClient(name, {...data, url: this.url.toString()}, {logger: this.logger});
        this.requiresAuth = true;
        this.canPoll = true;
        this.multiPlatform = true;
    }

    static parseConnectionUrl(val: string) {
        const normal = normalizeUrl(val, {removeTrailingSlash: true, normalizeProtocol: true})
        const url = new URL(normal);

        if (url.port === null || url.port === '') {
            url.port = '52199';
        }
        if (url.pathname === '/') {
            url.pathname = '/MCWS/v1/';
        } else if (url.pathname === '/MCWS/v1') {
            url.pathname = '/MCWS/v1/';
        }
        return url;
    }

    protected async doBuildInitData(): Promise<true | string | undefined> {
        const {
            data: {
                url
            } = {}
        } = this.config;
        this.logger.verbose(`Config URL: '${url ?? '(None Given)'}' => Normalized: '${this.url.toString()}'`)
        return true;
    }

    protected async doCheckConnection(): Promise<true | string | undefined> {
        try {
            return await this.client.testConnection();
        } catch (e) {
            throw e;
        }
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

    static formatPlayObj(obj: Info, options: FormatPlayObjectOptions = {}): PlayObject {
        const {newFromSource = true} = options;

        const {
            Artist,
            Album,
            Name,
            DurationMS,
            PositionMS: trackProgressPosition,
            FileKey,
            ZoneID,
            ZoneName,
        } = obj;

        const artists = Artist === null || Artist === undefined ? [] : [Artist];
        const album = Album === null || Album === '' ? undefined : Album;
        const length = Number.parseInt(DurationMS.toString()) / 1000;

        return {
            data: {
                track: Name,
                album: album,
                artists,
                duration: Math.round(length),
                playDate: dayjs()
            },
            meta: {
                source: 'mopidy',
                trackId: FileKey,
                newFromSource,
                trackProgressPosition: trackProgressPosition !== undefined ? Math.round(Number.parseInt(trackProgressPosition.toString()) / 1000) : undefined,
                deviceId: `Zone${ZoneID}${ZoneName !== undefined ? `-${ZoneName}` : ''}`,
            }
        }
    }

    getRecentlyPlayed = async (options: RecentlyPlayedOptions = {}) => {
        if (!this.clientReady) {
            this.logger.warn('Cannot actively poll since client is not connected.');
            return [];
        }

        let play = [];

        //should it use zones?
        //const zoneResp = await this.client.getZones();
        const infoResp = await this.client.getInfo();
        const {
            body: {
                data,
            } = {}
        } = infoResp;
        if(data !== undefined) {
            const {State} = data;
            if(State !== PLAYER_STATE.STOPPED) {
                play = [JRiverSource.formatPlayObj(data)];
            }
        }

        return this.processRecentPlays(play);
    }

}
