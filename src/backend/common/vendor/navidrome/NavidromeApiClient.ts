import dayjs from "dayjs";
import { PlayObject, URLData } from "../../../../core/Atomic.js";
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
import { NavidromeData } from "../../infrastructure/config/source/navidrome.js";
import { isSuperAgentResponseError } from "../../errors/ErrorUtils.js";

export class NavidromeApiClient extends AbstractApiClient {

    declare config: NavidromeData;
    url: URLData;

    token?: string;
    subsonicToken?: string;
    subsonicSalt?: String
    userId?: string

    constructor(name: any, config: NavidromeData, options: AbstractApiOptions) {
        super('Navidrome', name, config, options);

        const {
            url
        } = this.config;

        this.url = normalizeWebAddress(url);
        this.logger.verbose(`Config URL: '${url ?? '(None Given)'}' => Normalized: '${this.url.url}'`)
    }

    callApi = async <T = Response>(req: Request): Promise<T> => {

        let resp: Response;
        try {
            req.set('x-nd-authorization', `Bearer ${this.token}`);
            req.set('x-nd-client-unique-id', '2297e6c3-4f63-45ef-b60b-5a959e23e666')
            resp = await req;
            return resp as T;
        } catch (e) {
            if(isSuperAgentResponseError(e)) {
                resp = e.response;
            }
            throw e;
        } finally {
            if(resp.headers !== undefined && resp.headers['x-nd-authorization'] !== undefined) {
                this.token = resp.headers['x-nd-authorization'];
            }
        }
    }

    testConnection = async () => {
        try {
            await isPortReachableConnect(this.url.port, { host: this.url.url.hostname });
        } catch (e) {
            throw new Error(`Navidrome server is not reachable at ${this.url.url.hostname}:${this.url.port}`, { cause: e });
        }
    }

    testAuth = async () => {
        try {
            const resp = await request.post(`${joinedUrl(this.url.url, '/auth/login')}`)
                .type('json')
                .send({
                    username: this.config.user,
                    password: this.config.password
                });
                this.token = resp.body.token;
                this.subsonicToken = resp.body.subsonicToken;
                this.subsonicSalt = resp.body.subsonicSalt;
                this.userId = resp.body.id

            return true;
        } catch (e) {
            throw new Error('Could not validate Navidrome user/password', { cause: e });
        }
    }

    getRecentlyPlayed = async (maxTracks: number): Promise<any> => {
        try {
            return [];
        } catch (e) {
            this.logger.error(`Error encountered while getting User listens | Error =>  ${e.message}`);
            return [];
        }
    }
}