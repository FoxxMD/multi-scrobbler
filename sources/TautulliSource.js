import dayjs from "dayjs";
import {buildTrackString, readJson} from "../utils.js";

export default class TautulliSource {

    name = 'Tautulli';

    logger;
    clients;
    user;

    discoveredTracks = 0;

    constructor(logger, clients, { user = process.env.PLEX_USER } = {}) {
        this.logger = logger;
        this.clients = clients;
        this.user = user;
    }

    static formatPlayObj(obj) {
        const {
            artist_name,
            track_name,
            track_artist,
            album_name,
            media_type,
            title,
            library_name,
            duration,
            username,
        } = obj;
        let artist = artist_name;
        if (track_artist !== undefined && track_artist !== artist_name) {
            artist = `${artist},${track_artist}`;
        }
        return {
            data: {
                artist,
                album: album_name,
                track: track_name,
                playDate: dayjs(),
            },
            meta: {
                title,
                library: library_name,
                mediaType: media_type,
                user: username,
                trackLength: duration,
            }
        }
    }

    handle = async (req) => {
        const playObj = TautulliSource.formatPlayObj(req.body);
        const {meta: {mediaType, title, user}} = playObj;

        if (this.user !== undefined && user !== undefined) {
            if (Array.isArray(this.user)) {
                if (this.user.includes(user)) {
                    this.logger.debug(`Will not scrobble webhook event because specified user was not part of user array`, {
                        user,
                        label: this.name
                    })
                    return;
                }
            } else if (this.user !== user) {
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
                await this.clients.scrobble([playObj], { source: this.name });
                // only gets hit if we scrobbled ok
                this.discoveredTracks++;
            } catch (e) {
                this.logger.error('Encountered error while scrobbling', {label: this.name})
                this.logger.error(e, {label: this.name})
            }
        }
    }
}
