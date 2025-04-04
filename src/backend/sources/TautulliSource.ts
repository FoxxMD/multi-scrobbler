import dayjs from "dayjs";
import EventEmitter from "events";
import { Request } from "express";
import { PlayObject } from "../../core/Atomic.ts";
import { combinePartsToString, truncateStringToLength } from "../../core/StringUtils.ts";
import { FormatPlayObjectOptions, InternalConfig } from "../common/infrastructure/Atomic.ts";
import { TautulliSourceConfig } from "../common/infrastructure/config/source/tautulli.ts";
import PlexSource from "./PlexSource.ts";

const shortDeviceId = truncateStringToLength(10, '');

export default class TautulliSource extends PlexSource {

    declare config: TautulliSourceConfig;
    constructor(name: any, config: TautulliSourceConfig, internal: InternalConfig, emitter: EventEmitter) {
        super(name, config, internal, 'tautulli', emitter);
        this.logger.warn('Tatutulli source is DEPRECATED and will be removed in an upcoming release! Please switch to Plex API Source as soon as possible.');
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
        const artists: string[] = [];
        const albumArtists: string[] = [];
        if (track_artist !== undefined && track_artist !== artist_name) {
            artists.push(track_artist);
            albumArtists.push(artist_name);
        } else {
            artists.push(artist_name);
        }
        return {
            data: {
                artists,
                album: album_name,
                albumArtists,
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
