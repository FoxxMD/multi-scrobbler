import dayjs from "dayjs";
import {buildTrackString, readJson} from "../utils.js";

export default class PlexSource {

    name = 'Plex';

    logger;
    clients;
    users;

    discoveredTracks = 0;

    constructor(logger, clients, {user = process.env.PLEX_USER} = {}, name = 'Plex') {
        this.logger = logger;
        this.clients = clients;
        this.name = name;

        if (user === undefined || user === null) {
            this.users = undefined;
        } else if (!Array.isArray(user)) {
            this.users = [user];
        } else {
            this.users = user;
        }

        if (this.users === undefined) {
            this.logger.warn('Initialized with no users specified! Tracks from all users will be scrobbled.', {label: this.name});
        } else {
            this.logger.info(`Initialized with allowed users: ${this.users.join(', ')}`, {label: this.name});
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
        const {meta: {mediaType, title, event, user}} = playObj;

        if (this.users !== undefined && user !== undefined && !this.users.includes(user)) {
            this.logger.debug(`Will not scrobble webhook event because author was not an allowed user: ${user}`, {label: this.name})
            return false;
        }

        if (event !== 'media.scrobble') {
            this.logger.debug(`Will not scrobble webhook event because it is not media.scrobble (${event})`, { label: this.name })
            return false;
        }

        if (mediaType !== 'track') {
            this.logger.debug(`Will not scrobble webhook event because media type was not a track (${mediaType}). Item: ${title}`, {label: this.name});
            return false;
        }

        return true;
    }

    handle = async (playObj) => {
        if (!this.isValidEvent(playObj)) {
            return;
        }

        this.logger.info(`New Track => ${buildTrackString(playObj)}`, {label: this.name});
        try {
            await this.clients.scrobble(playObj);
            // only gets hit if we scrobbled ok
            this.discoveredTracks++;
        } catch (e) {
            this.logger.error('Encountered error while scrobbling', {label: this.name})
            this.logger.error(e, {label: this.name})
        }
    }
}
