import LastFm from "lastfm-node-client";
import AbstractApiClient from "./AbstractApiClient.js";
import dayjs from "dayjs";
import {readJson, sleep, writeFile} from "../utils.js";

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

    user;

    constructor(name, config = {}, options = {}) {
        super('lastfm', name, config, options);
        const {redirectUri, apiKey, secret, session, configDir} = config;
        this.redirectUri = `${redirectUri}?state=${name}`;
        if (apiKey === undefined) {
            this.logger.warn("'apiKey' not found in config!");
        }
        this.workingCredsPath = `${configDir}/currentCreds-lastfm-${name}.json`;
        this.client = new LastFm(apiKey, secret, session);
    }

    static formatPlayObj = obj => {
        const {
            artist: {
                // last.fm doesn't seem consistent with which of these properties it returns...
                '#text': artists,
                name: artistName,
            },
            name: title,
            album: {
                '#text': album,
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
        let artistStrings = artists !== undefined ? artists.split(',') : [artistName];
        return {
            data: {
                artists: [...new Set(artistStrings)],
                track: title,
                album,
                duration,
                playDate: time !== undefined ? dayjs.unix(time) : undefined,
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

    callApi = async (func, retries = 0) => {
        const {
            maxRequestRetries = 2,
            retryMultiplier = 1.5
        } = this.config;

        try {
            return await func(this.client);
        } catch (e) {
            const {
                message,
            } = e;
            // for now check for exceptional errors by matching error code text
            const retryError = retryErrors.find(x => message.toLocaleLowerCase().includes(x));
            if(undefined !== retryError) {
                if(retries < maxRequestRetries) {
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
        const redir = `${this.config.redirectUri}?state=${this.name}`;
        return `http://www.last.fm/api/auth/?api_key=${this.config.apiKey}&cb=${encodeURIComponent(redir)}`
    }

    authenticate = async (token) => {
        const sessionRes = await this.client.authGetSession({token});
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
        } catch (e) {
            this.logger.warn('Current lastfm credentials file exists but could not be parsed', {path: this.workingCredsPath});
        }

        if (this.client.sessionKey === undefined) {
            this.logger.info('No session key found. User interaction for authentication required.');
            return;
        }
        try {
            const infoResp = await this.callApi(client => client.userGetInfo());
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
            this.logger.error('Testing connection failed');
            return false;
        }
    }

}
