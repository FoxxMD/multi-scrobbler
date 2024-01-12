import MemorySource from "./MemorySource";
import {ChromecastSourceConfig} from "../common/infrastructure/config/source/chromecast";
import {
    FormatPlayObjectOptions,
    InternalConfig, NO_USER,
    PlayerStateData,
    SourceData
} from "../common/infrastructure/Atomic";
import {EventEmitter} from "events";
import Bonjour, {Service} from "bonjour-service";
import {MediaController, PersistentClient, Media} from "chromecast-client";
import {Client as CastClient} from 'castv2';
import {ErrorWithCause, findCauseByReference} from "pony-cause";
import {PlayObject} from "../../core/Atomic";
import dayjs from "dayjs";
import {RecentlyPlayedOptions} from "./AbstractSource";
import {difference, genGroupIdStr, mergeArr} from "../utils";
import {
    PlatformApplication,
    PlatformApplicationWithContext,
    PlatformType
} from "../common/vendor/chromecast/interfaces";
import {
    chromePlayerStateToReported, genDeviceId,
    getCurrentPlatformApplications, getMediaStatus,
    initializeClientPlatform
} from "../common/vendor/chromecast/ChromecastClientUtils";
import {Logger} from "@foxxmd/winston";
import {ContextualValidationError} from "chromecast-client/dist/cjs/src/utils";

interface ChromecastDeviceInfo {
    mdns: Service
    client: PersistentClient
    castv2: CastClient
    logger: Logger,
    connected: boolean
    retries: number
    platform: PlatformType
    applications: Map<string, PlatformApplicationWithContext>
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
                this[propName] = configData.split(',').map(x => x.toLocaleLowerCase())
            } else {
                this[propName] = configData.map(x => x.toLocaleLowerCase());
            }
        }
    }

    initialize = async () => {
        this.logger.info('Listening for Chromecasts...')
        this.bonjour = new Bonjour({}, (err) => {
            this.logger.error(new ErrorWithCause('Bonjour (mDNS) discovery crashed unexpectedly and will not be able to find new client.', {cause: err}));
        });
        this.bonjour.find({ type: 'googlecast' }, (service) => {

            if(this.devices.has(service.name)) {
                this.logger.warn(`Chromecast ${service.name} already found, not adding again.`);
                return;
            }

            const discovered = `Discovered chromecast "${service.name}" at ${service.addresses?.[0]}`;
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
        try {
            const [castClient, client, platform] = await initializeClientPlatform(service);
            const applications = new Map<string, PlatformApplicationWithContext>();
            this.devices.set(service.name, {
                mdns: service,
                client,
                castv2: castClient,
                connected: true,
                retries: 0,
                platform,
                applications,
                logger: this.logger.child({labels: [service.name.substring(0, 25)]}, mergeArr),
            });
            castClient.on('connect', () => this.handleCastClientEvent(service.name, 'connect'));
            castClient.on('error', (err) => this.handleCastClientEvent(service.name, 'error', err));
            castClient.on('close', () => this.handleCastClientEvent(service.name, 'close'));
        } catch (e) {
            this.logger.error(e);
            return;
        }
    }

    protected handleCastClientEvent = (clientName: string, event: string, payload?: any) => {
            const info = this.devices.get(clientName);
            if(info === undefined) {
                return;
            }
            switch(event) {
                case 'connect':
                    if(info.connected === false) {
                        info.logger.verbose(`Reconnected`);
                    }
                    info.connected = true;
                    info.retries = 0;
                    break;
                case 'close':
                    if(info.connected === false) {
                        info.retries += 1;

                        // TODO make this configurable?
                        if(info.retries === 6) {
                            //info.logger.verbose(`Removing device applications after being unreachable for 30 seconds`);
                            this.removeApplications(clientName, 'Device unreachable for more than 30 seconds');
                        }
                    }
                    info.connected = false;
                    break;
                case 'error':
                    info.logger.error(new ErrorWithCause(`Encountered error in castv2 lib`, {cause: payload as Error}));
                    break;
            }
    }

    protected refreshApplications = async () => {
        for(const [k, v] of this.devices.entries()) {
            if(!v.connected) {
                continue;
            }

            let apps: PlatformApplication[];
            try {
                apps = await getCurrentPlatformApplications(v.platform);
            } catch (e) {
                v.logger.warn(new ErrorWithCause('Could not refresh applications', {cause: e}));
                const validationError = findCauseByReference(e, ContextualValidationError);
                if(validationError && validationError.data !== undefined) {
                    v.logger.warn(JSON.stringify(validationError.data));
                }
                continue;
            }

            for(const a of apps) {
                let storedApp = v.applications.get(a.transportId);
                if(!storedApp) {
                    const appName = a.displayName;
                    let found = `Found Application '${appName}'`;
                    const appLowerName = appName.toLocaleLowerCase();
                    let filtered = false;
                    let valid = true;
                    if(a.isIdleScreen) {
                        valid = false;
                        v.logger.info(`${found} => Not watching because it is the idle screen`);
                    } else if(!a.namespaces.some(x => x.name === 'urn:x-cast:com.google.cast.media')) {
                        valid = false;
                        v.logger.info(`${found} => Not watching because namespace does not support media`);
                    }

                    if(valid) {
                        if(this.whitelistApps.length > 0) {
                            const found = this.whitelistDevices.find(x => appLowerName.includes(x));
                            if(found !== undefined) {
                                v.logger.info(`${found} => Watching because it was whitelisted by keyword '${found}'`);
                            } else {
                                v.logger.info(`${found} => NOT Watching because no part of its name appeared in whitelistApps`);
                                filtered = true;
                            }
                        } else if(this.blacklistApps.length > 0) {
                            const found = this.blacklistDevices.find(x => appLowerName.includes(x));
                            if(found !== undefined) {
                                v.logger.info(`${found} => NOT Watching because it was blacklisted by keyword '${found}'`);
                                filtered = true;
                            } else {
                                v.logger.info(`${found} => Watching because no part of its name appeared in blacklistApps`);
                            }
                        } else {
                            v.logger.info(`${found} => Watching`);
                        }
                    }

                    storedApp = {
                        ...a,
                        filtered: filtered,
                        stale: false,
                        validAppType: valid,
                        playerId: genGroupIdStr([genDeviceId(k, a.displayName), NO_USER])
                    }
                    v.applications.set(a.transportId, storedApp);
                } else if(storedApp.stale === true) {
                    v.logger.verbose(`App ${storedApp.displayName} no longer stale!`);
                    storedApp.stale = false;
                    storedApp.staleAt = undefined;
                }
            }

            const currApps = apps.map(x => x.transportId);
            const storedApps = Array.from(v.applications.keys());
            const storedStale = difference(storedApps, currApps);
            for(const staleId of storedStale) {
                const staleApp = v.applications.get(staleId);
                if(staleApp.filtered || !staleApp.validAppType) {
                    v.logger.verbose(`App ${staleApp.displayName} became stale and is unused, removing immediately.`);
                    v.applications.delete(staleId);
                } else if(!staleApp.stale) {
                    v.logger.verbose(`App ${staleApp.displayName} became stale`);
                    staleApp.staleAt = dayjs();
                    staleApp.stale = true;
                }
            }
        }
    }

    protected removeApplications = (deviceName: string, reason?: string) => {
        const deviceInfo = this.devices.get(deviceName);
        if(deviceInfo === undefined) {
            this.logger.warn(`No device with ${deviceName} exists, no applications to remove.`);
            return;
        }
        for(const [tId, app] of deviceInfo.applications) {
            this.deletePlayer(app.playerId, reason)
            deviceInfo.applications.delete(tId);
        }
    }

    protected pruneStaleApplications = (force: boolean = false) => {
        for(const [k, v] of this.devices.entries()) {
            if (!force && !v.connected) {
                continue;
            }

            for(const [tId, app] of v.applications.entries()) {
                if(app.stale && Math.abs(app.staleAt.diff(dayjs(), 's')) > 60) {
                    v.logger.info(`Removing Application ${app.displayName} due to being stale for 60 seconds`);
                    this.deletePlayer(app.playerId, 'No updates for 60 seconds');
                    v.applications.delete(tId);
                }
            }
        }
    }

    getRecentlyPlayed = async (options: RecentlyPlayedOptions = {}) => {
        let plays: SourceData[] = [];

        try {
            await this.refreshApplications();
        } catch (e) {
            this.logger.warn(new ErrorWithCause('Could not refresh all applications', {cause: e}));
        }

        for(const [k, v] of this.devices.entries()) {
            if (!v.connected) {
                continue;
            }

            try {

                for (const [tId, application] of v.applications.entries()) {
                    if (!application.validAppType || application.filtered || application.stale) {
                        continue;
                    }

                    if (application.controller === undefined) {
                        application.controller = MediaController.createMediaController({
                            client: v.client,
                            destinationId: application.transportId
                        });
                    }

                    let mediaStatus: Media.MediaStatus
                    try {
                        mediaStatus = await getMediaStatus(application.controller);
                    } catch (e) {
                        if (e.message.includes('timed out')) {
                            // application probably no longer exists or media is no longer being played?
                            this.logger.debug(`Timeout for ${k} - ${application.displayName}`);
                            //v.applications.delete(application.transportId);
                            // TODO count timeouts before setting app as stale
                            continue;
                        } else {
                            throw e;
                        }
                    }

                    if(this.config.options.logPayload) {
                        this.logger.debug(`Media Status Payload:\n ${JSON.stringify(mediaStatus)}`);
                    }

                    const play = ChromecastSource.formatPlayObj(mediaStatus, {
                        deviceId: genDeviceId(k, application.displayName),
                        source: application.displayName
                    });

                    const playerState: PlayerStateData = {
                        platformId: [play.meta.deviceId, NO_USER],
                        play,
                        position: play.meta.trackProgressPosition,
                        status: chromePlayerStateToReported(mediaStatus.playerState)
                    }
                    plays.push(playerState);
                }
            } catch (e) {
                this.logger.warn(new ErrorWithCause(`Could not get Player State for ${k}`, {cause: e}))
                const validationError = findCauseByReference(e, ContextualValidationError);
                if(validationError && validationError.data !== undefined) {
                    v.logger.warn(JSON.stringify(validationError.data));
                }
            }
        }

        const playsToReturn = this.processRecentPlays(plays);

        this.pruneStaleApplications();

        return playsToReturn;
    }

    static formatPlayObj(obj: Media.MediaStatus, options: FormatPlayObjectOptions = {}): PlayObject {
        // https://developers.google.com/cast/docs/media/messages

        const {
            currentTime,
            media: {
                duration,
                metadata: {
                    metadataType,
                    title,
                    subtitle,
                    songName,
                    artist,
                    artistName,
                    albumArtist,
                    albumName,
                    album: albumNorm
                } = {}
            }
        } = obj;

        let artists: string[] = [],
            albumArtists: string[] = [albumArtist as string],
            track: string = (title ?? songName) as string,
            album: string = (albumNorm ?? albumName) as string,
            mediaType: string = 'unknown';

        if(artist !== undefined) {
            artists = [artist as string];
        } else if (artistName !== undefined) {
            artists = [artistName as string];
        } else if(subtitle !== undefined) {
            artists = [subtitle as string];
        }

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
        }

        let trackProgressPosition: number | undefined;
        if(currentTime !== undefined && (currentTime > 0 && (duration === undefined || currentTime < (duration + 1)))) {
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
