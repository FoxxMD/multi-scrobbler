import dayjs from "dayjs";
import PlexSource from "./PlexSource.js";
import {TautulliSourceConfig} from "../common/infrastructure/config/source/tautulli.js";
import {InternalConfig, PlayObject} from "../common/infrastructure/Atomic.js";
import {Notifiers} from "../notifier/Notifiers.js";
import {combinePartsToString, truncateStringToLength} from "../utils.js";

const shortDeviceId = truncateStringToLength(10, '');

export default class TautulliSource extends PlexSource {

    declare config: TautulliSourceConfig;
    constructor(name: any, config: TautulliSourceConfig, internal: InternalConfig, notifier: Notifiers) {
        super(name, config, internal, 'tautulli', notifier);
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
            library,
            machine_id = '',
            session_key,
            action,
            platform,
            device,
            player,
        } = obj.body;
        let artists = [artist_name];
        if (track_artist !== undefined && track_artist !== artist_name) {
            artists.push(track_artist);
        }
        if(action === undefined) {
            //TODO why does TS think logger doesn't exist?
            // @ts-ignore
            this.logger.warn(`Payload did contain property 'action', assuming it should be 'watched'`);
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
                event: action === 'watched' ? 'media.scrobble' : action,
                library: library_name ?? library,
                server,
                sourceVersion: version,
                mediaType: media_type,
                user: username,
                source: 'Tautulli',
                newFromSource,
                deviceId: combinePartsToString([shortDeviceId(machine_id), session_key, player])
            }
        }
    }
}
