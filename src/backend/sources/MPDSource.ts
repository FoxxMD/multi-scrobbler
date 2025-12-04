import dayjs from "dayjs";
import { EventEmitter } from "events";
import mpdapiNS, { MPDApi } from 'mpd-api';
import mpd2 from 'mpd2';
import { BrainzMeta, PlayObject } from "../../core/Atomic.js";
import {
    FormatPlayObjectOptions,
    InternalConfig,
    PlayerStateData,
    REPORTED_PLAYER_STATUSES,
    ReportedPlayerStatus,
    SINGLE_USER_PLATFORM_ID,
} from "../common/infrastructure/Atomic.js";
import {
    CurrentSongResponse,
    MPDSourceConfig,
    PlayerState,
    StatusResponse,
} from "../common/infrastructure/config/source/mpd.js";
import { isPortReachable } from "../utils/NetworkUtils.js";
import { RecentlyPlayedOptions } from "./AbstractSource.js";
import { MemoryPositionalSource } from "./MemoryPositionalSource.js";

const mpdClient = mpdapiNS.default;

const CLIENT_PLAYER_STATE: Record<PlayerState, ReportedPlayerStatus> = {
    'play': REPORTED_PLAYER_STATUSES.playing,
    'pause': REPORTED_PLAYER_STATUSES.paused,
    'stop': REPORTED_PLAYER_STATUSES.stopped,
}

export class MPDSource extends MemoryPositionalSource {
    declare config: MPDSourceConfig;

    host?: string
    port?: number
    // {host?: string, port?: number, path?: string, password?: string};
    clientConfig: mpd2.MPD.Config;
    client!: MPDApi.ClientAPI;
    deviceId: string

    constructor(name: any, config: MPDSourceConfig, internal: InternalConfig, emitter: EventEmitter) {
        const {
            data = {}
        } = config;
        const {
            interval = 5, // reduced polling interval because its likely we are on the same network
            ...rest
        } = data;
        super('mpd', name, {...config, data: {...rest, interval}}, internal, emitter);

        this.requiresAuth = true;
        this.canPoll = true;
    }

    static parseConnectionUrl(valRaw: string): [string, string] {
        if(valRaw.trim() === '') {
            throw new Error(`'url' cannot be an empty string`);
        }

        const [host, port] = valRaw.trim().split(':');
        return [host, port ?? '6600'];
    }

    protected async doBuildInitData(): Promise<true | string | undefined> {
        const {
            data: {
                url,
                path,
                password,
            } = {}
        } = this.config;

        if(path === undefined) {
            const [host, port] = MPDSource.parseConnectionUrl(url ?? 'localhost:6600');
            this.logger.verbose(`Config URL: '${url ?? '(None Given)'}' => Normalized: '${host}:${port}'`);
            this.host = host;
            this.port = Number.parseInt(port);
            this.clientConfig = {
                host,
                port: this.port,
                password
            }
        } else {
            this.logger.verbose(`Using socket path: ${path}`);
            this.clientConfig = {
                path,
                password
            }
        }

        return true;
    }

    protected async doCheckConnection(): Promise<true | string | undefined> {
        if(this.host !== undefined) {
            try {
                await isPortReachable(this.port, {host: this.host});
                return `${this.host}:${this.port} is reachable.`;
            } catch (e) {
                throw e;
            }
        }
        return null;
    }

    doAuthentication = async () => {

        try {
            this.client = await mpdClient.connect({...this.clientConfig, timeout: 1000});
            this.client.on('system-player', () => {
               if(this.getIsSleeping()) {
                   // wake up now!
                   this.logger.debug(`Waking up from sleeping ${Math.abs(this.getWakeAt().diff(dayjs(), 'ms'))}ms early due to player state change`)
                   this.setWakeAt(dayjs());
               }
            });
            return true;
        } catch (e) {
            let friendlyError: string | undefined;
            if(e.code === 'ENOENT') {
                friendlyError = 'Socket file does not exist'
            } else if(e.code === 'EACCES') {
                friendlyError = 'Incorrect permissions to access socket file'
            }
            // if(e.errno !== undefined) {
            //     switch(e.errno) {
            //         case mpd2.default.MPDError.CODES.PERMISSION:
            //             friendlyError = 'No permission to connect';
            //             break;
            //         case mpd2.default.MPDError.CODES.PASSWORD:
            //             friendlyError = 'Password is probably not correct';
            //             break;
            //     }
            // }
            throw new Error(`Could not connect to MPD server${friendlyError !== undefined ? ` (Hint: ${friendlyError})` : ''}`, {cause: e});
        }
    }

    formatPlayObj(obj: CurrentSongResponse, options: FormatPlayObjectOptions = {}): PlayObject {
        const {
            file,
            time,
            artist,
            performer,
            album,
            albumartist,
            title,
            name,
            musicbrainz_albumartistid,
            musicbrainz_albumid,
            musicbrainz_artistid,
            musicbrainz_releasetrackid,
            musicbrainz_trackid,
        } = obj;

        let artists = [];
        let albumArtists = [];
        if(artist !== undefined) {
            artists.push(artist);
        }
        if(albumartist !== undefined && albumartist !== artist) {
            albumArtists.push(albumartist);
        }
        if(artists.length === 0 && performer !== undefined) {
            artists.push(performer);
        }
        if(artists.length === 0 && albumArtists.length !== 0) {
            // switch these, tags are probably improper
            artists = albumArtists;
            albumArtists = [];
        }

        let trackName = title;
        if(trackName === undefined && name !== undefined) {
            trackName = name;
        } else if(trackName === undefined && file !== undefined) {
            trackName = file;
        }

        const brainz: BrainzMeta = {
            albumArtist: [musicbrainz_albumartistid],
            album: musicbrainz_albumid,
            track: musicbrainz_trackid,
        };
        if(musicbrainz_artistid !== undefined) {
            brainz.artist = [musicbrainz_artistid];
        }

        return {
            data: {
                artists: artists,
                albumArtists,
                album,
                track: trackName,
                duration: time
            },
            meta: {
                brainz,
                trackProgressPosition: options.trackProgressPosition,
                mediaPlayerName: 'mpd'
            }
        }
    }

    getRecentlyPlayed = async (options: RecentlyPlayedOptions = {}) => {

        let state: StatusResponse;
        let currentSong: CurrentSongResponse;
        try {
            state = await this.client.api.status.get<StatusResponse>();
            currentSong = await this.client.api.status.currentsong<CurrentSongResponse>();
        } catch (e) {
            this.connectionOK = false;
            this.authed = false;
            throw e;
        }

        let play: PlayObject | undefined;
        if(currentSong !== undefined) {
            play = this.formatPlayObj(currentSong, {trackProgressPosition: state.elapsed});
        }

        const playerState: PlayerStateData = {
            platformId: SINGLE_USER_PLATFORM_ID,
            status: CLIENT_PLAYER_STATE[state.state],
            play,
            position: state.elapsed
        }

        return await this.processRecentPlays([playerState]);
    }

}
