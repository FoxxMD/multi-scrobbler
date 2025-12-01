import dayjs from "dayjs";
import request, { Request, Response } from 'superagent';
import { PlayObject, URLData } from "../../../../core/Atomic.js";
import { nonEmptyStringOrDefault } from "../../../../core/StringUtils.js";
import { UpstreamError } from "../../errors/UpstreamError.js";
import { AbstractApiOptions, DEFAULT_RETRY_MULTIPLIER, FormatPlayObjectOptions, MusicbrainzConfigData } from "../../infrastructure/Atomic.js";
import AbstractApiClient from "../AbstractApiClient.js";
import { isPortReachableConnect, joinedUrl, normalizeWebAddress } from '../../../utils/NetworkUtils.js';
import { MusicBrainzApi, IRecording, ISearchResult, IRecordingList, ISearchQuery } from 'musicbrainz-api';
import { sleep } from "../../../utils.js";

export interface SubmitResponse {
    payload?: {
        ignored_listens: number
        submitted_listens: number
    },
    status: string
}

export class MusicbrainzApiClient extends AbstractApiClient {

    declare config: MusicbrainzConfigData;
    protected api: MusicBrainzApi;
    protected url: URLData;

    constructor(name: any, config: MusicbrainzConfigData & { version: string }, options: AbstractApiOptions) {
        super('Musicbrainz', name, config, options);
        const {
            url = 'https://musicbrainz.org',
        } = config;

        this.url = normalizeWebAddress(url);

        this.api = new MusicBrainzApi({
            appName: 'multi-scrobbler',
            appVersion: config.version,
            appContactInfo: config.contact,
            baseUrl: url
        });
    }

    callApi = async <T = Response>(func: (mb: MusicBrainzApi) => Promise<any>, options?: { timeout?: number }): Promise<T> => {
        const {
            timeout = 15000
        } = options || {};

        try {
            const res = Promise.race([
                func(this.api),
                sleep(timeout)
            ]);
            await res;
            if (res === undefined) {
                throw new Error('Timeout occurred while waiting for Musicbrainz API rate limit');
            }
            return res as T;
        } catch (e) {
            throw new UpstreamError('Error occurred in Musicbrainz API', { cause: e });
        }
    }

    searchByRecording = async(play: PlayObject): Promise<IRecordingList> => {
        return await this.callApi((mb) => {
            const query: Record<string, any> = {
                recording: play.data.track
            };
            if(play.data.artists !== undefined && play.data.artists.length > 0) {
                query.artist = play.data.artists[0];
            }
            if(play.data.album !== undefined) {
                query.release = play.data.album;
            }
            return mb.search('recording', {
                query
            });
        });
    }

    testConnection = async () => {
        try {
            await isPortReachableConnect(this.url.port, { host: this.url.url.hostname });
        } catch (e) {
            throw new Error('Could not reach API URL endpoint', { cause: e });
        }
        return true;
    }

    static formatPlayObj(obj: any, options: FormatPlayObjectOptions): PlayObject {
        return obj;
    }
}