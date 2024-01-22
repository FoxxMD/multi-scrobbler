import LastFm, {AuthGetSessionResponse, TrackObject, UserGetInfoResponse} from "lastfm-node-client";
import AbstractApiClient from "./AbstractApiClient.js";
import dayjs from "dayjs";
import { readJson, sleep, writeFile } from "../../utils.js";
import { DEFAULT_RETRY_MULTIPLIER, FormatPlayObjectOptions } from "../infrastructure/Atomic.js";
import { LastfmData } from "../infrastructure/config/client/lastfm.js";
import { PlayObject } from "../../../core/Atomic.js";
import { isNodeNetworkException } from "../errors/NodeErrors.js";
import { nonEmptyStringOrDefault, splitByFirstFound } from "../../../core/StringUtils.js";
import {source} from "common-tags";
import {ErrorWithCause} from "pony-cause";

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

    constructor(name: any, config: Partial<LastfmData> & {configDir: string, localUrl: string}, options = {}) {
        super('lastfm', name, config, options);
        const {redirectUri, apiKey, secret, session, configDir} = config;
        this.redirectUri = `${redirectUri ?? `${config.localUrl}/lastfm/callback`}?state=${name}`;
        if (apiKey === undefined) {
            this.logger.warn("'apiKey' not found in config!");
        }
        this.workingCredsPath = `${configDir}/currentCreds-lastfm-${name}.json`;
        this.client = new LastFm(apiKey as string, secret, session);
    }

    static formatPlayObj = (obj: TrackObject, options: FormatPlayObjectOptions = {}): PlayObject => {
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
                // @ts-ignore
                uts: time,
            } = {},
            '@attr': {
                nowplaying = 'false',
            } = {},
            url,
            mbid,
        } = obj;
        // arbitrary decision yikes
        let artistStrings = splitByFirstFound(artists, [','], [artistName]);
        return {
            data: {
                artists: [...new Set(artistStrings)] as string[],
                track: title,
                album,
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
            if (undefined !== retryError) {
                if (retries < maxRequestRetries) {
                    const delay = (retries + 1) * retryMultiplier;
                    this.logger.warn(`API call was not good but recoverable (${retryError}), retrying in ${delay} seconds...`);
                    await sleep(delay * 1000);
                    return this.callApi(func, retries + 1);
                } else {
                    this.logger.warn('Could not recover!');
                    throw e;
                }
            }

            throw e;
        }
    }

    getAuthUrl = () => {
        return `http://www.last.fm/api/auth/?api_key=${this.config.apiKey}&cb=${encodeURIComponent(this.redirectUri)}`
    }

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

    initialize = async () => {

        try {
            const creds = await readJson(this.workingCredsPath, {throwOnNotFound: false});
            const {sessionKey} = creds || {};
            if (this.client.sessionKey === undefined && sessionKey !== undefined) {
                this.client.sessionKey = sessionKey;
            }
            return true;
        } catch (e) {
            throw new ErrorWithCause('Current lastfm credentials file exists but could not be parsed', {cause: e});
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

}
