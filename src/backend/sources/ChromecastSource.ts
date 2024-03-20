import MemorySource from "./MemorySource.js";
import { ChromecastSourceConfig } from "../common/infrastructure/config/source/chromecast.js";
import {
    FormatPlayObjectOptions,
    InternalConfig,
    MdnsDeviceInfo,
    NO_USER,
    PlayerStateData,
    SourceData,
} from "../common/infrastructure/Atomic.js";
import {EventEmitter} from "events";
import {MediaController, PersistentClient, Media, createPlatform} from "@foxxmd/chromecast-client";
import {Client as CastClient} from 'castv2';
import {ErrorWithCause, findCauseByReference} from "pony-cause";
import { PlayObject } from "../../core/Atomic.js";
import dayjs from "dayjs";
import { RecentlyPlayedOptions } from "./AbstractSource.js";
import { difference, genGroupIdStr, isIPv4, mergeArr, parseBool, sleep } from "../utils.js";
import { PlatformApplication, PlatformApplicationWithContext, PlatformType } from "../common/vendor/chromecast/interfaces.js";
import {
    chromePlayerStateToReported,
    genDeviceId,
    getCurrentPlatformApplications,
    getMediaStatus,
    genPlayHash,
} from "../common/vendor/chromecast/ChromecastClientUtils.js";
import {Logger} from "@foxxmd/logging";
import {ContextualValidationError} from "@foxxmd/chromecast-client/dist/cjs/src/utils.js";
import { buildTrackString } from "../../core/StringUtils.js";
import { discoveryAvahi, discoveryNative } from "../utils/MDNSUtils.js";
import {MaybeLogger} from "../common/logging.js";
import e, {application} from "express";
import {NETWORK_ERROR_FAILURE_CODES} from "../common/errors/NodeErrors.js";
import {childLogger} from "@foxxmd/logging";

interface ChromecastDeviceInfo {
    mdns: MdnsDeviceInfo
    client: PersistentClient
    castv2: CastClient
    logger: Logger,
    retries: number
    platform: PlatformType
    applications: Map<string, PlatformApplicationWithContext>
}

export class ChromecastSource extends MemorySource {

    declare config: ChromecastSourceConfig;

    multiPlatform: boolean = true;

    whitelistDevices: string[] = [];
    blacklistDevices: string[] = [];
    // since we check for new devices on every heartbeat we will be discovering blacklisted devices every time since they are never added
    // track which we've already rejected so we only log to verbose instead of info -- to prevent noise at info level
    seenRejectedDevices: string[] = [];

    whitelistApps: string[] = [];
    blacklistApps: string[] = [];

    allowUnknownMedia: string[] | boolean;
    forceMediaRecognitionOn: string[] = [];

    //bonjour?: Bonjour;

    devices: Map<string, ChromecastDeviceInfo> = new Map();

    constructor(name: any, config: ChromecastSourceConfig, internal: InternalConfig, emitter: EventEmitter) {
        super('chromecast', name, config, internal, emitter);
        this.canPoll = true;

        const {
            data = {},
            data: {
                allowUnknownMedia = false,
                useAutoDiscovery,
                devices = [],
                useAvahi= parseBool(process.env.IS_DOCKER)
            } = {},
        } = config;

        for (const propName of ['whitelistDevices', 'blacklistDevices', 'whitelistApps', 'blacklistApps', 'forceMediaRecognitionOn', 'allowUnknownMedia']) {
            const configData = data[propName] ?? [];

            if (!Array.isArray(configData)) {
                this[propName] = configData.split(',').map(x => x.toLocaleLowerCase())
            } else {
                this[propName] = configData.map(x => x.toLocaleLowerCase());
            }
        }

        if (typeof allowUnknownMedia === 'boolean') {
            this.allowUnknownMedia = allowUnknownMedia
        } else {
            this.allowUnknownMedia = allowUnknownMedia.map(x => x.toLocaleLowerCase());
        }

        let ad = useAutoDiscovery;
        if (ad === undefined) {
            // if auto discovery is not explicitly defined then it is enabled/disabled based on if devices were manually configured
            ad = devices.length === 0;
        }
        this.config.data = {
            ...data,
            useAutoDiscovery: ad,
            useAvahi
        }
        
    }

    doBuildInitData = async (): Promise<true | string | undefined> => {
        this.logger.info('Looking for Chromecasts...')

        const {
            data: {
                devices = [],
                useAutoDiscovery
            } = {},
            options: {
                logPayload = false
            } = {},
        } = this.config;

        this.discoverDevices(logPayload);
        if(useAutoDiscovery) {
            this.logger.debug('Will run mDNS discovery on subsequent heartbeats.')
        }

        return true;
    }
    
    discoverDevices = (initial: boolean = false) => {
        const {
            data: {
                useAvahi,
                useAutoDiscovery,
                devices = [],
            } = {}
        } = this.config;

        for (const device of devices) {
            this.initializeDevice({name: device.name, addresses: [device.address], type: 'googlecast'}).catch((err) => {
                this.logger.error(new ErrorWithCause('Uncaught error occurred while connecting to manually configured device', {cause: err}));
            });
        }

        if (useAutoDiscovery) {
            if (useAvahi) {
                this.discoverAvahi(initial).catch((err) => {
                    this.logger.error(new ErrorWithCause('Uncaught error occurred during mDNS discovery via Avahi', {cause: err}));
                });
            } else {
                this.discoverNative(initial).catch((err) => {
                    this.logger.error(new ErrorWithCause('Uncaught error occurred during mDNS discovery', {cause: err}));
                });
            }
        }
    }

    protected discoverAvahi = async (initial: boolean = false) => {
        try {
            await discoveryAvahi('_googlecast._tcp', {
                logger: this.logger,
                sanity: initial,
                onDiscover: (service) => {
                    this.initializeDevice(service);
                },
            });
        } catch (e) {
            this.logger.error(new ErrorWithCause('Uncaught error occurred during mDNS discovery via Avahi', {cause: e}));
        }
    }

    protected discoverNative = async (initial: boolean = false) => {
        try {
            await discoveryNative('_googlecast._tcp', {
                logger: this.logger,
                sanity: initial,
                onDiscover: (service) => {
                    this.initializeDevice(service);
                },
            });
        } catch (e) {
            this.logger.error(new ErrorWithCause('Uncaught error occurred during mDNS discovery', {cause: e}));
        }
    }

    protected initializeDevice = async (device: MdnsDeviceInfo) => {

        if (this.devices.has(device.name)) {
            this.logger.debug(`Chromecast ${device.name} already found, not adding again.`);
            return;
        }

        const discovered = `"${device.name}" at ${device.addresses?.[0]}`;
        const lowerName = device.name.toLocaleLowerCase();
        if (this.whitelistDevices.length > 0) {
            const found = this.whitelistDevices.find(x => lowerName.includes(x));
            if (found !== undefined) {
                this.logger.info(`${discovered} => Adding as a device because it was whitelisted by keyword '${found}'`);
            } else {
                const msg = `${discovered} => NOT ADDING as a device because no part of its name appeared in whitelistDevices`;
                if(!this.seenRejectedDevices.includes(device.name)) {
                    this.seenRejectedDevices.push(device.name);
                    this.logger.info(msg);
                } else {
                    this.logger.verbose(msg);
                }
                return;
            }
        } else if (this.blacklistDevices.length > 0) {
            const found = this.blacklistDevices.find(x => lowerName.includes(x));
            if (found !== undefined) {
                const msg = `${discovered} => NOT ADDING as a device because it was blacklisted by keyword '${found}'`;
                if(!this.seenRejectedDevices.includes(device.name)) {
                    this.seenRejectedDevices.push(device.name);
                    this.logger.info(msg);
                } else {
                    this.logger.verbose(msg);
                }
                return;
            } else {
                this.logger.info(`${discovered} => Adding as a device because no part of its name appeared in blacklistDevices`);
            }
        } else {
            this.logger.info(`${discovered} => Adding as a device`);
        }

        try {
            const [castClient, client, platform] = await this.initializeClientPlatform(device);
            this.logger.info(`${discovered} => Connected!`);
            const applications = new Map<string, PlatformApplicationWithContext>();
            this.devices.set(device.name, {
                mdns: device,
                client,
                castv2: castClient,
                retries: 0,
                platform,
                applications,
                logger: childLogger(this.logger, device.name.substring(0, 25)),
            });
        } catch (e) {
            this.logger.error(e);
            return;
        }
    }

    protected initializeClientPlatform = async (device: MdnsDeviceInfo): Promise<[CastClient, PersistentClient, PlatformType]> => {

        const index = 0;
        for(const address of device.addresses) {

            const castClient = new CastClient;
            const client: PersistentClient = new PersistentClient({host: address, client: castClient});
            client.on('connect', () => this.handleCastClientEvent(device.name, 'connect'));
            client.on('reconnect', () => this.handleCastClientEvent(device.name, 'reconnect'));
            client.on('reconnecting', () => this.handleCastClientEvent(device.name, 'reconnecting'));
            client.on('error', (err) => this.handleCastClientEvent(device.name, 'error', err));
            client.on('close', () => this.handleCastClientEvent(device.name, 'close'));
            try {
                await client.connect();
            } catch (e) {
                if(index < device.addresses.length - 1) {
                    this.logger.warn(new ErrorWithCause(`Could not connect to ${device.name} but more interfaces exist, will attempt next host.`, {cause: e}));
                    continue;
                } else {
                    throw new ErrorWithCause(`Could not connect to ${device.name} and no additional interfaces exist`, {cause: e});
                }
            }

            const platform = createPlatform(client);

            return [castClient, client, platform];
        }
    }

    protected handleCastClientEvent = (clientName: string, event: string, payload?: any) => {
            const info = this.devices.get(clientName);
            switch(event) {
                case 'connect':
                case 'reconnect':
                    if(info === undefined) {
                        return;
                    }
                    if(event === "reconnect") {
                        if(payload instanceof Error) {
                            info.logger.warn(new ErrorWithCause(`Failed to reconnect, will retry ${5 - info.retries} more times`, {cause: e}))
                        } else {
                            info.logger.verbose(`Reconnected`);
                            info.retries = 0;
                        }
                    } else {
                        info.retries = 0;
                    }
                    break;
                case 'reconnecting':
                    if(info === undefined) {
                        return;
                    }
                    info.retries += 1;

                    // TODO make this configurable?
                    if(info.retries >= 4) {
                        this.removeDevice(clientName, 'Device unreachable for more than 20 seconds');
                    }
                    break;
                case 'close':
                    if(info === undefined) {
                        return;
                    }
                    info.logger.debug('Connection was closed');
                    break;
                case 'error':
                    if(info === undefined) {
                        this.logger.error(new ErrorWithCause(`(${clientName}) Encountered error in castv2 lib`, {cause: payload as Error}));
                    } else {
                        if(NETWORK_ERROR_FAILURE_CODES.some(x => (payload as Error).message.includes(x))) {
                            info.logger.warn(new ErrorWithCause(`Encountered network error. Will try to reconnect to device`, {cause: payload as Error}));
                            info.client.client.close();
                        } else {
                            info.logger.error(new ErrorWithCause(`Encountered error in castv2 lib`, {cause: payload as Error}));
                        }
                    }
                    break;
            }
    }

    protected refreshApplications = async () => {
        for(const [k, v] of this.devices.entries()) {
            if(!v.client.connected) {
                continue;
            }

            let apps: PlatformApplication[];
            try {
                apps = await getCurrentPlatformApplications(v.platform);
                v.retries = 0;
            } catch (e) {
                v.logger.warn(new ErrorWithCause(`Could not refresh applications. Will remove after ${5 - v.retries} retries if error does not resolve itself.`, {cause: e}));
                const validationError = findCauseByReference(e, ContextualValidationError);
                if(validationError && validationError.data !== undefined) {
                    v.logger.warn(JSON.stringify(validationError.data));
                }
                v.retries++;
                if(v.retries >= 4) {
                    this.removeDevice(k, 'Unable to refresh application more than 4 times consecutively! If this device comes back online it will be re-added on next heartbeat.');
                }
                continue;
            }

            for(const a of apps) {
                let storedApp = v.applications.get(a.transportId);
                if(!storedApp) {
                    const appName = a.displayName;
                    const found = `Found Application '${appName}-${a.transportId.substring(0, 4)}'`;
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
                            const foundWhiteApp = this.whitelistDevices.find(x => appLowerName.includes(x));
                            if(foundWhiteApp !== undefined) {
                                v.logger.info(`${found} => Watching because it was whitelisted by keyword '${foundWhiteApp}'`);
                            } else {
                                v.logger.info(`${found} => NOT Watching because no part of its name appeared in whitelistApps`);
                                filtered = true;
                            }
                        } else if(this.blacklistApps.length > 0) {
                            const foundBlackApp = this.blacklistDevices.find(x => appLowerName.includes(x));
                            if(foundBlackApp !== undefined) {
                                v.logger.info(`${found} => NOT Watching because it was blacklisted by keyword '${foundBlackApp}'`);
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
                        logger: childLogger(v.logger, `App ${a.displayName.substring(0, 25)}-${a.transportId.substring(0,4)}`)
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

    protected removeDevice = (deviceName: string, reason?: string) => {
        this.removeApplications(deviceName, reason);
        if(reason !== undefined) {
            this.logger.warn(reason);
        }
        const device = this.devices.get(deviceName);
        device.platform.close();
        device.client.close();
        this.devices.delete(deviceName);
    }

    protected removeApplications = (deviceName: string, reason?: string) => {
        const deviceInfo = this.devices.get(deviceName);
        if(deviceInfo === undefined) {
            this.logger.warn(`No device with ${deviceName} exists, no applications to remove.`);
            return;
        }
        for(const [tId, app] of deviceInfo.applications) {
            app.controller.dispose();
            this.deletePlayer(app.playerId, reason)
            //app.logger.close();
            deviceInfo.applications.delete(tId);
        }
    }

    protected pruneApplications = (force: boolean = false) => {
        for(const [k, v] of this.devices.entries()) {
            if (!force && !v.client.connected) {
                continue;
            }

            const forDeletion: [string, string][] = [];

            for(const [tId, app] of v.applications.entries()) {
                if(app.stale && Math.abs(app.staleAt.diff(dayjs(), 's')) > 60) {
                    app.logger.info(`Removing due to being stale for 60 seconds`);
                    //app.logger.close();
                    app.controller.dispose();
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
        const plays: SourceData[] = [];

        try {
            await this.refreshApplications();
        } catch (e) {
            this.logger.warn(new ErrorWithCause('Could not refresh all applications', {cause: e}));
        }

        for (const [k, v] of this.devices.entries()) {
            if (!v.client.connected || v.retries > 0) {
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
                        }

                        const validationError = findCauseByReference(e, ContextualValidationError);
                        if (validationError && validationError.data !== undefined) {
                            const  {
                                status = []
                            } = validationError.data as Record<string, any>;
                            if(status[0] !== undefined) {
                               const {
                                    media: {
                                        streamType = undefined
                                    } = {}
                                } = status[0] || {};
                                if(streamType === 'BUFFERED') {
                                    let maybePlay: PlayObject | undefined;
                                    try {
                                        maybePlay = ChromecastSource.formatPlayObj(status[0]);
                                    } catch (e) {
                                        // its fine just do error without play string
                                    }
                                    application.logger.verbose(`Skipping status for ${maybePlay !== undefined ? buildTrackString(maybePlay) : 'unknown media'} because it is buffering.`);
                                    if (this.config.options.logPayload) {
                                        application.logger.debug(`Media Status Payload:\n ${status[0] === undefined || status[0] === null ? 'undefined' : JSON.stringify(status[0])}`);
                                    }
                                    continue;
                                }
                            }
                            application.logger.warn(JSON.stringify(validationError.data));
                        }

                        throw e;
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

                    const playHash = genPlayHash(play);
                    let shouldLogOnUnknown = false;
                    if (playHash !== application.lastPlayHash) {
                        application.lastPlayHash = playHash;
                        shouldLogOnUnknown = true;
                    }
                    // only log the FIRST time we see a play so that we aren't making logs noisy
                    const unknownLogger = new MaybeLogger(shouldLogOnUnknown ? application.logger : undefined);

                    if (play.meta.mediaType !== 'music') {
                        const playInfo = buildTrackString(play);
                        const forcedBy = this.forceMediaRecognitionOn.find(x => application.displayName.toLocaleLowerCase().includes(x));
                        if (forcedBy !== undefined) {
                            unknownLogger.verbose(`${playInfo} has non-music type (${play.meta.mediaType}) but was forced recognized by keyword "${forcedBy}"`);
                        } else if (play.meta.mediaType === 'unknown') {
                            if (this.allowUnknownMedia === false) {
                                unknownLogger.verbose(`${playInfo} has 'unknown' media type and allowUnknownMedia=false, will not track`);
                                continue;
                            } else if (Array.isArray(this.allowUnknownMedia)) {
                                const allowedBy = this.allowUnknownMedia.find(x => application.displayName.toLocaleLowerCase().includes(x))
                                if (allowedBy) {
                                    unknownLogger.verbose(`${playInfo} has 'unknown' media type but was allowed by keyword "${allowedBy}" in allowUnknownMedia`);
                                } else {
                                    unknownLogger.verbose(`${playInfo} has 'unknown' media type and App name was not found in allowUnknownMedia, will not track`);
                                    continue;
                                }
                            } else {
                                unknownLogger.verbose(`${playInfo} has 'unknown' media type and allowUnknownMedia=true`);
                            }
                        } else {
                            unknownLogger.verbose(`${playInfo} has non-music type (${play.meta.mediaType}) so will not track`);
                        }
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
            } = {}
        } = obj;

        let artists: string[] = [],
            albumArtists: string[] = [],
            mediaType: string = 'unknown';

            const track: string = (title ?? songName) as string;
            const album: string = (albumNorm ?? albumName) as string;

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
