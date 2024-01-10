import MemorySource from "./MemorySource";
import {ChromecastSourceConfig} from "../common/infrastructure/config/source/chromecast";
import {
    FormatPlayObjectOptions,
    InternalConfig, NO_USER,
    PlayerStateData, REPORTED_PLAYER_STATUSES, ReportedPlayerStatus,
    SINGLE_USER_PLATFORM_ID,
    SourceData
} from "../common/infrastructure/Atomic";
import {EventEmitter} from "events";
import Bonjour, {Service} from "bonjour-service";
import {connect, createPlatform, Application, MediaController, PersistentClient, Media, Result} from "chromecast-client";
import {ErrorWithCause} from "pony-cause";
import e, {application} from "express";
import {PlayObject} from "../../core/Atomic";
import dayjs from "dayjs";
import {RecentlyPlayedOptions} from "./AbstractSource";
import {Simulate} from "react-dom/test-utils";
import play = Simulate.play;
import {difference, intersect} from "../utils";

type PlatformType = ReturnType<typeof createPlatform>;

interface PlatformApplication {
    iconUrl?: string | null | undefined;
    isIdleScreen?: boolean | null | undefined;
    launchedFromCloud?: boolean | null | undefined;
    statusText?: string | null | undefined;
    appId: string;
    displayName: string;
    namespaces: {
        name: string;
    }[];
    sessionId: string;
    transportId: string;
}

interface PlatformApplicationWithControllers extends PlatformApplication {
    enabled: boolean
    controller: MediaController.MediaController
}

interface ChromecastDeviceInfo {
    mdns: Service
    client: PersistentClient
    platform: PlatformType
    applications: Map<string, PlatformApplicationWithControllers>
}

interface ChromecastFormatPlayObjectOptions extends FormatPlayObjectOptions {
    deviceId: string
    source: string
}

export class ChromecastSource extends MemorySource {

    declare config: ChromecastSourceConfig;

    multiPlatform: boolean = true;

    whitelistDevices: string[] = [];
    blacklistDevices: string[] = [];
    whitelistApps: string[] = [];
    blacklistApps: string[] = [];

    bonjour?: Bonjour;

    devices: Map<string, ChromecastDeviceInfo> = new Map();

    constructor(name: any, config: ChromecastSourceConfig, internal: InternalConfig, emitter: EventEmitter) {
        super('chromecast', name, config, internal, emitter);
        this.canPoll = true;

        const {
            data = {}
        } = config;

        for(const propName of ['whitelistDevices', 'blacklistDevices', 'whitelistApps', 'blacklistApps']) {
            const configData = data[propName] ?? [];

            if(!Array.isArray(configData)) {
                this[propName] = configData.split(',')
            } else {
                this[propName] = configData;
            }
        }
    }

    initialize = async () => {
        this.logger.info('Listening for Chromecasts...')
        this.bonjour = new Bonjour({}, (err) => {
            this.logger.error(new ErrorWithCause('Bonjour (mDNS) discovery crashed unexpectedly and will not be able to find new client.', {cause: e}));
        });
        this.bonjour.find({ type: 'googlecast' }, (service) => {

            if(this.devices.has(service.name)) {
                this.logger.warn(`Chromecast ${service.name} already found, not adding again.`);
                return;
            }

            const discovered = `Found chromecast "${service.name}" at ${service.addresses?.[0]}`;
            const lowerName = service.name.toLocaleLowerCase();
            if(this.whitelistDevices.length > 0) {
                const found = this.whitelistDevices.find(x => lowerName.includes(x));
                if(found !== undefined) {
                    this.logger.info(`${discovered} => Adding as a player because it was whitelisted by keyword '${found}'`);
                } else {
                    this.logger.info(`${discovered} => NOT ADDING as a player because no part of its name appeared in whitelistDevices`);
                    return;
                }
            } else if(this.blacklistDevices.length > 0) {
                const found = this.blacklistDevices.find(x => lowerName.includes(x));
                if(found !== undefined) {
                    this.logger.info(`${discovered} => NOT ADDING as a player because it was blacklisted by keyword '${found}'`);
                    return;
                } else {
                    this.logger.info(`${discovered} => Adding as a player because no part of its name appeared in blacklistDevices`);
                }
            } else {
                this.logger.info(`${discovered} => Adding as a player`);
            }

            this.initializeDevice(service).catch((e) => {
                this.logger.error(e);
            });

        });
        this.initialized = true;
        return true;
    }

    protected initializeDevice = async (service: Service) => {

        let client: PersistentClient;
        try {
            client = await connect({host: service.addresses?.[0]});
        } catch (e) {
            this.logger.error(new ErrorWithCause(`Could not connect to ${service.name}`, {cause: e}));
            return;
        }

        const platform = createPlatform(client);

        const applications = new Map<string, PlatformApplicationWithControllers>();

        this.devices.set(service.name, {mdns: service, client, platform, applications});
    }

    protected getCurrentPlatformApplications = async (platform: PlatformType): Promise<PlatformApplication[]> => {
        // if(!this.devices.has(name)) {
        //     throw new Error(`No device with name ${name}`);
        // }
        //
        // const deviceInfo = this.devices.get(name);

        let statusRes: Result<{applications?: PlatformApplication[]}>;
        try {
            statusRes = await platform.getStatus()
        } catch (e) {
            throw new ErrorWithCause('Unable to fetch platform statuses', {cause: e});
        }

        let status: {applications?: PlatformApplication[]};

        try {
            status = statusRes.unwrapAndThrow();
            if(status.applications === undefined) {
                return [];
            }
            return status.applications;
        } catch (e) {
            throw new ErrorWithCause('Unable to fetch platform statuses', {cause: e});
        }
    }

    protected getMediaStatus = async (controller: MediaController.MediaController, platformName: string, applicationName: string): Promise<[PlayObject, Media.MediaStatus]> => {

        let status: Media.MediaStatus;

        try {
            const statusRes = await controller.getStatus();
            status = statusRes.unwrapAndThrow();
        } catch (e) {
            throw new ErrorWithCause('Unable to fetch media status', {cause: e});
        }

        return [ChromecastSource.formatPlayObj(status, {deviceId: `${platformName}-${applicationName}`, source: applicationName}), status];
    }

    getRecentlyPlayed = async (options: RecentlyPlayedOptions = {}) => {
        let plays: SourceData[] = [];

        const staleDevices: Map<string, string[]> = new Map();

        for(const [k, v] of this.devices.entries()) {
            try {

                const apps = await this.getCurrentPlatformApplications(v.platform);
                for(const a of apps) {
                    let storedApp = v.applications.get(a.transportId);
                    if(!storedApp) {

                        const appName = a.displayName;
                        const appLowerName = appName.toLocaleLowerCase();
                        let enabled = true;

                        if(this.whitelistApps.length > 0) {
                            const found = this.whitelistDevices.find(x => appLowerName.includes(x));
                            if(found !== undefined) {
                                this.logger.info(`Watching ${appName} because it was whitelisted by keyword '${found}'`);
                            } else {
                                this.logger.info(`NOT Watching ${appName} because no part of its name appeared in whitelistApps`);
                                enabled = false;
                            }
                        } else if(this.blacklistApps.length > 0) {
                            const found = this.blacklistDevices.find(x => appLowerName.includes(x));
                            if(found !== undefined) {
                                this.logger.info(`NOT Watching ${appName} because it was blacklisted by keyword '${found}'`);
                                enabled = false;
                            } else {
                                this.logger.info(`Watching ${appName} because no part of its name appeared in blacklistDevices`);
                            }
                        } else {
                            this.logger.info(`Watching ${appName}`);
                        }

                        v.applications.set(a.transportId, {
                            ...a,
                            controller: MediaController.createMediaController({client: v.client, destinationId: a.transportId}),
                            enabled
                        });
                        storedApp = v.applications.get(a.transportId);
                    }

                    if(!storedApp.enabled) {
                        continue;
                    }

                    try {
                        const [play, mediaStatus] = await this.getMediaStatus(storedApp.controller, v.mdns.name, storedApp.displayName);
                        const playerState: PlayerStateData = {
                            platformId: [play.meta.deviceId, NO_USER],
                            play,
                            position: play.meta.trackProgressPosition,
                            status: chromePlayerStateToReported(mediaStatus.playerState)
                        }
                        plays.push(playerState);
                    } catch (e) {
                        if(e.message.includes('timeout')) {
                            // application probably no longer exists or media is no longer being played?
                            this.logger.debug(`Timeout for ${k} - ${storedApp.displayName}, removing from applications`);
                            v.applications.delete(a.transportId);
                        } else {
                            throw e;
                        }
                    }
                }
                // finally remove any stored applications that weren't iterated
                const currApps = apps.map(x => x.transportId);
                const storedApps = Array.from(v.applications.keys());
                const storedStale = difference(storedApps, currApps);
                staleDevices.set(k, storedStale);
            } catch (e) {
                this.logger.warn(new ErrorWithCause(`Could not get Player State for ${k}`, {cause: e}))
            }
        }

        const playsToReturn = this.processRecentPlays(plays);

        // TODO change this to store deviceid so we can delete players too
        for(const [k, storedStale] of staleDevices.entries()) {
            const v = this.devices.get(k);
            for(const stale of storedStale) {
                this.logger.debug(`Removing stale ${k} - ${v.applications.get(stale).displayName}`);
                v.applications.delete(stale);
            }
        }

        return playsToReturn;
    }

    static formatPlayObj(obj: Media.MediaStatus, options: FormatPlayObjectOptions = {}): PlayObject {
        const {
            currentTime,
            media: {
                duration,
                metadata: {
                    metadataType,
                    title,
                    songName,
                    artist,
                    artistName,
                    albumArtist,
                    albumName,
                    album: albumNorm
                } = {}
            }
        } = obj;

        let artists: string[] = [(artist ?? artistName) as string],
            albumArtists: string[] = [albumArtist as string],
            track: string = (title ?? songName) as string,
            album: string = (albumNorm ?? albumName) as string,
            mediaType: string = 'unknown';

        const {
            deviceId,
            source
        } = options;

        switch (metadataType) {
            case 0:
                mediaType = 'unknown';
                break;
            case 1:
                mediaType = 'movie';
                break;
            case 2:
                mediaType = 'tv';
                break;
            case 3:
                mediaType = 'music';
                break;
            case 4:
                mediaType = 'photo';
                break;
            case 5:
                mediaType = 'audiobook';
                break;
        }

        let trackProgressPosition: number = 0;
        if(currentTime > 0 && (duration === undefined || currentTime < (duration + 1))) {
            trackProgressPosition = currentTime;
        }

        return {
            data: {
                track,
                album,
                albumArtists,
                artists,
                duration,
                playDate: dayjs()
            },
            meta: {
                trackProgressPosition,
                mediaType,
                deviceId,
                source
            }
        }
    }
}

const chromePlayerStateToReported = (state: string): ReportedPlayerStatus => {
    switch (state) {
        case 'PLAYING':
            return REPORTED_PLAYER_STATUSES.playing;
        case 'PAUSED':
        case 'BUFFERING':
            return REPORTED_PLAYER_STATUSES.paused;
        case 'IDLE':
            return REPORTED_PLAYER_STATUSES.stopped;
        default:
            return REPORTED_PLAYER_STATUSES.unknown;
    }
}
