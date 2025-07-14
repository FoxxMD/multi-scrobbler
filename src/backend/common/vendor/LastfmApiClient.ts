import dayjs, { Dayjs } from "dayjs";
import LastFm, {
    AuthGetSessionResponse,
    LastfmTrackUpdateRequest, TrackObject,
    TrackScrobblePayload,
    UserGetInfoResponse
} from "lastfm-node-client";
import { PlayObject } from "../../../core/Atomic.js";
import { nonEmptyStringOrDefault, splitByFirstFound } from "../../../core/StringUtils.js";
import { readJson, removeUndefinedKeys, sleep, writeFile } from "../../utils.js";
import { joinedUrl } from "../../utils/NetworkUtils.js";
import { getScrobbleTsSOCDate } from "../../utils/TimeUtils.js";
import { getNodeNetworkException, isNodeNetworkException } from "../errors/NodeErrors.js";
import { UpstreamError } from "../errors/UpstreamError.js";
import { AbstractApiOptions, DEFAULT_RETRY_MULTIPLIER, FormatPlayObjectOptions } from "../infrastructure/Atomic.js";
import { LastfmData } from "../infrastructure/config/client/lastfm.js";
import AbstractApiClient from "./AbstractApiClient.js";
import { parseArtistCredits } from "../../utils/StringUtils.js";

const badErrors = [
    'api key suspended',
    'invalid session key',
    'invalid api key',
    'authentication failed'
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

    constructor(name: any, config: Partial<LastfmData> & {configDir: string, localUrl: URL}, options: AbstractApiOptions) {
        super('lastfm', name, config, options);
        const {redirectUri, apiKey, secret, session, configDir} = config;
        this.redirectUri = `${redirectUri ?? joinedUrl(config.localUrl, 'lastfm/callback').href}?state=${name}`;
        if (apiKey === undefined) {
            this.logger.warn("'apiKey' not found in config!");
        }
        this.workingCredsPath = `${configDir}/currentCreds-lastfm-${name}.json`;
        this.client = new LastFm(apiKey as string, secret, session);
    }

    static formatPlayObj(obj: TrackObject, options: FormatPlayObjectOptions = {}): PlayObject {
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
        const artistStrings = splitByFirstFound(artists, [','], [artistName]);
        let al = album;
        if(al !== undefined) {
            if(al === null) {
                al = undefined;
            } else if (al.trim() === '') {
                // lastfm may provide empty string when album data is not defined
                al = undefined;
            }
        }
        return {
            data: {
                artists: [...new Set(artistStrings)] as string[],
                track: title,
                album: al,
                duration,
                playDate: time !== undefined ? dayjs.unix(time) : undefined,
                meta: {
                    brainz: {
                        album: nonEmptyStringOrDefault<undefined>(albumMbid),
                        artist: splitByFirstFound<undefined>(artistMbid, [',',';'], undefined),
                        track: nonEmptyStringOrDefault<undefined>(mbid)
                    }
                }
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
    }

    callApi = async <T>(func: any, retries = 0): Promise<T> => {
        const {
            maxRequestRetries = 2,
            retryMultiplier = DEFAULT_RETRY_MULTIPLIER
        } = this.config;

        try {
            return await func(this.client) as T;
        } catch (e) {
            const {
                message,
            } = e;
            // for now check for exceptional errors by matching error code text
            const retryError = retryErrors.find(x => message.toLocaleLowerCase().includes(x));
            let networkError =  null;
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

    getAuthUrl = () => `http://www.last.fm/api/auth/?api_key=${this.config.apiKey}&cb=${encodeURIComponent(this.redirectUri)}`

    authenticate = async (token: any) => {
        const sessionRes: AuthGetSessionResponse = await this.client.authGetSession({token});
        const {
            session: {
                key: sessionKey,
                name, // username
            } = {}
        } = sessionRes;
        this.client.sessionKey = sessionKey;

        await writeFile(this.workingCredsPath, JSON.stringify({
            sessionKey,
        }));
    }

    initialize = async (): Promise<true> => {

        try {
            const creds = await readJson(this.workingCredsPath, {throwOnNotFound: false});
            const {sessionKey} = creds || {};
            if (this.client.sessionKey === undefined && sessionKey !== undefined) {
                this.client.sessionKey = sessionKey;
            }
            return true;
        } catch (e) {
            throw new Error('Current lastfm credentials file exists but could not be parsed', {cause: e});
        }
    }

    testAuth = async () => {
        if (this.client.sessionKey === undefined) {
            this.logger.warn('No session key found. User interaction for authentication required.');
            this.logger.info(`Redirect URL that will be used on auth callback: '${this.redirectUri}'`);
            return false;
        }
        try {
            const infoResp = await this.callApi<UserGetInfoResponse>((client: any) => client.userGetInfo());
            const {
                user: {
                    name,
                } = {}
            } = infoResp;
            this.user = name;
            this.initialized = true;
            this.logger.info(`Client authorized for user ${name}`)
            return true;
        } catch (e) {
            this.logger.error('Testing auth failed');
            if(isNodeNetworkException(e)) {
                this.logger.error('Could not communicate with Last.fm API');
            }
            throw e;
        }
    }

    public playToClientPayload(playObj: PlayObject): TrackScrobblePayload {
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

        const additionalRichPayload: Partial<TrackScrobblePayload> = {};
        if(duration !== 0) {
            additionalRichPayload.duration = duration;
        } 

        const rawPayload: TrackScrobblePayload = {
            artist: artist,
            track,
            album,
            timestamp: getScrobbleTsSOCDate(playObj).unix(),
            mbid,
            ...additionalRichPayload
        };

        // LFM does not support multiple artists in scrobble payload
        // https://www.last.fm/api/show/track.scrobble
        if (albumArtists.length > 0) {
            rawPayload.albumArtist = albumArtists[0];
        }

        // I don't know if its lastfm-node-client building the request params incorrectly
        // or the last.fm api not handling the params correctly...
        //
        // ...but in either case if any of the below properties is undefined (possibly also null??)
        // then last.fm responds with an IGNORED scrobble and error code 1 (totally unhelpful)
        // so remove all undefined keys from the object before passing to the api client
        return removeUndefinedKeys(rawPayload);
    }
}

export const scrobblePayloadToPlay = (obj: LastfmTrackUpdateRequest): PlayObject => {
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