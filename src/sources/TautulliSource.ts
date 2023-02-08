import dayjs from "dayjs";
import PlexSource from "./PlexSource.js";

// @ts-expect-error TS(2417): Class static side 'typeof TautulliSource' incorrec... Remove this comment to see the full error message
export default class TautulliSource extends PlexSource {

    constructor(name: any, config: any, clients: any) {
        super(name, config, clients, 'tautulli');
    }

    static formatPlayObj(obj: any, newFromSource = false) {
        const {
            artist_name,
            track_name,
            track_artist,
            album_name,
            media_type,
            title,
            library_name,
            server,
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
                duration,
                playDate: dayjs(),
            },
            meta: {
                title,
                library: library_name,
                server,
                mediaType: media_type,
                user: username,
                trackLength: duration,
                source: 'Tautulli',
                newFromSource,
            }
        }
    }
}
