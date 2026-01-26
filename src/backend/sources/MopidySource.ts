import { loggerTest } from "@foxxmd/logging";
import dayjs from "dayjs";
import { EventEmitter } from "events";
import Mopidy, { models } from "mopidy";
import normalizeUrl from 'normalize-url';
import pEvent from 'p-event';
import { URL } from "url";
import { PlayObject, PlayObjectLifecycleless } from "../../core/Atomic.js";
import { buildTrackString } from "../../core/StringUtils.js";
import {
    FormatPlayObjectOptions,
    InternalConfig,
    PlayerStateData,
    SINGLE_USER_PLATFORM_ID,
} from "../common/infrastructure/Atomic.js";
import { MopidySourceConfig } from "../common/infrastructure/config/source/mopidy.js";
import { RecentlyPlayedOptions } from "./AbstractSource.js";
import { MemoryPositionalSource } from "./MemoryPositionalSource.js";
import { baseFormatPlayObj } from "../utils/PlayTransformUtils.js";

export class MopidySource extends MemoryPositionalSource {
    declare config: MopidySourceConfig;

    albumBlacklist: string[] = [];

    uriWhitelist: string[] = [];

    uriBlacklist: string[] = [];

    url: URL;

    client: Mopidy;
    clientReady: boolean = false;

    constructor(name: any, config: MopidySourceConfig, internal: InternalConfig, emitter: EventEmitter) {
        const {
            data = {}
        } = config;
        const {
            albumBlacklist = ['Soundcloud'],
            uriWhitelist = [],
            uriBlacklist = [],
            ...rest
        } = data;
        super('mopidy', name, {...config, data: {...rest}}, internal, emitter);

        this.albumBlacklist = albumBlacklist.map(x => x.toLocaleLowerCase());
        this.uriWhitelist = uriWhitelist.map(x => x.toLocaleLowerCase());
        this.uriBlacklist = uriBlacklist.map(x => x.toLocaleLowerCase());

        const {
            data: {
                url = 'ws://localhost:6680/mopidy/ws/'
            } = {}
        } = config;
        this.url = MopidySource.parseConnectionUrl(url);
        this.client = new Mopidy({
            autoConnect: false,
            webSocketUrl: this.url.toString(),
            // @ts-expect-error logger satisfies but is missing types not used
            console: loggerTest
        });
        this.client.on('state:offline', () => {
            this.logger.verbose('Lost connection to server');
            this.clientReady = false;
        });
        this.client.on('state:online', () => {
            this.logger.verbose('Connected to server');
            this.clientReady = true;
        });
        this.client.on('reconnecting', () => {
            this.logger.verbose('Retrying connection to server...');
        });
        this.canPoll = true;
    }

    static parseConnectionUrl(val: string) {
        const normal = normalizeUrl(val, {removeTrailingSlash: false, normalizeProtocol: true})
        const url = new URL(normal);

        // default WS
        if (url.protocol === 'http:') {
            url.protocol = 'ws';
        } else if (url.protocol === 'https:') {
            url.protocol = 'wss';
        }

        if (url.port === null || url.port === '') {
            url.port = '6680';
        }
        if (url.pathname === '/') {
            url.pathname = '/mopidy/ws/';
        } else if (url.pathname === '/mopidy/ws') {
            url.pathname = '/mopidy/ws/';
        }
        return url;
    }

    protected async doBuildInitData(): Promise<true | string | undefined> {
        const {
            data: {
                url
            } = {}
        } = this.config;
        this.logger.verbose(`Config URL: '${url ?? '(None Given)'}' => Normalized: '${this.url.toString()}'`)
        return true;
    }

    protected async doCheckConnection(): Promise<true | string | undefined> {
        this.client.connect();
        const res = await Promise.race([
            pEvent(this.client, 'state:online'),
            pEvent(this.client, 'websocket:error'),
            pEvent(this.client, 'websocket:close'),
        ]);
        if (res === undefined) {
            this.logger.info('Connection OK');
            return true;
        } else {
            this.client.close();
            throw new Error(`Could not connect to Mopidy server`, {cause: (res as Error)});
        }
    }

    formatPlayObj(obj: models.Track, options: FormatPlayObjectOptions = {}): PlayObject {
        const {newFromSource = true, trackProgressPosition = undefined} = options;

        const {
            artists: artistsVal,
            album: albumVal,
            name,
            uri, // like 'local:track...' 'soundcloud:song...'
            length: lengthVal,
            composers = [],
            performers = []
        } = obj;

        let artists: models.Artist[] = artistsVal === null ? [] : artistsVal;
        let album: models.Album = albumVal === null ? {} as models.Album : albumVal;
        if (this.albumBlacklist.length > 0 && album.name !== undefined && this.albumBlacklist.some(x => album.name.toLocaleLowerCase().includes(x))) {
            album = {} as models.Album;
        }
        const length = lengthVal === null ? undefined : lengthVal;

        const {
            name: albumName,
            artists: albumArtists = []
        } = album as models.Album;

        let actualAlbumArtists: models.Artist[] = [];
        if ((artists.length === 0 || artists.every(x => x.name.toLocaleLowerCase().includes('various'))) && albumArtists.length > 0) {
            artists = albumArtists;
        } else {
            actualAlbumArtists = albumArtists;
        }
        if (artists.length === 0 && composers.length > 0) {
            artists = composers;
        }
        if (artists.length === 0 && performers.length > 0) {
            artists = performers;
        }

        const play: PlayObjectLifecycleless = {
            data: {
                track: name,
                album: albumName,
                albumArtists: actualAlbumArtists.length > 0 ? actualAlbumArtists.map(x => x.name) : [],
                artists: artists.length > 0 ? artists.map(x => x.name) : [],
                duration: Math.round(length / 1000),
                playDate: dayjs()
            },
            meta: {
                source: 'mopidy',
                trackId: uri,
                newFromSource,
                trackProgressPosition: trackProgressPosition !== undefined ? Math.round(trackProgressPosition / 1000) : undefined,
                mediaPlayerName: 'Mopidy'
                //deviceId: name,
            }
        }
        return baseFormatPlayObj({...obj, trackProgressPosition}, play);
    }

    getRecentlyPlayed = async (options: RecentlyPlayedOptions = {}) => {
        if (!this.clientReady) {
            this.logger.warn('Cannot actively poll since client is not connected.');
            return [];
        }

        const state = await this.client.playback.getState();
        const currTrack = await this.client.playback.getCurrentTrack();
        const playback = await this.client.playback.getTimePosition();

        let play: PlayObject | undefined = currTrack === null ? undefined : this.formatPlayObj(currTrack, {trackProgressPosition: playback});

        if(play !== undefined) {
            if (this.uriWhitelist.length > 0) {
                const match = this.uriWhitelist.find(x => currTrack.uri.includes(x));
                if (match === undefined) {
                    this.logger.debug(`URI for currently playing (${currTrack.uri}) did not match any in whitelist. Will not track play ${buildTrackString(play)}`);
                    play = undefined;
                }
            } else if (this.uriBlacklist.length > 0) {
                const match = this.uriWhitelist.find(x => currTrack.uri.includes(x));
                if (match !== undefined) {
                    this.logger.debug(`URI for currently playing (${currTrack.uri}) matched from blacklist (${match}). Will not track play ${buildTrackString(play)}`);
                    play = undefined;
                }
            }
        }

        const playerState: PlayerStateData = {
            platformId: SINGLE_USER_PLATFORM_ID,
            status: state,
            play
        }

        return await this.processRecentPlays([playerState]);
    }

}
