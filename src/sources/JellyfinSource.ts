import MemorySource from "./MemorySource.js";
import dayjs from "dayjs";
import {buildTrackString, combinePartsToString, parseDurationFromTimestamp, truncateStringToLength} from "../utils.js";
import {JellySourceConfig} from "../common/infrastructure/config/source/jellyfin.js";
import {InternalConfig, PlayObject} from "../common/infrastructure/Atomic.js";
import EventEmitter from "events";

const shortDeviceId = truncateStringToLength(10, '');

export default class JellyfinSource extends MemorySource {
    users;
    servers;

    multiPlatform: boolean = true;

    declare config: JellySourceConfig;

    constructor(name: any, config: JellySourceConfig, internal: InternalConfig, emitter: EventEmitter) {
        super('jellyfin', name, config, internal, emitter);
        const {data: {users, servers} = {}} = config;

        if (users === undefined || users === null) {
            this.users = undefined;
        } else {
            if (!Array.isArray(users)) {
                this.users = users.split(',')
            } else {
                this.users = users;
            }
            this.users = this.users.map((x: any) => x.toLocaleLowerCase())
        }

        if (servers === undefined || servers === null) {
            this.servers = undefined;
        } else {
            if (!Array.isArray(servers)) {
                this.servers = servers.split(',')
            } else {
                this.servers = servers;
            }
            this.servers = this.servers.map((x: any) => x.toLocaleLowerCase())
        }

        if (users === undefined && servers === undefined) {
            this.logger.warn('Initializing, but with no filters! All tracks from all users on all servers will be scrobbled.');
        } else {
            this.logger.info(`Initializing with the following filters => Users: ${this.users === undefined ? 'N/A' : this.users.join(', ')} | Servers: ${this.servers === undefined ? 'N/A' : this.servers.join(', ')}`);
        }
        this.initialized = true;
    }

    static formatPlayObj(obj: any, newFromSource = false): PlayObject {
        const {
            ServerId,
            ServerName,
            ServerVersion,
            NotificationUsername,
            UserId,
            NotificationType,
            UtcTimestamp,
            Album,
            Artist,
            Name,
            RunTime,
            ItemId,
            ItemType,
            PlaybackPosition,
            connectionId,
            DeviceId = '',
            DeviceName,
            ClientName,
        } = obj;

        const dur = parseDurationFromTimestamp(RunTime);

        let server = ServerName;
        if(server === undefined || server === '') {
            server = ServerId;
        }
        if(server === undefined  || server === '') {
            server = connectionId;
        }

        let artists = [];
        if(Artist !== undefined) {
            artists = [Artist];
        }

        return {
            data: {
                artists,
                album: Album,
                track: Name,
                duration: dur !== undefined ? dur.as('seconds') : undefined,
                playDate: dayjs(),
            },
            meta: {
                event: NotificationType,
                mediaType: ItemType,
                trackId: ItemId,
                user: NotificationUsername ?? UserId,
                server,
                source: 'Jellyfin',
                newFromSource,
                trackProgressPosition: PlaybackPosition !== undefined ? parseDurationFromTimestamp(PlaybackPosition).asSeconds() : undefined,
                sourceVersion: ServerVersion,
                deviceId: combinePartsToString([shortDeviceId(DeviceId), DeviceName])
            }
        }
    }

    isValidEvent = (playObj: PlayObject) => {
        const {
            meta: {
                mediaType, event, user, server
            },
            data: {
                artists,
                track,
            } = {}
        } = playObj;

        if (event !== undefined && !['PlaybackProgress','PlaybackStarted'].includes(event)) {
            this.logger.debug(`Will not scrobble event because event type is not PlaybackProgress or PlaybackStarted, found event: ${event}`)
            return false;
        }

        if (mediaType !== 'Audio') {
            this.logger.debug(`Will not scrobble event because media type was not 'Audio', found type: ${mediaType}`, {
                track
            });
            return false;
        }

        if (this.servers !== undefined && !this.servers.includes(server.toLocaleLowerCase())) {
            this.logger.warn(`Will not scrobble event because server was not on allowed list, found server: ${server}`, {
                track
            })
            return false;
        }

        if (this.users !== undefined) {
            if (user === undefined) {
                this.logger.warn(`Will not scrobble event because config defined users but payload contained no user info`);
                return false;
            } else if (!this.users.includes(user.toLocaleLowerCase())) {
                this.logger.warn(`Will not scrobble event because author was not an allowed user: ${user}`, {
                    artists,
                    track
                })
                return false;
            }
        }

        return true;
    }

    getRecentlyPlayed = async (options = {}) => {
        return this.getFlatRecentlyDiscoveredPlays();
    }

    handle = async (playObj: any) => {
        if (!this.isValidEvent(playObj)) {
            return;
        }

        const newPlays = this.processRecentPlays([playObj]);

        if(newPlays.length > 0) {
            try {
                this.scrobble(newPlays);
            } catch (e) {
                this.logger.error('Encountered error while scrobbling')
                this.logger.error(e)
            }
        }
    }
}
