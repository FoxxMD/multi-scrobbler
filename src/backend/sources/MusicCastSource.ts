import { MemoryPositionalSource } from "./MemoryPositionalSource.js";
import { RecentlyPlayedOptions } from "./AbstractSource.js";
import { EventEmitter } from "events";
import { PlayObject, PlayObjectLifecycleless, URLData } from "../../core/Atomic.js";
import {
    FormatPlayObjectOptions,
    InternalConfig,
    PlayerStateData,
    SINGLE_USER_PLATFORM_ID,
} from "../common/infrastructure/Atomic.js";
import { isPortReachable, isPortReachableConnect, joinedUrl, normalizeWebAddress } from "../utils/NetworkUtils.js";
import { DeviceInfoResponse, DeviceStatusResponse, MusicCastResponseCodes, MusicCastSourceConfig, playbackToReportedStatus, PlayInfoCDResponse, PlayInfoNetResponse } from "../common/infrastructure/config/source/musiccast.js";
import request, { Request, Response } from 'superagent';
import { baseFormatPlayObj } from "../utils/PlayTransformUtils.js";


export class MusicCastSource extends MemoryPositionalSource {

    declare config: MusicCastSourceConfig;

    urlData!: URLData;
    version?: string;


    constructor(name: any, config: MusicCastSourceConfig, internal: InternalConfig, emitter: EventEmitter) {
        const {
            data = {}
        } = config;
        const {
            ...rest
        } = data;
        super('musiccast', name, { ...config, data: { ...rest } }, internal, emitter);

        this.requiresAuth = false;
        this.canPoll = true;
    }

    protected async doBuildInitData(): Promise<true | string | undefined> {
        const {
            data: {
                url
            } = {}
        } = this.config;
        if (url === null || url === undefined || url === '') {
            throw new Error('url must be defined');
        }
        this.urlData = normalizeWebAddress(url, { defaultPath: '/YamahaExtendedControl/v1' });
        const normal = this.urlData.normal;
        this.logger.verbose(`Config URL: '${url ?? '(None Given)'}' => Normalized: '${normal}'`)
        return true;
    }


    protected async doCheckConnection(): Promise<true | string | undefined> {
        try {
            await isPortReachableConnect(this.urlData.port, { host: this.urlData.url.hostname });
            this.logger.verbose(`${this.urlData.url.hostname}:${this.urlData.port} is reachable.`);

            const resp = await request.get(joinedUrl(this.urlData.url, 'system/getDeviceInfo').toString())
            if (resp.body !== undefined && typeof resp.body === 'object') {
                const deviceInfo = resp.body as DeviceInfoResponse;
                if(deviceInfo.api_version !== undefined) {
                    this.version = deviceInfo.api_version.toString();
                }
                this.logger.info(`Found ${deviceInfo.model_name} (${deviceInfo.device_id}) using API v${deviceInfo.api_version}`);
            } else {
                this.logger.warn('Could not get device info! Ignoring but probably not good...');
            }
            return true;
        } catch (e) {
            const hint = e.error?.cause?.message ?? undefined;
            throw new Error(`Could not connect to MusicCast server${hint !== undefined ? ` (${hint})` : ''}`, { cause: e.error ?? e });
        }
    }

    getAnyPlayInfo = async (): Promise<PlayInfoCDResponse | PlayInfoNetResponse | undefined> => {

        try {
            const netResp = await request.get(joinedUrl(this.urlData.url, '/netusb/getPlayInfo').toString());
            if (netResp.body !== undefined && typeof netResp.body === 'object') {
                const resp = netResp.body as PlayInfoNetResponse
                if(resp.response_code !== 0) {
                    throw new Error(`netusb source is unexpected status: ${resp.response_code} (${MusicCastResponseCodes.get(resp.response_code) ?? 'Unknown'})`);
                }
                return resp;
            }
        } catch (e) {
            this.logger.warn(new Error('Not OK response from netusb getPlayInfo but will continue', {cause: e}));
        }

        try {
            const cdResp = await request.get(joinedUrl(this.urlData.url, '/cd/getPlayInfo').toString());
            if (cdResp.body !== undefined && typeof cdResp.body === 'object') {
                const resp = cdResp.body as PlayInfoCDResponse;
                if(resp.response_code !== 0) {
                    throw new Error(`cd source is unexpected status: ${resp.response_code} (${MusicCastResponseCodes.get(resp.response_code) ?? 'Unknown'})`);
                }
                return resp;
            }
        } catch (e) {
            this.logger.warn(new Error('Not OK response from cd getPlayInfo but will continue', {cause: e}));
        }

        return undefined;
    }

    getRecentlyPlayed = async (options: RecentlyPlayedOptions = {}) => {

        const statusResp = await request.get(joinedUrl(this.urlData.url, 'main/getStatus').toString());
        if (statusResp.body == undefined || typeof statusResp.body !== 'object') {
            this.logger.error({ getStatusResponse: statusResp });
            throw new Error('Could not determine status of MusicCast device');
        }
        if ((statusResp.body as DeviceStatusResponse).power !== 'on') {
            this.logger.debug('MusicCast device is offline');
            return await this.processRecentPlays([]);
        }

        const playInfo = await this.getAnyPlayInfo();
        if(playInfo === undefined) {
            return await this.processRecentPlays([]);
        }

        const play = formatPlayObj(playInfo);


        const playerState: PlayerStateData = {
            platformId: SINGLE_USER_PLATFORM_ID,
            status: playbackToReportedStatus(playInfo.playback),
            play,
            position: play.meta.trackProgressPosition
        }

        return await this.processRecentPlays([playerState]);
    }
}

const formatPlayObj = (obj: PlayInfoCDResponse | PlayInfoNetResponse, options: FormatPlayObjectOptions & {version?: string} = {}): PlayObject => {

    const {
        play_time,
        total_time,
        artist,
        album,
        track,
        device_status,
        playback
    } = obj;

    const play: PlayObjectLifecycleless = {
        data: {
            artists: artist !== undefined && artist !== '' ? [artist] : [],
            album: album !== '' ? album : undefined,
            track,
            // we should treat 0 time as the same as not being provided
            duration: total_time === 0 ? undefined : total_time
        },
        meta: {
            trackProgressPosition: play_time,
            deviceId: 'input' in obj ? obj.input : 'cd',
            mediaPlayerName: 'MusicCast',
            mediaPlayerVersion: options.version
        }
    }
    return baseFormatPlayObj(obj, play);
}