import MemorySource from "./MemorySource.js";
import dayjs from "dayjs";
import {buildTrackString, parseDurationFromTimestamp} from "../utils.js";
import {JellySourceConfig} from "../common/infrastructure/config/source/jellyfin.js";
import {InternalConfig, PlayObject} from "../common/infrastructure/Atomic.js";


export default class JellyfinSource extends MemorySource {
    users;
    servers;

    seenServers = {};

    declare config: JellySourceConfig;

    constructor(name: any, config: JellySourceConfig, internal: InternalConfig) {
        super('jellyfin', name, config, internal);
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
        } = obj;

        const dur = parseDurationFromTimestamp(RunTime);

        return {
            data: {
                artists: [Artist],
                album: Album,
                track: Name,
                duration: dur !== undefined ? dur.as('seconds') : undefined,
                playDate: dayjs(),
            },
            meta: {
                event: NotificationType,
                mediaType: ItemType,
                sourceId: ItemId,
                user: NotificationUsername,
                server: ServerName,
                source: 'Jellyfin',
                newFromSource,
                playbackPosition: parseDurationFromTimestamp(PlaybackPosition),
                sourceVersion: ServerVersion
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

        if (this.users !== undefined) {
            if (user === undefined) {
                this.logger.warn(`Config defined users but payload contained no user info`);
            } else if (!this.users.includes(user.toLocaleLowerCase())) {
                this.logger.debug(`Will not scrobble event because author was not an allowed user: ${user}`, {
                    artists,
                    track
                })
                return false;
            }
        }

        if (event !== undefined && !['PlaybackProgress','PlaybackStarted'].includes(event)) {
            this.logger.debug(`Will not scrobble event because it is not media.scrobble (${event})`, {
                artists,
                track
            })
            return false;
        }

        if (mediaType !== 'Audio') {
            this.logger.debug(`Will not scrobble event because media type was not 'Audio' (${mediaType})`, {
                artists,
                track
            });
            return false;
        }

        if (this.servers !== undefined && !this.servers.includes(server.toLocaleLowerCase())) {
            this.logger.debug(`Will not scrobble event because server was not on allowed list: ${server}`, {
                artists,
                track
            })
            return false;
        }

        return true;
    }

    getRecentlyPlayed = async (options = {}) => {
        return this.statefulRecentlyPlayed;
    }

    handle = async (playObj: any, allClients: any) => {
        if(this.seenServers[playObj.meta.server] === undefined) {
            this.seenServers[playObj.meta.server] = playObj.meta.sourceVersion;
            this.logger.info(`Received data from server ${playObj.meta.server} (Version ${playObj.meta.sourceVersion}) for the first time.`);
        }
        if (!this.isValidEvent(playObj)) {
            return;
        }

        const newPlays = this.processRecentPlays([playObj]);

        for(const p of newPlays) {
            this.logger.info(`New Track => ${buildTrackString(p)}`);
        }

        if(newPlays.length > 0) {
            const recent = await this.getRecentlyPlayed();
            const newestPlay = recent[recent.length - 1];
            try {
                await allClients.scrobble(newPlays, {scrobbleTo: this.clients, scrobbleFrom: this.identifier, checkTime: newestPlay.data.playDate});
                // only gets hit if we scrobbled ok
                this.tracksDiscovered++;
            } catch (e) {
                this.logger.error('Encountered error while scrobbling')
                this.logger.error(e)
            }
        }
    }
}
