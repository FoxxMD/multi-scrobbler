import dayjs from "dayjs";
import {buildTrackString} from "../utils.js";

export default class TautulliSource {

    name = 'Tautulli';

    logger;
    clients;

    discoveredTracks = 0;

    constructor(logger, clients) {
        this.logger = logger;
        this.clients = clients;
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
                trackLength: duration,
            }
        }
    }

    handle = async (req) => {
        const playObj = TautulliSource.formatPlayObj(req.body);
        const {meta: {mediaType, title}} = playObj;
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
