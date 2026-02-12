import dayjs, { Dayjs, ManipulateType } from "dayjs";
import { BrainzMeta, PlayObject, PlayObjectLifecycleless, ScrobbleActionResult, UnixTimestamp, URLData, Writeable } from "../../../core/Atomic.js";
import { nonEmptyStringOrDefault, splitByFirstFound } from "../../../core/StringUtils.js";
import { removeUndefinedKeys, sleep, writeFile } from "../../utils.js";
import { objectIsEmpty, readJson } from '../../utils/DataUtils.js';
import { isPortReachableConnect, joinedUrl, normalizeWebAddress } from "../../utils/NetworkUtils.js";
import { getScrobbleTsSOCDate } from "../../utils/TimeUtils.js";
import { getNodeNetworkException, isNodeNetworkException } from "../errors/NodeErrors.js";
import { UpstreamError } from "../errors/UpstreamError.js";
import { AbstractApiOptions, DEFAULT_RETRY_MULTIPLIER, FormatPlayObjectOptions, InternalConfigOptional, PaginatedListensTimeRangeOptions, PaginatedTimeRangeListens, PaginatedTimeRangeListensResult } from "../infrastructure/Atomic.js";
import { LastfmData } from "../infrastructure/config/client/lastfm.js";
import AbstractApiClient from "./AbstractApiClient.js";
import { normalizeStr, parseArtistCredits } from "../../utils/StringUtils.js";
import { LastFMUser, LastFMAuth, LastFMTrack, LastFMUserGetRecentTracksResponse, LastFMBooleanNumber, LastFMUpdateNowPlayingResponse, LastFMUserGetInfoResponse, LastFMUserGetRecentTracksParams } from 'lastfm-ts-api';
import clone from 'clone';
import { IncomingMessage } from "http";
import { baseFormatPlayObj } from "../../utils/PlayTransformUtils.js";
import { ScrobbleSubmitError } from "../errors/MSErrors.js";

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

export const LIBREFM_HOST = 'libre.fm';
export const LIBREFM_PATH = '/2.0/';
export const LASTFM_HOST = 'ws.audioscrobbler.com';
export const LASTFM_PATH = '/2.0';

export default class LastfmApiClient extends AbstractApiClient implements PaginatedTimeRangeListens {

    user?: string;
    declare config: LastfmData;
    sessionKey?: string;

    urlBase: string;
    path: string;
    upstreamName: string = 'Last.fm';

    url: URLData;

    userApi!: LastFMUser;
    trackApi!: LastFMTrack;

    constructor(name: any, config: Partial<LastfmData> & {urlBase?: string}, options: AbstractApiOptions & InternalConfigOptional & {type?: string}) {
        const {type = 'lastfm', configDir, localUrl} = options ?? {};
        super(type, name, config, options);
        const {
            redirectUri, 
            apiKey, 
            secret, 
            session, 
            urlBase = `https://${LASTFM_HOST}${LASTFM_PATH}`
        } = config;

        this.url = normalizeWebAddress(urlBase, {removeTrailingSlash: false});
        let cbPrefix = 'lastfm';

        if(this.url.url.host === LASTFM_HOST) {
            this.logger.info('Using official Last.fm instance host/path');
            cbPrefix = 'lastfm';
            if (apiKey === undefined) {
                this.logger.warn(`'apiKey' not found in config!`);
            }
        } else {
            this.upstreamName = 'Libre.fm';
            cbPrefix = 'librefm';
            if(this.url.url.host === LIBREFM_HOST) {
                this.logger.info('Using official Libre.fm instance host/path');
            } else {
                this.logger.info('Assuming custom Libre.fm instance');
            }
        }

        this.redirectUri = `${redirectUri ?? joinedUrl(localUrl, `${cbPrefix}/callback`).href}?state=${normalizeStr(this.name, {keepSingleWhitespace: false})}`;

        this.logger.info(`Using ${this.url.normal} for API calls`);
        this.logger.info(`Redirect Uri: ${this.redirectUri}`);
        this.workingCredsPath = `${configDir}/currentCreds-${this.url.url.host === LASTFM_HOST ? 'lastfm' : 'librefm'}-${name}.json`;
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
            if('content' in e) {
                let msg = 'Raw Response';
                if('response' in e) {
                    msg = `(${(e.response as IncomingMessage).statusCode}) ${msg}`;
                }
                this.logger.error(`${msg}:\n${e.content}`);
            }
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

        if(this.url.url.host === LASTFM_HOST) {
            return `http://www.last.fm/api/auth/?api_key=${this.config.apiKey}&cb=${encodeURIComponent(this.redirectUri)}`;
        }

        const aUrl = new URL(this.url.url.toString());
        aUrl.search = `?api_key=${this.config.apiKey}&cb=${encodeURIComponent(this.redirectUri)}`;
        aUrl.pathname = '/api/auth';
        return aUrl.toString();
    }

    authenticate = async (token: any) => {

        const auth = new LastFMAuth(this.config.apiKey, this.config.secret, undefined, {
                hostname: this.url.url.host,
                path: this.url.url.pathname
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
                hostname: this.url.url.host,
                path: this.url.url.pathname
        });
        this.trackApi = new LastFMTrack(this.config.apiKey, this.config.secret, this.sessionKey, {
                hostname: this.url.url.host,
                path: this.url.url.pathname
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

    testConnection = async() => {
        try {
            await isPortReachableConnect(this.url.port, { host: this.url.url.hostname });
            this.logger.verbose(`${this.url.url.hostname}:${this.url.port} is reachable.`);
            return true;
        } catch (e) {
            const hint = e.error?.cause?.message ?? undefined;
            throw new Error(`Could not connect to ${this.upstreamName} API server${hint !== undefined ? ` (${hint})` : ''}`, { cause: e.error ?? e });
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
            if(this.urlBase !== LASTFM_HOST) {
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

    getRecentTracksWithPagination = async (options: TracksFetchOptions = {}) => {
        const { page = 1, limit = 200, from, to } = options;

        return await this.getRecentTracks({limit, from, to, page, extended: 1});
    }

    getPaginatedUnitOfTime(): ManipulateType {
        return 'second';
    }

    getPaginatedTimeRangeListens = async (fetchOptions: PaginatedListensTimeRangeOptions, options: {includeNowPlaying?: boolean} = {}): Promise<PaginatedTimeRangeListensResult> => {

        const resp = await this.getRecentTracksWithPagination(fetchOptions);

        const {includeNowPlaying = true} =  options;

        const {
            recenttracks: {
                track: list = [],
                '@attr': {
                    total,
                    totalPages,
                    page
                }
            } = {},
        } = resp;

        const plays = list.reduce((acc: any, x: any) => {
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
                    if (nowPlaying === true && !includeNowPlaying) {
                        // if the track is "now playing" it doesn't get a timestamp so we can't determine when it started playing
                        // and don't want to accidentally count the same track at different timestamps by artificially assigning it 'now' as a timestamp
                        // so we'll just ignore it in the context of recent tracks since really we only want "tracks that have already finished being played" anyway
                        this.logger.debug( { track, mbid }, `Ignoring 'now playing' track returned from ${this.upstreamName} client`);
                        return acc;
                    } else if (playDate === undefined) {
                        this.logger.warn({ track, mbid }, `${this.upstreamName} recently scrobbled track did not contain a timestamp, omitting from time frame check`);
                        return acc;
                    }
                    return acc.concat(formatted);
                } catch (e) {
                    this.logger.warn(new Error(`Failed to format ${this.upstreamName} recently scrobbled track, omitting from time frame check`, { cause: e }));
                    this.logger.debug({data: x}, 'Full api response object:');
                    return acc;
                }
            }, []);

        return {data: plays, meta: {...fetchOptions, total: parseInt(total, 10), more: fetchOptions.page < parseInt(totalPages, 10)}};

    }

    getRecentTracks = async (options: TracksFetchOptions = {}): Promise<LastFMUserGetRecentTracksResponse> => {

        const { to, from, extended = 1, ...rest} = options;

        const requestOpts: Writeable<LastFMUserGetRecentTracksParams> = {
            ...rest,
            // sk is required if user has "Hide recent listening" enabled on their profile
            sk: this.sessionKey,
            user: this.user,
            extended
        };

        if(to !== undefined) {
            requestOpts.to = to.toString();
        }
        if(from !== undefined) {
            requestOpts.from = from.toString();
        }

        let resp: LastFMUserGetRecentTracksResponse;
        try {
            return await this.callApi<LastFMUserGetRecentTracksResponse>(() => this.userApi.getRecentTracks(requestOpts));
        } catch (e) {
            if(e.message.includes('Invalid resource specified')) {
                // likely the user does not have any scrobbles on their profile yet
                // https://github.com/FoxxMD/multi-scrobbler/issues/401#issuecomment-3749489057
                // https://github.com/libre-fm/libre-fm/discussions/91#discussioncomment-15456070
                // so we log as a warning and return empty array instead
                this.logger.warn(new Error('This error occurs when a librefm (and lastfm?) account has no existing scrobbles yet. If you are seeing this warning and this is not the case, please create an issue', {cause: e}));
                return {
                    recenttracks: {
                        track: [],
                        '@attr': {
                            user: this.user,
                            totalPages: '0',
                            total: '0',
                            page: '1',
                            perPage: '50'
                        }
                    }
                }
            }
            this.logger.debug(resp);
            throw e;
        }
    }

    scrobble = async (playObj: PlayObject): Promise<ScrobbleActionResult> => {
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

            return {payload: scrobblePayload, response, mergedScrobble: modifiedPlay};
            // last fm has rate limits but i can't find a specific example of what that limit is. going to default to 1 scrobble/sec to be safe
            //await sleep(1000);
        } catch (e) {
            let apiError: Error;
            if(!(e instanceof UpstreamError)) {
                apiError = new UpstreamError(`Error received from ${this.upstreamName} API`, {cause: e, showStopper: true});
            } else {
                apiError = e;
            }
            throw new ScrobbleSubmitError('Failed to submit scrobble to Last.fm', {cause: apiError, payload: scrobblePayload});
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
    to?: UnixTimestamp
    from?: UnixTimestamp
    extended?: 0 | 1
    page?: number
    /** Max 200. Default is 50 */
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

    const play: PlayObjectLifecycleless = {
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
                recording: mbid
            }
        };
    }

    return baseFormatPlayObj(obj, play);
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
                        recording: mbid
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

export const formatPlayObj = (obj: LastFMTrackObject, options: FormatPlayObjectOptions & {source?: string} = {}): PlayObject => {
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
    const {
        source = 'Lastfm'
    } = options;
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
    const brainz = removeUndefinedKeys<BrainzMeta>({
        album: nonEmptyStringOrDefault<undefined>(albumMbid),
        artist: splitByFirstFound<undefined>(artistMbid, [',',';'], undefined),
        recording: nonEmptyStringOrDefault<undefined>(mbid)
    });

    const play: PlayObjectLifecycleless = {
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
            source,
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
    return baseFormatPlayObj(obj, play);
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