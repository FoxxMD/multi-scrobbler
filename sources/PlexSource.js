import dayjs from "dayjs";
import {buildTrackString, readJson} from "../utils.js";

export default class PlexSource {

    name = 'Plex';

    logger;
    clients;
    user;

    discoveredTracks = 0;

    async constructor(logger, clients, {configDir, config} = {}) {
        this.logger = logger;
        this.clients = clients;

        let configData = config;
        if (config === undefined) {
            try {
                configData = await readJson(`${configDir}/plex.json`);
            } catch (e) {
                // no config exists, skip this client
            }
        }
        const {
            user = process.env.PLEX_USER,
        } = configData || {};

        this.user = user;
    }


    static formatPlayObj(obj) {
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
            }
        }
    }

    handle = async (payload) => {
        const playObj = PlexSource.formatPlayObj(payload);
        const {meta: {mediaType, title, event, user}} = playObj;
        if (event !== 'media.scrobble') {
            this.logger.debug(`Will not scrobble webhook event because it is not media.scrobble: ${event}`, {
                event,
                label: this.name
            })
            return;
        }
        if (this.user !== undefined && user !== undefined) {
            if (Array.isArray(this.user)) {
                if (this.user.includes(user)) {
                    this.logger.debug(`Will not scrobble webhook event because specified user was not part of user array`, {
                        user,
                        label: this.name
                    })
                    return;
                }
            } else if (this.user === user) {
                this.logger.debug(`Will not scrobble webhook event because specified user was not found`, {
                    user,
                    label: this.name
                })
                return;
            }
        }
        if (mediaType !== 'track') {
            this.logger.warn(`Webhook posted a non-music media type (${mediaType}), not scrobbling this. Item: ${title}`, {label: this.name});
        } else {
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
}
