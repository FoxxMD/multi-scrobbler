import MemorySource from "./MemorySource.js";
import dayjs from "dayjs";
import {buildTrackString, combinePartsToString, parseDurationFromTimestamp, truncateStringToLength} from "../utils.js";
import {JellySourceConfig} from "../common/infrastructure/config/source/jellyfin.js";
import {FormatPlayObjectOptions, InternalConfig, PlayObject} from "../common/infrastructure/Atomic.js";
import EventEmitter from "events";

const shortDeviceId = truncateStringToLength(10, '');

export default class JellyfinSource extends MemorySource {
    users;
    servers;

    multiPlatform: boolean = true;

    declare config: JellySourceConfig;

    constructor(name: any, config: JellySourceConfig, internal: InternalConfig, emitter: EventEmitter) {
        super('jellyfin', name, config, internal, emitter);
        const {
            data: {
            users,
            servers,
            options: {
                logFilterFailure = 'warn'
                } = {}
            } = {}
        } = config;

        if(logFilterFailure !== false && !['debug', 'warn'].includes(logFilterFailure)) {
            this.logger.warn(`logFilterFailure value of '${logFilterFailure.toString()}' is NOT VALID. Logging will not occur if filters fail. You should fix this.`);
        }

        if (users === undefined || users === null) {
            this.users = undefined;
        } else {
            if (!Array.isArray(users)) {
                if(users.trim() === '') {
                    this.users = undefined;
                } else {
                    this.users = users.split(',').map(x => x.trim());
                }
            } else {
                this.users = users;
            }
            if(this.users !== undefined) {
                this.users = this.users.map((x: any) => x.toLocaleLowerCase())
            }
        }

        if (servers === undefined || servers === null) {
            this.servers = undefined;
        } else {
            if (!Array.isArray(servers)) {
                if(servers.trim() === '') {
                    this.servers = undefined;
                } else {
                    this.servers = servers.split(',').map(x => x.trim());
                }
            } else {
                this.servers = servers;
            }
            if(this.servers !== undefined) {
                this.servers = this.servers.map((x: any) => x.toLocaleLowerCase());
            }
        }

        if (users === undefined && servers === undefined) {
            this.logger.warn('Initializing, but with no filters! All tracks from all users on all servers will be scrobbled.');
        } else {
            this.logger.info(`Initializing with the following filters => Users: ${this.users === undefined ? 'N/A' : this.users.join(', ')} | Servers: ${this.servers === undefined ? 'N/A' : this.servers.join(', ')}`);
        }
        this.initialized = true;
    }

    static formatPlayObj(obj: any, options: FormatPlayObjectOptions = {}): PlayObject {
        const {newFromSource = false} = options;
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
            Provider_musicbrainzalbumartist,
            Provider_musicbrainzartist,
            Provider_musicbrainzalbum,
            Provider_musicbrainztrack,
            Provider_musicbrainzreleasegroup
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
                meta: {
                    brainz: {
                        artist: Provider_musicbrainzartist,
                        album: Provider_musicbrainzalbum,
                        albumArtist: Provider_musicbrainzalbumartist,
                        track: Provider_musicbrainztrack,
                        releaseGroup: Provider_musicbrainzreleasegroup
                    }
                }
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

    protected logFilterFailure = (str: string, meta?: any) => {
        const {
            data: {
                options: {
                    logFilterFailure = 'warn'
                } = {}
            } = {}
        } = this.config;

        if(logFilterFailure === false || !['warn','debug'].includes(logFilterFailure)) {
            return false;
        }

        this.logger[logFilterFailure](str, meta);
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
            this.logFilterFailure(`Will not scrobble event because server was not an allowed server. Expected: ${this.servers.map(x => `'${x}'`).join(' or ')} | Found: '${server.toLocaleLowerCase()}'`, {
                track
            })
            return false;
        }

        if (this.users !== undefined) {
            if (user === undefined) {
                this.logFilterFailure(`Will not scrobble event because config defined users but payload contained no user info`);
                return false;
            } else if (!this.users.includes(user.toLocaleLowerCase())) {
                this.logFilterFailure(`Will not scrobble event because author was not an allowed user. Expected: ${this.users.map(x => `'${x}'`).join(' or ')} | Found: '${user.toLocaleLowerCase()}'`, {
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
