import dayjs from "dayjs";
import PlexSource from "./PlexSource.js";
import {TautulliSourceConfig} from "../common/infrastructure/config/source/tautulli.js";
import {FormatPlayObjectOptions, InternalConfig, PlayObject} from "../common/infrastructure/Atomic.js";
import {combinePartsToString} from "../utils.js";
import EventEmitter from "events";
import {Request} from "express";
import {truncateStringToLength} from "../utils/StringUtils.js";

const shortDeviceId = truncateStringToLength(10, '');

export default class TautulliSource extends PlexSource {

    declare config: TautulliSourceConfig;
    constructor(name: any, config: TautulliSourceConfig, internal: InternalConfig, emitter: EventEmitter) {
        super(name, config, internal, 'tautulli', emitter);
    }
    static formatPlayObj(obj: Request, options: FormatPlayObjectOptions = {}): PlayObject {
        const {newFromSource = false} = options;
        const {
            body :{
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
            } = {}
        } = obj;
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
