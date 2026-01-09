import dayjs, { Dayjs } from "dayjs";
import { BrainzMeta, PlayObject } from "../../../core/Atomic.js";
import { nonEmptyStringOrDefault, splitByFirstFound } from "../../../core/StringUtils.js";
import { removeUndefinedKeys, sleep, writeFile } from "../../utils.js";
import { objectIsEmpty, readJson } from '../../utils/DataUtils.js';
import { joinedUrl } from "../../utils/NetworkUtils.js";
import { getScrobbleTsSOCDate } from "../../utils/TimeUtils.js";
import { getNodeNetworkException, isNodeNetworkException } from "../errors/NodeErrors.js";
import { UpstreamError } from "../errors/UpstreamError.js";
import { AbstractApiOptions, DEFAULT_RETRY_MULTIPLIER, FormatPlayObjectOptions } from "../infrastructure/Atomic.js";
import { LastfmData } from "../infrastructure/config/client/lastfm.js";
import AbstractApiClient from "./AbstractApiClient.js";
import { parseArtistCredits } from "../../utils/StringUtils.js";
import { LastFMUser, LastFMAuth, LastFMTrack, LastFMUserGetRecentTracksResponse, LastFMBooleanNumber, LastFMUpdateNowPlayingResponse, LastFMUserGetInfoResponse } from 'lastfm-ts-api';
import clone from 'clone';

const badErrors = [
    'api key suspended',
    'invalid session key',
    'invalid api key',
    'authentication failed',
    'invalid parameters'
];

const retryErrors = [
    'operation failed',
    'service offline',
    'temporarily unavailable',
    'rate limit'
]

export default class LastfmApiClient extends AbstractApiClient {

    user?: string;
    declare config: LastfmData;
    sessionKey?: string;

    urlBase: string = 'ws.audioscrobbler.com'
    path: string = '/2.0'
    upstreamName: string = 'Last.fm';

    userApi!: LastFMUser;
    trackApi!: LastFMTrack;

    constructor(name: any, config: Partial<LastfmData> & {configDir: string, localUrl: URL}, options: AbstractApiOptions) {
        super('lastfm', name, config, options);
        const {redirectUri, apiKey, secret, session, configDir} = config;
        this.redirectUri = `${redirectUri ?? joinedUrl(config.localUrl, 'lastfm/callback').href}?state=${name}`;
        if (apiKey === undefined) {
            this.logger.warn("'apiKey' not found in config!");
        }
        if(config.librefm === true) {
            this.urlBase = 'libre.fm'
            this.path = '/2.0/';
            this.logger.info('Libre.fm mode enabled');
            this.upstreamName = 'Libre.fm';
        }
        this.logger.info(`Using ${this.urlBase}${this.path} for API calls`);
        this.workingCredsPath = `${configDir}/currentCreds-lastfm-${name}.json`;
    }

    callApi = async <T>(func: any, retries = 0): Promise<T> => {
        const {
            maxRequestRetries = 2,
            retryMultiplier = DEFAULT_RETRY_MULTIPLIER
        } = this.config;

        try {
            return await func() as T;
        } catch (e) {
            const {
                message,
            } = e;
            // for now check for exceptional errors by matching error code text
            const retryError = retryErrors.find(x => message.toLocaleLowerCase().includes(x));
            let networkError =  undefined;
            if(retryError === undefined) {
                const nError = getNodeNetworkException(e);
                if(nError !== undefined) {
                    networkError = nError.message;
                } else if(message.includes('ETIMEDOUT')) {
                    networkError = 'request timed out after 3 seconds'
                }
            }
            if (undefined !== retryError || networkError !== undefined) {
                if (retries < maxRequestRetries) {
                    const delay = (retries + 1) * retryMultiplier;
                    if(networkError !== undefined) {
                        this.logger.warn(`API call failed due to network issue (${networkError}), retrying in ${delay} seconds...`);
                    } else {
                        this.logger.warn(`API call was not good but recoverable (${retryError}), retrying in ${delay} seconds...`);
                    }
                    await sleep(delay * 1000);
                    return this.callApi(func, retries + 1);
                } else {
                    throw new UpstreamError(`API call failed due -> ${retryError ?? 'API call timed out'} <- after max retries hit ${maxRequestRetries}`, {cause: e})
                }
            }

            throw e;
        }
    }

    getAuthUrl = () => {
        if(this.config.librefm) {
            return `https://libre.fm/api/auth/?api_key=${this.config.apiKey}&cb=${encodeURIComponent(this.redirectUri)}`;
        }
        return `http://www.last.fm/api/auth/?api_key=${this.config.apiKey}&cb=${encodeURIComponent(this.redirectUri)}`;
    }

    authenticate = async (token: any) => {

        const auth = new LastFMAuth(this.config.apiKey, this.config.secret, undefined, {
                hostname: this.urlBase,
                path: this.path
        });

        const sessionRes = await auth.getSession({token});
        const {
            session: {
                key: sessionKey,
                name, // username
            } = {}
        } = sessionRes;
        this.sessionKey = sessionKey;
        this.user = name;

        this.initApi();

        await writeFile(this.workingCredsPath, JSON.stringify({
            sessionKey,
            name,
        }));
    }

    protected initApi = () => {
        this.userApi = new LastFMUser(this.config.apiKey, this.config.secret, this.sessionKey, {
                hostname: this.urlBase,
                path: this.path
        });
        this.trackApi = new LastFMTrack(this.config.apiKey, this.config.secret, this.sessionKey, {
                hostname: this.urlBase,
                path: this.path
        });
    }

    initialize = async (): Promise<true> => {

        try {
            const creds = await readJson(this.workingCredsPath, {throwOnNotFound: false, interpolateEnvs: false});
            const {sessionKey, name} = creds || {};
            this.sessionKey = sessionKey;
            this.user = name;
            if(this.sessionKey !== undefined) {
                this.initApi();
            }
            return true;
        } catch (e) {
            throw new Error(`Current ${this.upstreamName} credentials file exists but could not be parsed`, {cause: e});
        }
    }

    testAuth = async () => {
        if (this.sessionKey === undefined) {
            this.logger.warn('No session key found. User interaction for authentication required.');
            this.logger.info(`Redirect URL that will be used on auth callback: '${this.redirectUri}'`);
            throw new Error('No session key found. User interaction for authentication required.');
        }
        try {
            // existing lastfm clients are ok with getting user from getInfo
            // but libre throws an error
            // so, if not libre allow empty user and set user from response to comply with new librefm implementation/refactor
            const infoPayload: Record<string, any> = {};
            if(this.config.librefm) {
                infoPayload.user = this.user;
            }
            const resp = await this.callApi<LastFMUserGetInfoResponse>(() => this.userApi.getInfo(infoPayload));
            if(this.user === undefined) {
                this.user = resp.user.name;
            }
            this.initialized = true;
            this.logger.info(`Client authorized for user ${this.user}`)
            return true;
        } catch (e) {
            this.logger.error('Testing auth failed');
            if(isNodeNetworkException(e)) {
                this.logger.error(`Could not communicate with ${this.upstreamName} API`);
            }
            throw e;
        }
    }

    getRecentTracks = async (options: TracksFetchOptions = {}): Promise<PlayObject[]> => {

        let resp: LastFMUserGetRecentTracksResponse;
        try {
            resp = await this.callApi<LastFMUserGetRecentTracksResponse>(() => this.userApi.getRecentTracks({...options, user: this.user, api_key: this.config.apiKey, extended: 1})); // await this.userApi.getRecentTracks({...options, user: this.user, extended: 1});

            const {
                recenttracks: {
                    track: list = [],
                } = {}
            } = resp;
            return list.reduce((acc: any, x: any) => {
                try {
                    const formatted = formatPlayObj(x);
                    const {
                        data: {
                            track,
                            playDate,
                        },
                        meta: {
                            mbid,
                            nowPlaying,
                        }
                    } = formatted;
                    if (nowPlaying === true) {
                        // if the track is "now playing" it doesn't get a timestamp so we can't determine when it started playing
                        // and don't want to accidentally count the same track at different timestamps by artificially assigning it 'now' as a timestamp
                        // so we'll just ignore it in the context of recent tracks since really we only want "tracks that have already finished being played" anyway
                        this.logger.debug(`Ignoring 'now playing' track returned from ${this.upstreamName} client`, { track, mbid });
                        return acc;
                    } else if (playDate === undefined) {
                        this.logger.warn(`${this.upstreamName} recently scrobbled track did not contain a timestamp, omitting from time frame check`, { track, mbid });
                        return acc;
                    }
                    return acc.concat(formatted);
                } catch (e) {
                    this.logger.warn(`Failed to format ${this.upstreamName} recently scrobbled track, omitting from time frame check`, { error: e.message });
                    this.logger.debug('Full api response object:');
                    this.logger.debug(x);
                    return acc;
                }
            }, []);
        } catch (e) {
            this.logger.debug(resp);
            throw e;
        }
    }

    scrobble = async (playObj: PlayObject): Promise<PlayObject> => {
                const {
            meta: {
                source,
                newFromSource = false,
            } = {}
        } = playObj;

        const scrobblePayload = playToClientPayload(playObj);

        try {
            const response = await this.callApi<LastFMTrackScrobbleResponse>(() =>  this.trackApi.scrobble({...scrobblePayload}) as unknown as LastFMTrackScrobbleResponse);
            const {
                scrobbles: {
                    '@attr': {
                        accepted = 0,
                        ignored = 0,
                        code = undefined,
                    } = {},
                    scrobble: {
                        track: {
                            '#text': trackName,
                        } = {},
                        album: {
                            '#text': albumName
                        } = {},
                        timestamp,
                        ignoredMessage: {
                            code: ignoreCode,
                            '#text': ignoreMsg,
                        } = {},
                        ...rest
                    } = {}
                } = {},
            } = response;
            if(code === 5) {
                throw new UpstreamError(`${this.upstreamName} API reported daily scrobble limit exceeded!`, {showStopper: true});
            }
            if(ignored > 0) {
                throw new LastFMIgnoredScrobble(`${this.upstreamName} ignored scrobble => (Code ${ignoreCode}) ${(ignoreMsg === '' ? '(No error message returned)' : ignoreMsg)} -- See https://www.last.fm/api/errorcodes for more information`, {showStopper: false});
            }

            const modifiedPlay = clone(playObj);
            delete modifiedPlay.data.playDateCompleted;
            modifiedPlay.data.playDate = dayjs.unix(timestamp);
            if(trackName !== undefined) {
                modifiedPlay.data.track = trackName;
            }
            if(albumName !== undefined) {
                modifiedPlay.data.album = albumName;
            }

            return modifiedPlay;
            // last fm has rate limits but i can't find a specific example of what that limit is. going to default to 1 scrobble/sec to be safe
            //await sleep(1000);
        } catch (e) {
            if(!(e instanceof UpstreamError)) {
                throw new UpstreamError(`Error received from ${this.upstreamName} API`, {cause: e, showStopper: true});
            } else {
                throw e;
            }
        } finally {
            this.logger.debug({payload: scrobblePayload}, 'Raw Payload');
        }
    }

    playingNow = async (data: PlayObject) => {
                try {
                    const {timestamp, mbid, ...rest} = playToClientPayload(data);
                    const response = await this.callApi<LastFMUpdateNowPlayingResponse>(() => this.trackApi.updateNowPlaying(rest));
                    const {
                        nowplaying: {
                            ignoredMessage: {
                                code: ignoreCode,
                                '#text': ignoreMsg,
                            } = {},
                        } = {}
                    } = response;
                    if (ignoreCode > 0) {
                        this.logger.warn({payload: rest}), `Service ignored this scrobble => (Code ${ignoreCode}) ${(ignoreMsg === '' ? '(No error message returned)' : ignoreMsg)} -- See https://www.last.fm/api/show/track.updateNowPlaying for more information`;
                    }
                    return response;
                } catch (e) {
                    if (!(e instanceof UpstreamError)) {
                        throw new UpstreamError(`Error received from ${this.upstreamName} API`, {cause: e, showStopper: false});
                    } else {
                        throw e;
                    }
                }
    }
}

export interface TracksFetchOptions {
    to?: string
    from?: string
    extended?: 0 | 1
    page?: number
    limit?: number
}

export class LastFMIgnoredScrobble extends UpstreamError {

}

export const scrobblePayloadToPlay = (obj: LastFMScrobbleRequestPayload): PlayObject => {
    const {
        artist,
        track,
        duration,
        album,
        albumArtist,
    } = obj;

    let ts: Dayjs | undefined;
    if('timestamp' in obj) {
        ts = dayjs.unix(obj.timestamp);
    }
    const mbid = 'mbid' in obj ? obj.mbid : undefined;


    let artists: string[] = [];

    const credits = parseArtistCredits(artist);
    if(credits !== undefined) {
        artists.push(credits.primary);
        if(credits.secondary !== undefined) {
            const nonEmptyArtists = credits.secondary.filter(x => x !== undefined && x !== null && x.trim() !== '');
            if(nonEmptyArtists.length > 0) {
                artists = [...artists, ...nonEmptyArtists];
            }
        }
    } else {
        artists = [artist];
    }

    const play: PlayObject = {
        data: {
            track,
            album: nonEmptyStringOrDefault(album),
            albumArtists: nonEmptyStringOrDefault(albumArtist) !== undefined ? [albumArtist] : undefined,
            duration: typeof duration === 'string' ? parseInt(duration, 10) : duration,
            playDate: ts,
            artists
        },
        meta: {
            source: 'lastfm',
            nowPlaying: obj.method === 'track.updateNowPlaying'
        }
    };

    if(nonEmptyStringOrDefault(mbid) !== undefined) {
        play.data.meta = {
            brainz: {
                track: mbid
            }
        };
    }

    return play;
}

export const playToClientPayload = (playObj: PlayObject): LastFMScrobblePayload => {
        const {
            data: {
                artists = [],
                album,
                albumArtists = [],
                track,
                duration,
                playDate,
                meta: {
                    brainz: {
                        track: mbid
                    } = {},
                } = {}
            } = {}
        } = playObj;

        // LFM does not support multiple artists in scrobble payload
        // https://www.last.fm/api/show/track.scrobble
        let artist: string;
        if (artists.length === 0) {
            artist = "";
        } else {
            artist = artists[0];
        }

        const additionalRichPayload: Partial<LastFMScrobblePayload> = {};
        if(duration !== 0) {
            additionalRichPayload.duration = duration;
        } 

        const rawPayload: LastFMScrobblePayload = {
            artist: artist,
            track,
            album,
            timestamp: getScrobbleTsSOCDate(playObj).unix(),
            mbid,
            ...additionalRichPayload
        };

        // LFM ignores scrobbles where album artist is VA
        // https://github.com/FoxxMD/multi-scrobbler/issues/340#issuecomment-3220774257
        const nonVaAlbumArtists = albumArtists.filter(x => x.trim().toLocaleLowerCase() !== 'va');
        // LFM does not support multiple artists in scrobble payload
        // https://www.last.fm/api/show/track.scrobble
        if (nonVaAlbumArtists.length > 0) {
            rawPayload.albumArtist = nonVaAlbumArtists[0];
        }

        // I don't know if its lastfm-node-client building the request params incorrectly
        // or the last.fm api not handling the params correctly...
        //
        // ...but in either case if any of the below properties is undefined (possibly also null??)
        // then last.fm responds with an IGNORED scrobble and error code 1 (totally unhelpful)
        // so remove all undefined keys from the object before passing to the api client
        return removeUndefinedKeys(rawPayload);
    }

export const formatPlayObj = (obj: LastFMTrackObject, options: FormatPlayObjectOptions = {}): PlayObject => {
    const {
        artist: {
            '#text': artists,
            name: artistName,
            mbid: artistMbid,
        },
        name: title,
        album: {
            '#text': album,
            mbid: albumMbid,
        },
        duration,
        date: {
            uts: time,
        } = {},
        '@attr': {
            nowplaying = 'false',
        } = {},
        url,
        mbid,
    } = obj;
    // arbitrary decision yikes
    const artistStrings = splitByFirstFound(artists, [','], artistName === undefined || artistName.trim() === '' ? [] : [artistName]);
    let al = album;
    if(al !== undefined) {
        if(al === null) {
            al = undefined;
        } else if (al.trim() === '') {
            // lastfm may provide empty string when album data is not defined
            al = undefined;
        }
    }
    const brainz: BrainzMeta = removeUndefinedKeys({
        album: nonEmptyStringOrDefault<undefined>(albumMbid),
        artist: splitByFirstFound<undefined>(artistMbid, [',',';'], undefined),
        track: nonEmptyStringOrDefault<undefined>(mbid)
    });

    const play: PlayObject = {
        data: {
            artists: [...new Set(artistStrings)] as string[],
            track: title,
            album: al,
            duration,
            playDate: time !== undefined ? dayjs.unix(typeof time === 'string' ? Number.parseInt(time, 10) : time) : undefined
        },
        meta: {
            nowPlaying: nowplaying === 'true',
            mbid,
            source: 'Lastfm',
            url: {
                web: url,
            }
        }
    }

    if(brainz !== undefined && !objectIsEmpty(brainz)) {
        play.data.meta = {
            brainz
        }
    }
    return play;
}

type LastFMTrackScrobbleResponse = Readonly<{
	scrobbles: {
		scrobble: {
			track: {
				corrected: LastFMBooleanNumber;
				'#text': string;
			};
			artist: {
				corrected: LastFMBooleanNumber;
				'#text': string;
			};
			album: {
				corrected: LastFMBooleanNumber;
				'#text': string;
			};
			albumArtist: {
				corrected: LastFMBooleanNumber;
				'#text': string;
			};
			timestamp: number;
			ignoredMessage: {
				code: number;
				'#text': string;
			};
		}
		'@attr': {
			accepted: number;
			ignored: number;
            code?: number;
		};
	};
}>;

export type LastFMTrackObject = {
            artist: {
                mbid?: string;
                name?: string
                '#text': string;
            };
            streamable?: LastFMBooleanNumber;
            image?: Array<{
                '#text': string;
                size: string;
            }>;
            mbid?: string;
            album: {
                mbid?: string;
                '#text': string;
            };
            duration?: number;
            name: string;
            url?: string;
            date: {
                uts: string;
                '#text'?: string;
            };
            '@attr'?: {
                nowplaying: 'true' | 'false';
            };
}

export interface LastFMScrobblePayload  {       
        /**
         * join multiple artists with ', '
         * */
        artist: string

        /**
         * track title
         * */
        track: string

        /**
         * Unix timestamp of time track should be scrobbled at
         * */
        timestamp: number
        /**
         * length of track in seconds
         * */
        duration?: number

        album?: string

        albumArtist?: string

        /** MusicBrainz track ID */
        mbid?: string
}

export interface LastFMScrobbleRequestPayload extends LastFMScrobblePayload {
    method: string
}