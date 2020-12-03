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
        let artists = [artist_name];
        if (track_artist !== undefined && track_artist !== artist_name) {
            artists.push(track_artist);
        }
        return {
            data: {
                artists,
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
        const {
            meta: {
                mediaType, user
            },
            data: {
                artists,
                track,
            } = {}
        } = playObj;

        if (this.users !== undefined && user !== undefined && !this.users.includes(user)) {
            this.logger.debug(`Will not scrobble webhook event because author was not an allowed user: ${user}`, artists, track)
            return false;
        }
        if (mediaType !== 'track') {
            this.logger.debug(`Will not scrobble webhook event because media type was not a track (${mediaType})`, artists, track);
            return false;
        }
        return true;
    }
}
