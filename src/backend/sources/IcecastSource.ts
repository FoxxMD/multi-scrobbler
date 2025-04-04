import { RecentlyPlayedOptions } from "./AbstractSource.ts";
import { EventEmitter } from "events";
import { PlayObject, URLData } from "../../core/Atomic.ts";
import {
    FormatPlayObjectOptions,
    InternalConfig,
    PlayerStateData,
    REPORTED_PLAYER_STATUSES,
    SINGLE_USER_PLATFORM_ID,
} from "../common/infrastructure/Atomic.ts";
import { isPortReachableConnect, normalizeWebAddress } from "../utils/NetworkUtils.ts";
import MemorySource from "./MemorySource.ts";
import { IcecastMetadata, IcecastSourceConfig } from "../common/infrastructure/config/source/icecast.ts";
import IcecastMetadataStats from "icecast-metadata-stats";
import { parseArtistCredits, parseTrackCredits } from "../utils/StringUtils.ts";
import { isDebugMode, sleep } from "../utils.ts";


export class IcecastSource extends MemorySource {

    declare config: IcecastSourceConfig;

    urlData!: URLData;

    currentMetadata?: IcecastMetadata
    statsListener?: IcecastMetadataStats

    streamError?: Error;
    streaming: boolean = false;

    constructor(name: any, config: IcecastSourceConfig, internal: InternalConfig, emitter: EventEmitter) {
        const {
            data,
            options = {},
        } = config;
        const {
            ...rest
        } = data || {};
        super('icecast', name, { ...config, options: {systemScrobble: false, ...options}, data: { ...rest } }, internal, emitter);

        this.requiresAuth = false;
        this.canPoll = true;
        this.supportsManualListening = true;
    }

    protected async doBuildInitData(): Promise<true | string | undefined> {
        const {
            data: {
                url
            } = {}
        } = this.config;
        if (url === null || url === undefined || url === '') {
            throw new Error('url must be defined');
        }
        this.urlData = normalizeWebAddress(url);
        const normal = this.urlData.normal;
        this.logger.verbose(`Config URL: '${url ?? '(None Given)'}' => Normalized: '${normal}'`)
        return true;
    }


    protected async doCheckConnection(): Promise<true | string | undefined> {
        try {
            await isPortReachableConnect(this.urlData.port, { host: this.urlData.url.hostname });
            this.logger.verbose(`${this.urlData.url.hostname}:${this.urlData.port} is reachable.`);
            return true;
        } catch (e) {
            const hint = e.error?.cause?.message ?? undefined;
            throw new Error(`Could not connect to Icecast server${hint !== undefined ? ` (${hint})` : ''}`, { cause: e.error ?? e });
        }
    }

    readIcecastStream = () => {
        if (this.statsListener !== undefined) {
            this.statsListener.stop();
        }

        const {
            url,
            ...icecastUserOpts
        } = this.config.data;

        const icecastOpts = {sources: ["icy", 'ogg'], ...icecastUserOpts};

        this.statsListener = new IcecastMetadataStats(this.urlData.url.toString(), {
            ...icecastOpts,
            onStats: (stats) => {
                if(isDebugMode()) {
                    this.logger.debug(stats);
                }
                this.currentMetadata = stats;
                if (this.polling === false) {
                    this.statsListener.stop();
                    this.streaming = false;
                }
            },
            onError: (e) => {
                this.streaming = false;
                this.streamError = e;
                this.statsListener.stop();
            },
            interval: 10
        });
        this.statsListener.start();
        this.streaming = true;

    }

    getRecentlyPlayed = async (options: RecentlyPlayedOptions = {}) => {

        if (this.streaming === false) {
            this.readIcecastStream();
            // wait a bit so stream can start and parse metadata
            await sleep(1000);
        }

        if (this.streamError !== undefined) {
            if (this.streamError.cause !== undefined && ('res' in (this.streamError.cause as object))) {
                const res = (this.streamError.cause as Error & { res: Response }).res as Response
            }
            throw new Error('Icecast stream produced an error', { cause: this.streamError });
        }

        if (this.currentMetadata === undefined) {
            return this.processRecentPlays([]);
        }

        // if (this.manualListening === false || (this.config.options.scrobbleOnStart === false && this.manualListening === undefined)) {
        //     const playerState: PlayerStateData = {
        //         platformId: SINGLE_USER_PLATFORM_ID,
        //         status: REPORTED_PLAYER_STATUSES.stopped,
        //         play: undefined,
        //     }

        //     return this.processRecentPlays([playerState]);
        // }

        let play: PlayObject | undefined = formatPlayObj(this.currentMetadata);
        if (play.data.track === undefined) {
            play = undefined;
        }

        const playerState: PlayerStateData = {
            platformId: SINGLE_USER_PLATFORM_ID,
            status: REPORTED_PLAYER_STATUSES.playing,
            play
        }

        return this.processRecentPlays([playerState]);
    }
}

const formatPlayObj = (obj: IcecastMetadata, options: FormatPlayObjectOptions = {}): PlayObject => {


    let artist: string,
        track: string,
        artists: string[] = [],
        album: string;

    if (obj.ogg?.TITLE !== undefined) {
        const {
            TITLE: oggTitle,
            ARTIST: oggArtist,
            ALBUM: oggAlbum
        } = obj.ogg;

        track = oggTitle;
        album = oggAlbum;

        const artistCred = parseArtistCredits(oggArtist);
        if (artistCred !== undefined) {
            artists.push(artistCred.primary);
            if (artistCred.secondary !== undefined) {
                artists = artists.concat(artistCred.secondary);
            }
        } else {
            artists.push(oggArtist);
        }
    } else if(obj.icy?.StreamTitle !== undefined) {
        const value: string = obj.icy.StreamTitle;

        // naive implementation for now
        const splitStr = value.split('-').map(x => x.trim());
    
        if (splitStr.length > 1) {
            artist = splitStr[0];
            track = value.substring(value.indexOf('-') + 1).trim();
    
            const artistCred = parseArtistCredits(artist);
            if (artistCred !== undefined) {
                artists.push(artistCred.primary);
                if (artistCred.secondary !== undefined) {
                    artists = artists.concat(artistCred.secondary);
                }
            } else {
                artists.push(artist);
            }
    
            const trackCred = parseTrackCredits(track);
            if (trackCred !== undefined) {
                track = trackCred.primary;
                if (trackCred.secondary !== undefined) {
                    artists = artists.concat(trackCred.secondary);
                }
            }
        }
    }

    return {
        data: {
            track,
            artists
        },
        meta: {
            source: 'icecast'
        }
    }
}