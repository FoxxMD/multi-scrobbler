import dayjs from "dayjs";
import PlexSource from "./PlexSource.js";

export default class TautulliSource extends PlexSource {

    constructor(clients, json) {
        super(clients, json, {name: 'tautulli', label: 'Tautulli'});
    }

    static formatPlayObj(obj, newFromSource = false) {
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
                source: 'Tautulli',
                newFromSource,
            }
        }
    }

    isValidEvent = (playObj) => {
        const {meta: {mediaType, title, user}} = playObj;

        if (this.users !== undefined && user !== undefined && !this.users.includes(user)) {
            this.logger.debug(`Will not scrobble webhook event because author was not an allowed user: ${user}`)
            return false;
        }
        if (mediaType !== 'track') {
            this.logger.debug(`Will not scrobble webhook event because media type was not a track (${mediaType}). Item: ${title}`);
            return false;
        }
        return true;
    }
}
