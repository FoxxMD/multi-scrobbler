import MemorySource from "./MemorySource";
import {ChromecastSourceConfig} from "../common/infrastructure/config/source/chromecast";
import {
    FormatPlayObjectOptions,
    InternalConfig, MdnsDeviceInfo, NO_USER,
    PlayerStateData,
    SourceData
} from "../common/infrastructure/Atomic";
import {EventEmitter} from "events";
import {Browser, ServiceType, Service} from '@astronautlabs/mdns';
import AvahiBrowser from 'avahi-browse';
import {MediaController, PersistentClient, Media} from "chromecast-client";
import {Client as CastClient} from 'castv2';
import {ErrorWithCause, findCauseByReference} from "pony-cause";
import {PlayObject} from "../../core/Atomic";
import dayjs from "dayjs";
import {RecentlyPlayedOptions} from "./AbstractSource";
import {difference, genGroupIdStr, isIPv4, mergeArr, parseBool, sleep} from "../utils";
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
    mdns: MdnsDeviceInfo
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

    //bonjour?: Bonjour;

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

        const {
            data: {
                useAvahi = parseBool(process.env.IS_DOCKER)
            } = {}
        } = this.config;

        if(useAvahi) {
            await this.discoverAvahi();
        } else {
            await this.discoverNative();
        }
        this.initialized = true;
        return true;
    }

    discoverAvahi = async () => {
        this.logger.debug('Trying discovery with Avahi');
        try {
            const browser = new AvahiBrowser('_googlecast._tcp');
            browser.on(AvahiBrowser.EVENT_SERVICE_UP, async (service) => {
                this.logger.debug(`Resolved device ${service.target.service_type} - ${service.target.host} - ${service.service_name}`);
                if(isIPv4(service.target.host)) {
                    this.initializeDevice({name: service.service_name, addresses: [service.target.host], type: 'googlecast'}).catch((err) => {
                        this.logger.error(err);
                    });
                }
            });
            browser.on(AvahiBrowser.EVENT_DNSSD_ERROR, (err) => {
                throw err;
            });
            browser.start();
        } catch (e) {
            this.logger.warn(new ErrorWithCause('mDNS device discovery with avahi-browse failed, falling back to native discovery', {cause: e}));
            this.discoverNative().catch((err) => {
               this.logger.error(err);
            });
        }
    }

    discoverNative = async () => {
        this.logger.debug('Trying discovery with native mDNS querying');
        if(this.config.options.logPayload) {
            let services: ServiceType[] = [];
            const testBrowser = new Browser(ServiceType.all())
                .on('serviceUp', (service: ServiceType) => {
                    services.push(service)
                })
                .start();
            this.logger.debug('Waiting 1s to gather advertised mdns services...');
            await sleep(1000);
            testBrowser.stop();
            if(services.length === 0) {
                this.logger.debug('Did not find any mdns services! Do you have port 5353 open?');
            } else {
                this.logger.debug(`Found services: ${services.map(x => `${x.name}-${x.protocol}`).join(' ,')}`);
            }
        }

        const browser = new Browser('_googlecast._tcp', {resolve: true})
            .on('serviceUp', (service) => {
                this.logger.debug(`Resolved device "${service.name}" at ${service.addresses?.[0]}`);
                this.initializeDevice({name: service.name, addresses: service.addresses, type: 'googlecast'}).catch((e) => {
                    this.logger.error(e);
                });
            })
            .start();
    }

    protected initializeDevice = async (device: MdnsDeviceInfo) => {

        if (this.devices.has(device.name)) {
            this.logger.warn(`Chromecast ${device.name} already found, not adding again.`);
            return;
        }

        const discovered = `Discovered chromecast "${device.name}" at ${device.addresses?.[0]}`;
        const lowerName = device.name.toLocaleLowerCase();
        if (this.whitelistDevices.length > 0) {
            const found = this.whitelistDevices.find(x => lowerName.includes(x));
            if (found !== undefined) {
                this.logger.info(`${discovered} => Adding as a player because it was whitelisted by keyword '${found}'`);
            } else {
                this.logger.info(`${discovered} => NOT ADDING as a player because no part of its name appeared in whitelistDevices`);
                return;
            }
        } else if (this.blacklistDevices.length > 0) {
            const found = this.blacklistDevices.find(x => lowerName.includes(x));
            if (found !== undefined) {
                this.logger.info(`${discovered} => NOT ADDING as a player because it was blacklisted by keyword '${found}'`);
                return;
            } else {
                this.logger.info(`${discovered} => Adding as a player because no part of its name appeared in blacklistDevices`);
            }
        } else {
            this.logger.info(`${discovered} => Adding as a player`);
        }

        try {
            const [castClient, client, platform] = await initializeClientPlatform(device);
            const applications = new Map<string, PlatformApplicationWithContext>();
            this.devices.set(device.name, {
                mdns: device,
                client,
                castv2: castClient,
                connected: true,
                retries: 0,
                platform,
                applications,
                logger: this.logger.child({labels: [device.name.substring(0, 25)]}, mergeArr),
            });
            castClient.on('connect', () => this.handleCastClientEvent(device.name, 'connect'));
            castClient.on('error', (err) => this.handleCastClientEvent(device.name, 'error', err));
            castClient.on('close', () => this.handleCastClientEvent(device.name, 'close'));
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
                    let found = `Found Application '${appName}-${a.transportId.substring(0, 4)}'`;
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
                        badData: false,
                        validAppType: valid,
                        playerId: genGroupIdStr([genDeviceId(k, a.displayName), NO_USER]),
                        logger: v.logger.child({labels: [`App ${a.displayName.substring(0, 25)}-${a.transportId.substring(0,4)}`]}, mergeArr)
                    }
                    v.applications.set(a.transportId, storedApp);
                } else if(storedApp.stale === true) {
                    storedApp.logger.verbose(`No longer stale!`);
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
                    staleApp.logger.verbose(`Became stale and is unused, removing immediately.`);
                    //staleApp.logger.close();
                    v.applications.delete(staleId);
                } else if(!staleApp.stale) {
                    staleApp.logger.verbose(`Became stale`);
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
            //app.logger.close();
            deviceInfo.applications.delete(tId);
        }
    }

    protected pruneApplications = (force: boolean = false) => {
        for(const [k, v] of this.devices.entries()) {
            if (!force && !v.connected) {
                continue;
            }

            const forDeletion: [string, string][] = [];

            for(const [tId, app] of v.applications.entries()) {
                if(app.stale && Math.abs(app.staleAt.diff(dayjs(), 's')) > 60) {
                    app.logger.info(`Removing due to being stale for 60 seconds`);
                    //app.logger.close();
                    v.applications.delete(tId);
                    forDeletion.push([app.playerId, 'No updates for 60 seconds']);
                } else if(app.badData && Math.abs(app.badDataAt.diff(dayjs(), 's')) > 60 && this.players.has(app.playerId)) {
                    forDeletion.push([app.playerId, 'Bad data for 60 seconds']);
                }
            }
            if(forDeletion.length > 0) {
                // if the cast device disconnected and reconnected (for some reason)
                // or a user disconnected and then reconnected manually
                // -- for the same *app*
                // then the same playerId will exist for two applications that have different destination/session ids
                // and we don't want to delete the player if another exists that isn't also being deleted
                for(const [playerId, reason] of forDeletion) {
                    if(!this.players.has(playerId)) {
                        // already deleted
                        continue;
                    }
                    const apps = Array.from(v.applications.values());
                    // check that either all apps with this player id are gone
                    if(apps.every((x => x.playerId !== playerId))) {
                        this.deletePlayer(playerId, reason);
                    }// or that all actually have bad data
                    else if(!apps.some(x => x.playerId === x.playerId && !x.badData)) {
                        this.deletePlayer(playerId, reason);
                    }
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

        for (const [k, v] of this.devices.entries()) {
            if (!v.connected) {
                continue;
            }

            for (const [tId, application] of v.applications.entries()) {

                try {

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
                            v.logger.debug(`Timeout occurred`);
                            //v.applications.delete(application.transportId);
                            // TODO count timeouts before setting app as stale
                            continue;
                        } else {
                            throw e;
                        }
                    }

                    if (this.config.options.logPayload) {
                        application.logger.debug(`Media Status Payload:\n ${mediaStatus === undefined || mediaStatus === null ? 'undefined' : JSON.stringify(mediaStatus)}`);
                    }

                    let play: PlayObject | undefined;
                    if(mediaStatus !== undefined && mediaStatus !== null) {
                       play = ChromecastSource.formatPlayObj(mediaStatus, {
                            deviceId: genDeviceId(k, application.displayName),
                            source: application.displayName
                        });
                    }

                    if (play === undefined || play.data.artists.length === 0 || play.data.track === undefined) {
                        if (!application.badData) {
                            application.logger.warn(`Media information either did not return artists or track. This isn't scrollable! Skipping this update and marking App as having bad data (to be removed after 60 seconds)`);
                            application.badData = true;
                            application.badDataAt = dayjs();
                        }
                        continue;
                    } else if (application.badData) {
                        application.logger.verbose(`Media information is now valid.`);
                        application.badData = false;
                        application.badDataAt = undefined;
                    }

                    const playerState: PlayerStateData = {
                        platformId: [play.meta.deviceId, NO_USER],
                        play,
                        position: play.meta.trackProgressPosition,
                        status: chromePlayerStateToReported(mediaStatus.playerState)
                    }
                    plays.push(playerState);

                } catch (e) {
                    application.logger.warn(new ErrorWithCause(`Could not get Player State`, {cause: e}))
                    const validationError = findCauseByReference(e, ContextualValidationError);
                    if (validationError && validationError.data !== undefined) {
                        application.logger.warn(JSON.stringify(validationError.data));
                    }
                }
            }
        }

        const playsToReturn = this.processRecentPlays(plays);

        this.pruneApplications();

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
            albumArtists: string[] = [],
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

        if(albumArtist !== undefined) {
            albumArtists = [albumArtist as string];
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
