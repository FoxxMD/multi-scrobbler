import dayjs from "dayjs";
import { EventEmitter } from "events";
import path from 'path';
import {MPC, type Status, type Song, type PlaylistItem} from 'mpc-js';
import { BrainzMeta, PlayObject, PlayObjectLifecycleless } from "../../core/Atomic.js";
import {
    FormatPlayObjectOptions,
    InternalConfig,
    PlayerStateData,
    REPORTED_PLAYER_STATUSES,
    ReportedPlayerStatus,
    SINGLE_USER_PLATFORM_ID,
} from "../common/infrastructure/Atomic.js";
import {
    MPDSourceConfig,
    PlayerState,
} from "../common/infrastructure/config/source/mpd.js";
import { isPortReachable } from "../utils/NetworkUtils.js";
import { RecentlyPlayedOptions } from "./AbstractSource.js";
import { MemoryPositionalSource } from "./MemoryPositionalSource.js";
import { baseFormatPlayObj } from "../utils/PlayTransformUtils.js";
import { isDebugMode, sleep } from "../utils.js";
import { artistNamesToCredits } from "../../core/StringUtils.js";

const CLIENT_PLAYER_STATE: Record<PlayerState, ReportedPlayerStatus> = {
    'play': REPORTED_PLAYER_STATUSES.playing,
    'pause': REPORTED_PLAYER_STATUSES.paused,
    'stop': REPORTED_PLAYER_STATUSES.stopped,
}

export class MPDSource extends MemoryPositionalSource {
    declare config: MPDSourceConfig;

    host?: string
    port?: number
    mpc: MPC;
    deviceId: string

    protected currentPlayPath: string;
    protected currentPlaySong?: Song;

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
            } = {}
        } = this.config;

        if(path === undefined) {
            const [host, port] = MPDSource.parseConnectionUrl(url ?? 'localhost:6600');
            this.logger.verbose(`Config URL: '${url ?? '(None Given)'}' => Normalized: '${host}:${port}'`);
            this.host = host;
            this.port = Number.parseInt(port);
        } else {
            this.logger.verbose(`Using socket path: ${path}`);
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
            this.mpc = new MPC();
            if(this.host !== undefined) {
                const prom = this.mpc.connectTCP(this.host, this.port)
                await Promise.race([
                    prom,
                    sleep(1000)
                ]);
                if(!this.mpc.isReady) {
                    // handled any rejected socket promise error, if it occurs later
                    prom.catch(err => this.logger.warn(err));
                    this.mpc.disconnect();
                    throw new Error('Timed out waiting for TCP response from MPD');
                }
            } else {
                await this.mpc.connectUnixSocket(this.config.data.path);
            }

            if(this.config.data.password !== undefined) {
                await this.mpc.connection.password(this.config.data.password);
            }
            this.mpc.on('changed', (p) => {
                if(p.includes('player') && this.getIsSleeping()) {
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

    formatPlayObj(obj: Song | PlaylistItem, options: FormatPlayObjectOptions & {state?: Status} = {}): PlayObject {

        let trackName: string,
        album: string,
        artists: string[] = [],
        albumArtists: string[] = [],
        duration: number,
        position: number,
        brainz: BrainzMeta = {};

        const {
            state: {
                elapsed: sElapsed,
                duration: sDuration
            } = {}
        } =  options;

        position = sElapsed;

        if('entryType' in obj && obj.entryType === 'song') {
            const {
                path: file,
                duration: songDuration,
                artist,
                performer,
                album: sAlbum,
                albumArtist,
                title,
                name,
                musicBrainzAlbumArtistId: musicbrainz_albumartistid,
                musicBrainzAlbumId: musicbrainz_albumid,
                musicBrainzArtistId: musicbrainz_artistid,
                musicBrainzReleaseTrackId: musicbrainz_releasetrackid,
                musicBrainzTrackId: musicbrainz_trackid,
            } = obj;

            trackName = title;
            if(trackName === undefined && name !== undefined) {
                trackName = name;
            } else if(trackName === undefined && file !== undefined) {
                const pathSplit = file.split(path.sep);
                if(pathSplit.length > 1) {
                    trackName = pathSplit[pathSplit.length - 1];
                } else {
                    trackName = file;
                }
            }

            if(artist !== undefined) {
                artists.push(artist);
            }
            if(albumArtist !== undefined && albumArtist !== artist) {
                albumArtists.push(albumArtist);
            }
            if(artists.length === 0 && performer !== undefined) {
                artists.push(performer);
            }
            if(artists.length === 0 && albumArtists.length !== 0) {
                // switch these, tags are probably improper
                artists = albumArtists;
                albumArtists = [];
            }

            album = sAlbum;

            duration = songDuration ?? sDuration;

            brainz = {
                albumArtist: musicbrainz_albumartistid !== undefined ? [musicbrainz_albumartistid] : undefined,
                album: musicbrainz_albumid,
                recording: musicbrainz_trackid,
                artist: musicbrainz_artistid !== undefined ? [musicbrainz_artistid] : undefined
            };

        } else {
            const {
                path: file,
                duration: songDuration,
                artist,
                album: pAlbum,
                albumArtist,
                title,
                name
            } = obj;

            trackName = title ?? name;
            if(trackName === undefined) {
                const pathSplit = file.split(path.sep);
                if(pathSplit.length > 1) {
                    trackName = pathSplit[pathSplit.length - 1];
                } else {
                    trackName = file;
                }
            }

            artists = artist !== undefined ? [artist] : undefined;
            album = pAlbum;
            albumArtists = albumArtist !== undefined && albumArtist !== artist ? [albumArtist] : undefined;
            duration = songDuration ?? sDuration;
        }

        if(duration !== undefined) {
            duration = Math.floor(duration);
        }
        if(position !== undefined) {
            // so that we can end up with 100% played
            position = Math.ceil(position);
        }

        const play: PlayObjectLifecycleless = {
            data: {
                artists: artistNamesToCredits(artists),
                albumArtists: artistNamesToCredits(albumArtists),
                album,
                track: trackName,
                duration
            },
            meta: {
                brainz,
                trackProgressPosition: position,
                mediaPlayerName: 'mpd'
            }
        }
        return baseFormatPlayObj({...obj, trackProgressPosition: position}, play);
    }

    getRecentlyPlayed = async (options: RecentlyPlayedOptions = {}) => {

        let mpcCurrentItem: PlaylistItem,
        //mpcSong: Song,
        mpcStatus: Status;
        try {
            mpcCurrentItem = await this.mpc.status.currentSong();
            mpcStatus = await this.mpc.status.status();
        } catch (e) {
            this.connectionOK = false;
            this.authed = false;
            throw e;
        }

        let play: PlayObject | undefined,
        newPath = false;
        if(mpcCurrentItem !== undefined && mpcCurrentItem.path !== undefined) {
            if(this.currentPlayPath !== mpcCurrentItem.path) {
                newPath = true;
                this.currentPlaySong = undefined;
                this.currentPlayPath = mpcCurrentItem.path;
                try {
                    const resp = await this.mpc.database.listInfo(mpcCurrentItem.path);
                    if(resp.length > 0 && resp[0].isSong()) {
                        //mpcSong = resp[0];
                        this.currentPlaySong = resp[0];
                    }
                } catch (e) {
                    this.logger.warn(`Could not retrieve Song db info for uri ${mpcCurrentItem.path}`);
                }
            }
            play = this.formatPlayObj(this.currentPlaySong ?? mpcCurrentItem, { state: mpcStatus });

            if(newPath) {
                this.logger.trace('Current playing is a new path. Logging payload/Play on first seen for this path');
                this.logger.trace(`MPD Payload => ${JSON.stringify({currentItem: mpcCurrentItem, status: mpcStatus, song: this.currentPlaySong})}`);
                this.logger.trace(`MS Play => ${JSON.stringify(play)}`);
            }

            if(isDebugMode() && !newPath) {
                this.logger.trace(`Raw mpc.js payload => ${JSON.stringify({mpcStatus, mpcSong: mpcCurrentItem})}`);
            }
        }

        const playerState: PlayerStateData = {
            platformId: SINGLE_USER_PLATFORM_ID,
            status: CLIENT_PLAYER_STATE[mpcStatus.state],
            play,
            position: play?.meta?.trackProgressPosition
        }

        return await this.processRecentPlays([playerState]);
    }

}
