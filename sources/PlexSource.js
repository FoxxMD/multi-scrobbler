import dayjs from "dayjs";import LastFm from "lastfm-node-client";
import LastfmScrobbler from '../clients/LastfmScrobbler.js';
import {buildTrackString} from "../utils.js";
import AbstractSource from "./AbstractSource.js";

export default class PlexSource extends AbstractSource {
    users;
    libraries;
    servers;

    constructor(name, config, clients, type = 'plex') {
        super(type, name, config, clients);
        const {user, libraries, servers} = config

        if (user === undefined || user === null) {
            this.users = undefined;
        } else {
            if (!Array.isArray(user)) {
                this.users = [user];
            } else {
                this.users = user;
            }
            this.users = this.users.map(x => x.toLocaleLowerCase())
        }

        if (libraries === undefined || libraries === null) {
            this.libraries = undefined;
        } else {
            if (!Array.isArray(libraries)) {
                this.libraries = [libraries];
            } else {
                this.libraries = libraries;
            }
            this.libraries = this.libraries.map(x => x.toLocaleLowerCase())
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

        if (user === undefined && libraries === undefined && servers === undefined) {
            this.logger.warn('Initializing, but with no filters! All tracks from all users on all servers and libraries will be scrobbled.');
        } else {
            this.logger.info(`Initializing with the following filters => Users: ${this.users === undefined ? 'N/A' : this.users.join(', ')} | Libraries: ${this.libraries === undefined ? 'N/A' : this.libraries.join(', ')} | Servers: ${this.servers === undefined ? 'N/A' : this.servers.join(', ')}`);
        }
        this.initialized = true;
    }

    static formatPlayObj(obj, newFromSource = false) {
        const {
            event,
            Account: {
                title: user,
            } = {},
            Metadata: {
                type,
                title: track,
                parentTitle: album,
                grandparentTitle: artist,
                librarySectionTitle: library
            } = {},
            Server: {
                title: server
            } = {},
        } = obj;
        return {
            data: {
                artists: [artist],
                album,
                track,
                playDate: dayjs(),
            },
            meta: {
                event,
                mediaType: type,
                user,
                library,
                server,
                source: 'Plex',
                newFromSource,
            }
        }
    }

    isValidEvent = (playObj) => {
        const {
            meta: {
                mediaType, event, user, library, server
            },
            data: {
                artists,
                track,
            } = {}
        } = playObj;

        const hint = this.type === 'tautulli' ? ' (Check notification agent json data configuration)' : '';

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

        if (event !== undefined && event !== 'media.scrobble') {
            this.logger.debug(`Will not scrobble event because it is not media.scrobble (${event})`, {
                artists,
                track
            })
            return false;
        }

        if (mediaType !== 'track') {
            this.logger.debug(`Will not scrobble event because media type was not a track (${mediaType})`, {
                artists,
                track
            });
            return false;
        }

        if (this.libraries !== undefined) {
            if (library === undefined) {
                this.logger.warn(`Config defined libraries but payload contained no library info${hint}`);
            } else if (!this.libraries.includes(library.toLocaleLowerCase())) {
                this.logger.debug(`Will not scrobble event because library was not on allowed list: ${library}`, {
                    artists,
                    track
                })
                return false;
            }
        }

        if (this.servers !== undefined) {
            if (server === undefined) {
                this.logger.warn(`Config defined server but payload contained no server info${hint}`);
            } else if (!this.servers.includes(server.toLocaleLowerCase())) {
                this.logger.debug(`Will not scrobble event because server was not on allowed list: ${server}`, {
                    artists,
                    track
                })
                return false;
            }
        }

        return true;
    }

    handle = async (playObj, allClients) => {
        if (!this.isValidEvent(playObj)) {
            return;
        }

        this.logger.info(`New Track => ${buildTrackString(playObj)}`);
        try {
            await allClients.scrobble(playObj, {scrobbleTo: this.clients, scrobbleFrom: this.identifier});
            // only gets hit if we scrobbled ok
            this.tracksDiscovered++;
        } catch (e) {
            this.logger.error('Encountered error while scrobbling')
            this.logger.error(e)
        }
    }
}
