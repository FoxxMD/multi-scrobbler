import { RecentlyPlayedOptions } from "./AbstractSource.js";
import { EventEmitter } from "events";
import { PlayObject, URLData } from "../../core/Atomic.js";
import {
    FormatPlayObjectOptions,
    InternalConfig,
    PlayerStateData,
    REPORTED_PLAYER_STATUSES,
    SINGLE_USER_PLATFORM_ID,
} from "../common/infrastructure/Atomic.js";
import { isPortReachableConnect, normalizeWebAddress } from "../utils/NetworkUtils.js";
import MemorySource from "./MemorySource.js";
import { IcecastMetadata, IcecastMetadataResponse, IcecastSourceConfig } from "../common/infrastructure/config/source/icecast.js";
import { IcecastReadableStream } from 'icecast-metadata-js';
import { parseArtistCredits, parseCredits, parseTrackCredits } from "../utils/StringUtils.js";
import { sleep } from "../utils.js";


export class IcecastSource extends MemorySource {

    declare config: IcecastSourceConfig;

    urlData!: URLData;

    currentMetadata?: IcecastMetadataResponse
    streamAbort?: AbortController;

    streamError?: Error;
    streaming: boolean = false;

    constructor(name: any, config: IcecastSourceConfig, internal: InternalConfig, emitter: EventEmitter) {
        const {
            data = {}
        } = config;
        const {
            ...rest
        } = data;
        super('icecast', name, { ...config, data: { ...rest } }, internal, emitter);

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
        this.streamAbort = new AbortController();
        this.streamError = undefined;

        fetch(this.urlData.url.toString(), {
            signal: this.streamAbort.signal,
            method: "GET",
            headers: {
              "Icy-MetaData": "1",
            }
          })
          .then(async (response) => {

            const contentType = response.headers.get('Content-Type');
            if(!['audio','ogg','aac','mp3'].some(x => contentType.includes(x))) {
                this.logger.warn(`Icecase URL response content-type does not look like audio! It will probably fail. Check your URL? Content-Type: ${contentType}`);
            }

            const opts: Record<string, any> = {
                metadataTypes: ["icy", "ogg"]
            };

            const icyIntHeader = response.headers.get('Icy-MetaInt');
            if(icyIntHeader !== null) {
                const icyInt = Number.parseInt(icyIntHeader);
                if(Number.isNaN(icyInt)) {
                    this.logger.warn(`Could not parse value of header 'Icy-MetaInt' to a number: ${icyIntHeader}`);
                } else {
                    opts.icyMetaInt = icyInt;
                }
            }

            const icecast = new IcecastReadableStream(
              response,
              {
                ...opts,
                onStream: (stream) => {
                    this.streaming = true;
                    if(!this.polling || this.userPollingStopSignal !== undefined) {
                        this.streamAbort.abort();
                    }
                },
                onMetadata: (meta) => {
                    console.log(meta)
                    this.currentMetadata = meta;
                },
                onMetadataFailed: (metatype) => {
                    console.log(metatype)
                },
                onError: (err) => {
                    if(typeof err === 'string' && err === 'This stream is not an Ogg stream. No Ogg metadata will be returned.') {
                        this.logger.debug('Stream is ICY only, no OGG metadata will be returned');
                    } else {
                        this.streaming = false;
                        this.streamError = typeof err === 'string' ? new Error(err) : err;
                    }
                }
              }
            );
            
            await icecast.startReading();
          })
          .catch((err) => {
            if(err.name !== 'AbortError') {
                this.streamError = new Error('Error occurred while trying to communicate with Icecast URL', {cause: err});
            }
            this.streaming = false;
          });
    }

    getRecentlyPlayed = async (options: RecentlyPlayedOptions = {}) => {

        if(this.streaming === false) {
            this.readIcecastStream();
            // wait a bit so stream can start and parse metadata
            await sleep(1000);
        }

        if(this.streamError !== undefined) {
            throw new Error('Icecast stream produced an error', {cause: this.streamError});
        }

        if(this.currentMetadata === undefined || this.currentMetadata.metadata === undefined) {
            return this.processRecentPlays([]);
        }

        if(this.manualListening === false) {
            const playerState: PlayerStateData = {
                platformId: SINGLE_USER_PLATFORM_ID,
                status: REPORTED_PLAYER_STATUSES.stopped,
                play: undefined,
            }
    
            return this.processRecentPlays([playerState]);
        }

        let play: PlayObject | undefined = formatPlayObj(this.currentMetadata.metadata);
        if(play.data.track === undefined) {
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

    const value: string = obj.StreamTitle ?? obj.TITLE;

    let artist: string,
    track: string = value;
    let artists: string[] = [];

    // naive implementation for now
    const splitStr = value.split('-').map(x => x.trim());

    if(splitStr.length > 1) {
        artist = splitStr[0];
        track = value.substring(value.indexOf('-') + 1).trim();

        const artistCred = parseArtistCredits(artist);
        if(artistCred !== undefined) {
            artists.push(artistCred.primary);
            if(artistCred.secondary !== undefined) {
                artists = artists.concat(artistCred.secondary);
            }
        } else {
            artists.push(artist);
        }

        const trackCred = parseTrackCredits(track);
        if(trackCred !== undefined) {
            track = trackCred.primary;
            if(trackCred.secondary !== undefined) {
                artists = artists.concat(trackCred.secondary);
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