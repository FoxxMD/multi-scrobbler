import dayjs from "dayjs";
import {buildTrackString, createLabelledLogger} from "../utils.js";

export default class PlexSource {

    logger;
    clients;
    users;

    discoveredTracks = 0;

    constructor(clients, {user = process.env.PLEX_USER} = {}, {name: loggerName = 'plex', label = 'Plex'} = {}) {
        this.logger = createLabelledLogger(loggerName, label);
        this.clients = clients;

        if (user === undefined || user === null) {
            this.users = undefined;
        } else if (!Array.isArray(user)) {
            this.users = [user];
        } else {
            this.users = user;
        }

        if (this.users === undefined) {
            this.logger.warn('Initialized with no users specified! Tracks from all users will be scrobbled.');
        } else {
            this.logger.info(`Initialized with allowed users: ${this.users.join(', ')}`);
        }
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
            } = {}
        } = obj;
        return {
            data: {
                artist,
                album,
                track,
                playDate: dayjs(),
            },
            meta: {
                event,
                mediaType: type,
                user,
                source: 'Plex',
                newFromSource,
            }
        }
    }

    isValidEvent = (playObj) => {
        const {
            meta: {
                mediaType, event, user
            },
            data: {
                artist,
                track,
            } = {}
        } = playObj;

        if (this.users !== undefined && user !== undefined && !this.users.includes(user)) {
            this.logger.debug(`Will not scrobble webhook event because author was not an allowed user: ${user}`, artist, track)
            return false;
        }

        if (event !== 'media.scrobble') {
            this.logger.debug(`Will not scrobble webhook event because it is not media.scrobble (${event})`, artist, track)
            return false;
        }

        if (mediaType !== 'track') {
            this.logger.debug(`Will not scrobble webhook event because media type was not a track (${mediaType})`, artist, track);
            return false;
        }

        return true;
    }

    handle = async (playObj) => {
        if (!this.isValidEvent(playObj)) {
            return;
        }

        this.logger.info(`New Track => ${buildTrackString(playObj)}`);
        try {
            await this.clients.scrobble(playObj);
            // only gets hit if we scrobbled ok
            this.discoveredTracks++;
        } catch (e) {
            this.logger.error('Encountered error while scrobbling')
            this.logger.error(e)
        }
    }
}
