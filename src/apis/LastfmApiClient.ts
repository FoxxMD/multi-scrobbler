// @ts-expect-error TS(7016): Could not find a declaration file for module 'last... Remove this comment to see the full error message
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

// @ts-expect-error TS(2417): Class static side 'typeof LastfmApiClient' incorre... Remove this comment to see the full error message
export default class LastfmApiClient extends AbstractApiClient {

    user: any;

    constructor(name: any, config = {}, options = {}) {
        super('lastfm', name, config, options);
        // @ts-expect-error TS(2339): Property 'redirectUri' does not exist on type '{}'... Remove this comment to see the full error message
        const {redirectUri, apiKey, secret, session, configDir} = config;
        this.redirectUri = `${redirectUri}?state=${name}`;
        if (apiKey === undefined) {
            this.logger.warn("'apiKey' not found in config!");
        }
        this.workingCredsPath = `${configDir}/currentCreds-lastfm-${name}.json`;
        this.client = new LastFm(apiKey, secret, session);
    }

    static formatPlayObj = (obj: any) => {
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
                // @ts-expect-error TS(2525): Initializer provides no value for this binding ele... Remove this comment to see the full error message
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

    // @ts-expect-error TS(7024): Function implicitly has return type 'any' because ... Remove this comment to see the full error message
    callApi = async (func: any, retries = 0) => {
        const {
            // @ts-expect-error TS(2339): Property 'maxRequestRetries' does not exist on typ... Remove this comment to see the full error message
            maxRequestRetries = 2,
            // @ts-expect-error TS(2339): Property 'retryMultiplier' does not exist on type ... Remove this comment to see the full error message
            retryMultiplier = 1.5
        } = this.config;

        try {
            return await func(this.client);
        } catch (e) {
            const {
                // @ts-expect-error TS(2339): Property 'message' does not exist on type 'unknown... Remove this comment to see the full error message
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
        // @ts-expect-error TS(2339): Property 'redirectUri' does not exist on type '{}'... Remove this comment to see the full error message
        const redir = `${this.config.redirectUri}?state=${this.name}`;
        // @ts-expect-error TS(2339): Property 'apiKey' does not exist on type '{}'.
        return `http://www.last.fm/api/auth/?api_key=${this.config.apiKey}&cb=${encodeURIComponent(redir)}`
    }

    authenticate = async (token: any) => {
        const sessionRes = await this.client.authGetSession({token});
        const {
            session: {
                // @ts-expect-error TS(2525): Initializer provides no value for this binding ele... Remove this comment to see the full error message
                key: sessionKey,
                // @ts-expect-error TS(2525): Initializer provides no value for this binding ele... Remove this comment to see the full error message
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
            this.logger.warn('Current lastfm credentials file exists but could not be parsed', {path: this.workingCredsPath});
            return false;
        }
    }

    testAuth = async () => {
        if (this.client.sessionKey === undefined) {
            this.logger.info('No session key found. User interaction for authentication required.');
            return false;
        }
        try {
            const infoResp = await this.callApi((client: any) => client.userGetInfo());
            const {
                user: {
                    // @ts-expect-error TS(2525): Initializer provides no value for this binding ele... Remove this comment to see the full error message
                    name,
                } = {}
            } = infoResp;
            this.user = name;
            this.initialized = true;
            this.logger.info(`Client authorized for user ${name}`)
            return true;
        } catch (e) {
            this.logger.error('Testing auth failed');
            throw e;
        }
    }

}
