import dayjs from "dayjs";
import PlexSource from "./PlexSource.js";
import {TautulliSourceConfig} from "../common/infrastructure/config/source/tautulli.js";
import {InternalConfig, PlayObject} from "../common/infrastructure/Atomic.js";

export default class TautulliSource extends PlexSource {

    declare config: TautulliSourceConfig;
    constructor(name: any, config: TautulliSourceConfig, internal: InternalConfig) {
        super(name, config, internal, 'tautulli');
    }

    static formatPlayObj(obj: any, newFromSource = false): PlayObject {
        const {
            artist_name,
            track_name,
            track_artist,
            album_name,
            media_type,
            title,
            library_name,
            server,
            version,
            duration,
            username,
            library
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
                library: library_name ?? library,
                server,
                sourceVersion: version,
                mediaType: media_type,
                user: username,
                trackLength: duration,
                source: 'Tautulli',
                newFromSource,
            }
        }
    }
}
