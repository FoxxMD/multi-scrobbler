import MemorySource from "./MemorySource.js";
import dayjs from "dayjs";
import {buildTrackString} from "../utils.js";


export default class JellyfinSource extends MemorySource {
    users;
    servers;

    constructor(name, config, clients, type = 'jellyfin') {
        super(type, name, config, clients);
        const {users, servers} = config

        if (users === undefined || user === null) {
            this.users = undefined;
        } else {
            if (!Array.isArray(users)) {
                this.users = [users];
            } else {
                this.users = users;
            }
            this.users = this.users.map(x => x.toLocaleLowerCase())
        }

        if (servers === undefined || servers === null) {
            this.servers = undefined;
        } else {
            if (!Array.isArray(servers)) {
                this.servers = [servers];
            } else {
                this.servers = servers;
            }
            this.servers = this.servers.map(x => x.toLocaleLowerCase())
        }

        if (users === undefined && servers === undefined) {
            this.logger.warn('Initializing, but with no filters! All tracks from all users on all servers will be scrobbled.');
        } else {
            this.logger.info(`Initializing with the following filters => Users: ${this.users === undefined ? 'N/A' : this.users.join(', ')} | Servers: ${this.servers === undefined ? 'N/A' : this.servers.join(', ')}`);
        }
        this.initialized = true;
    }

    static formatPlayObj(obj, newFromSource = false) {
        const {
            ServerId,
            ServerName,
            Username,
            UserId,
            NotificationType,
            UtcTimestamp,
            Album,
            Artist,
            Name,
            RunTime,
            ItemId,
            ItemType,
        } = obj;

        const parsedRuntime = RunTime.split(':');
        const dur = dayjs.duration({
            hours: Number.parseInt(parsedRuntime[0]),
            minutes: Number.parseInt(parsedRuntime[1]),
            seconds: Number.parseInt(parsedRuntime[2])
        });

        return {
            data: {
                artists: [Artist],
                album: Album,
                track: Name,
                duration: dur.as('seconds'),
                playDate: dayjs(),
            },
            meta: {
                event: NotificationType,
                mediaType: ItemType,
                sourceId: ItemId,
                user: Username,
                server: ServerName,
                source: 'Jellyfin',
                newFromSource,
            }
        }
    }

    isValidEvent = (playObj) => {
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
                this.logger.warn(`Config defined users but payload contained no user info${hint}`);
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

    handle = async (playObj, allClients) => {
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
