import dayjs from "dayjs";
import { PlayObject, PlayObjectLifecycleless, ScrobbleActionResult, URLData } from "../../../../core/Atomic.js";
import { AbstractApiOptions, DEFAULT_RETRY_MULTIPLIER } from "../../infrastructure/Atomic.js";
import { KoitoData, ListenObjectResponse, ListensResponse } from "../../infrastructure/config/client/koito.js";
import AbstractApiClient from "../AbstractApiClient.js";
import { getBaseFromUrl, isPortReachableConnect, joinedUrl, normalizeWebAddress } from "../../../utils/NetworkUtils.js";
import request, { Request, Response } from 'superagent';
import { UpstreamError } from "../../errors/UpstreamError.js";
import { playToListenPayload } from "../ListenbrainzApiClient.js";
import { SubmitPayload } from '../listenbrainz/interfaces.js';
import { ListenType } from '../listenbrainz/interfaces.js';
import { parseRegexSingleOrFail } from "../../../utils.js";
import { baseFormatPlayObj } from "../../../utils/PlayTransformUtils.js";
import { ScrobbleSubmitError } from "../../errors/MSErrors.js";

interface SubmitOptions {
    log?: boolean
    listenType?: ListenType
}

const KOITO_LZ_PATH: RegExp = new RegExp(/^\/apis\/listenbrainz(\/?1?\/?)?$/);

export class KoitoApiClient extends AbstractApiClient {

    declare config: KoitoData;
    url: URLData;

    constructor(name: any, config: KoitoData, options: AbstractApiOptions) {
        super('Koito', name, config, options);

        const {
            url
        } = this.config;

        const u = normalizeWebAddress(url);
        if(u.url.pathname === '/') {
            this.url = u;
        } else if(parseRegexSingleOrFail(KOITO_LZ_PATH, u.url.pathname) !== undefined) {
           this.logger.verbose('Detected Koito Server URL path only contains listenbrainz prefix. Removing this for API calls so non-listenbrainz paths work correctly.');
           this.url = normalizeWebAddress(getBaseFromUrl(u.url).toString());
        } else {
            this.logger.verbose('It looks like Koito server URL contains non-standard parts (not "just" /apis/listenbrainz"). MS will assume this is the ROOT path for the Koito server.');
            this.url = u;
        }

        this.logger.verbose(`Config URL: '${url ?? '(None Given)'}' => Normalized: '${this.url.url}'`)
    }

    callApi = async <T = Response>(req: Request, retries = 0): Promise<T> => {
        const {
            maxRequestRetries = 2,
            retryMultiplier = DEFAULT_RETRY_MULTIPLIER
        } = this.config;

        try {
            req.set('Authorization', `Token ${this.config.token}`);
            return await req as T;
        } catch (e) {
            const {
                message,
                err,
                status,
                response: {
                    body = undefined,
                    text = undefined,
                } = {}
            } = e;
            // TODO check err for network exception
            if (status !== undefined) {
                const statusMsg = `(HTTP Status ${status})`;
                const msgParts = [];
                // if the response is 400 then its likely there was an issue with the data we sent rather than an error with the service
                const showStopper = status !== 400;
                if (body !== undefined) {
                    if (typeof body === 'object') {
                        if ('code' in body) {
                            msgParts.push(`Code ${body.code}`);
                        }
                        if ('error' in body) {
                            msgParts.push(`Error => ${body.error}`);
                        }
                        if ('message' in body) {
                            msgParts.push(`Message => ${body.error}`);
                        }
                    } else if (typeof body === 'string') {
                        msgParts.push(`Response => ${body}`);
                    }
                }
                if (msgParts.length === 0 && text !== undefined && text.trim() !== '') {
                    msgParts.push(`Response => ${text}`);
                }
                throw new UpstreamError(`Koito API Request Failed => ${[statusMsg, ...msgParts].join(' | ')}`, { cause: e, showStopper });
            }
            throw e;
        }
    }

    testConnection = async () => {
        try {
            await isPortReachableConnect(this.url.port, { host: this.url.url.hostname });
        } catch (e) {
            throw new Error(`Koito server is not reachable at ${this.url.url.hostname}:${this.url.port}`, { cause: e });
        }

        try {
            const resp = await this.callApi(request.get(`${joinedUrl(this.url.url, 'apis/web/v1/stats')}`));
            if(resp.type !== 'application/json') {
                throw new Error(`Expected response from ${resp.request.url} to be 'application/json' but got ${resp.type}. Is the Normalized Koito URL correct?`);
            }
        } catch (e) {
            let allowedHint = '';
            if(e.cause !== undefined && 'response' in e.cause) {
                if(e.cause.response.status === 403) {
                    allowedHint = ` HINT: 403 usually means Koito env KOITO_ALLOWED_HOSTS is not configured correctly to allowed requests from multi-scrobbler. Check Koito logs for warnings.`
                }
            }
            throw new Error(`A server exists at ${this.url.url.hostname}:${this.url.port} but is not responding to API calls as expected.${allowedHint}`, { cause: e });
        }

    }

    testAuth = async () => {
        try {
            const resp = await this.callApi(request.get(`${joinedUrl(this.url.url, '/apis/listenbrainz/1/validate-token')}`));
            return true;
        } catch (e) {
            throw new Error('Could not validate Koito API Key', { cause: e });
        }
    }

    getUserListens = async (maxTracks: number): Promise<ListensResponse> => {
        try {

            const resp = await this.callApi(request
                .get(`${joinedUrl(this.url.url, '/apis/web/v1/listens')}`)
                .query({
                    period: 'all_time',
                    page: 0,
                    limit: maxTracks
                })
            );
            const { body } = resp as any;
            return body as ListensResponse;
        } catch (e) {
            throw e;
        }
    }

    getUserListensWithPagination = async (options: {
        count?: number;
        minTs?: number;
        maxTs?: number;
    } = {}): Promise<ListensResponse> => {
        const { count = 100, minTs, maxTs } = options;

        try {
            const query: any = { count };
            if (minTs !== undefined) {
                query.min_ts = minTs;
            }
            if (maxTs !== undefined) {
                query.max_ts = maxTs;
            }

            const resp = await this.callApi(request
                .get(`${joinedUrl(this.url.url, '/apis/listenbrainz/1/user', this.config.username, 'listens')}`)
                .timeout({
                    response: 15000,
                    deadline: 30000
                })
                .query(query));

            const { body: { payload } } = resp as any;
            return payload as ListensResponse;
        } catch (e) {
            throw e;
        }
    }

    getRecentlyPlayed = async (maxTracks: number): Promise<PlayObject[]> => {
        try {
            const resp = await this.getUserListens(maxTracks);
            return resp.items.map(x => listenObjectResponseToPlay(x, { url: this.url.url }));
        } catch (e) {
            this.logger.error(`Error encountered while getting User listens | Error =>  ${e.message}`);
            return [];
        }
    }

    submitListen = async (play: PlayObject, options: SubmitOptions = {}): Promise<ScrobbleActionResult> => {
        const { log = false, listenType = 'single' } = options;
        const listenPayload: SubmitPayload = { listen_type: listenType, payload: [playToListenPayload(play)] };
        try {
            if (listenType === 'playing_now') {
                delete listenPayload.payload[0].listened_at;
            }
            if (log) {
                this.logger.debug(`Submit Payload: ${JSON.stringify(listenPayload)}`);
            }
            // response consists of {"status": "ok"}
            // so no useful information
            // https://listenbrainz.readthedocs.io/en/latest/users/api-usage.html#submitting-listens
            // TODO may we should make a call to recent-listens to get the parsed scrobble?
            const resp = await this.callApi(request.post(`${joinedUrl(this.url.url, '/apis/listenbrainz/1/submit-listens')}`).type('json').send(listenPayload));
            if (log) {
                this.logger.debug(`Submit Response: ${resp.text}`)
            }
            return {payload: listenPayload, response: resp.text};
        } catch (e) {
            throw new ScrobbleSubmitError(`Error occurred while making Koito API submit request (listen_type ${listenPayload.listen_type})`, {cause: e, payload: listenPayload, response: e.response, responseBody: e.response?.text});
        }
    }

}

export const listenObjectResponseToPlay = (obj: ListenObjectResponse, options: { newFromSource?: boolean, url?: URL } = {}): PlayObject => {
    const play: PlayObjectLifecycleless = {
        data: {
            track: obj.track.title,
            artists: (obj.track.artists ?? []).map(x => x.name),
            duration: obj.track.duration,
            playDate: dayjs(obj.time)
        },
        meta: {
            source: 'Koito',
            newFromSource: options.newFromSource ?? false,
            trackId: obj.track.id.toString(),
            url: {
                    web: options.url !== undefined ? joinedUrl(options.url, `/track/${obj.track.id.toString()}`).toString() : undefined
            }
        }
    }
    if (obj.track.musicbrainz_id !== null) {
        play.data.meta = {
            brainz: {
                recording: obj.track.musicbrainz_id
            }
        }
    }
    return baseFormatPlayObj(obj, play);
}