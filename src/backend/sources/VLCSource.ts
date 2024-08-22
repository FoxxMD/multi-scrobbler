import { EventEmitter } from "events";
import * as VLC from "vlc-client"
import { VlcMeta, VlcStatus } from "vlc-client/dist/Types.js";
import { PlayObject } from "../../core/Atomic.js";
import {
    FormatPlayObjectOptions,
    InternalConfig,
    PlayerStateData,
    REPORTED_PLAYER_STATUSES,
    ReportedPlayerStatus,
    SINGLE_USER_PLATFORM_ID,
} from "../common/infrastructure/Atomic.js";
import { VlcAudioMeta, VLCSourceConfig, PlayerState } from "../common/infrastructure/config/source/vlc.js";
import { isPortReachable } from "../utils/NetworkUtils.js";
import { firstNonEmptyStr } from "../utils/StringUtils.js";
import { RecentlyPlayedOptions } from "./AbstractSource.js";
import MemorySource from "./MemorySource.js";

const CLIENT_PLAYER_STATE: Record<PlayerState, ReportedPlayerStatus> = {
    'playing': REPORTED_PLAYER_STATUSES.playing,
    'paused': REPORTED_PLAYER_STATUSES.paused,
    'stopped': REPORTED_PLAYER_STATUSES.stopped,
}

export class VLCSource extends MemorySource {
    declare config: VLCSourceConfig;

    host?: string
    port?: number
    client!: VLC.Client;
    deviceId: string

    constructor(name: any, config: VLCSourceConfig, internal: InternalConfig, emitter: EventEmitter) {
        const {
            data,
        } = config;
        const {
            interval = 5, // reduced polling interval because its likely we are on the same network
            ...rest
        } = data || {};
        super('vlc', name, {...config, data: {...rest, interval}}, internal, emitter);

        this.requiresAuth = true;
        this.canPoll = true;
    }

    static parseConnectionUrl(valRaw: string): [string, string] {
        if(valRaw.trim() === '') {
            throw new Error(`'url' cannot be an empty string`);
        }

        const [host, port] = valRaw.trim().split(':');
        return [host, port ?? '8080'];
    }

    protected async doBuildInitData(): Promise<true | string | undefined> {
        const {
            data: {
                url,
                password,
            } = {}
        } = this.config;

        const [host, port] = VLCSource.parseConnectionUrl(url ?? 'localhost:8080');
        this.logger.verbose(`Config URL: '${url ?? '(None Given)'}' => Normalized: '${host}:${port}'`);
        this.host = host;
        this.port = Number.parseInt(port);
        this.client = new VLC.Client({
            ip: host,
            port: this.port,
            password: password
        });
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
            const status = await this.client.status();
            this.logger.info(`Connected successfully, found VLC ${status.version}`);
            return true;
        } catch (e) {
            let friendlyError: string | undefined;
            throw new Error(`Could not connect to VLC server${friendlyError !== undefined ? ` (Hint: ${friendlyError})` : ''}`, {cause: e});
        }
    }

    formatPlayObj(obj: VlcAudioMeta, options: FormatPlayObjectOptions = {}): PlayObject {

        let vlcState: VlcStatus;
        const {
            vlcStatus,
        } = options;

        if(vlcStatus !== undefined) {
            vlcState = vlcStatus as VlcStatus;
        }

        const {
            filename,
            title,
            album,
            ALBUMARTIST,
            Writer,
            StreamArtist,
            StreamTitle,
            artist
        } = obj;

        let artists = [];
        let albumArtists = [];
        const validArtist = firstNonEmptyStr([artist, StreamArtist, ALBUMARTIST, Writer]);
        if(artist !== undefined) {
            artists.push(validArtist);
        }
        const aa = firstNonEmptyStr([ALBUMARTIST]);
        if(aa !== undefined) {
            albumArtists.push(aa);
        }
        if(artists.length === 0 && albumArtists.length !== 0) {
            // switch these, tags are probably improper
            artists = albumArtists;
            albumArtists = [];
        }

        const trackName = firstNonEmptyStr([title, StreamTitle, filename]);

        const {
            /** time position within the current track */
            time,
            length,
            /** percent as decimal within current track*/
            position,
            state
        } = vlcState || {};

        return {
            data: {
                artists: artists,
                albumArtists,
                album,
                track: trackName,
                duration: length
            },
            meta: {
                trackProgressPosition: time,
            }
        }
    }

    getRecentlyPlayed = async (options: RecentlyPlayedOptions = {}) => {

        let state: VlcStatus;
        let meta: VlcMeta;
        try {
            state = await this.client.status();
            meta = await this.client.meta();
        } catch (e) {
            this.connectionOK = false;
            this.authed = false;
            throw e;
        }

        let play: PlayObject | undefined;
        if(meta !== undefined) {
            play = this.formatPlayObj(meta, {vlcStatus: state});
        }

        const playerState: PlayerStateData = {
            platformId: SINGLE_USER_PLATFORM_ID,
            status: CLIENT_PLAYER_STATE[state.state],
            play,
            position: state.time
        }

        return this.processRecentPlays([playerState]);
    }

}