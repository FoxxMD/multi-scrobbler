import AbstractApiClient from "./AbstractApiClient.js";
import request, {Request} from 'superagent';
import {ListenBrainzClientData} from "../common/infrastructure/config/client/listenbrainz.js";
import {PlayObject} from "../common/infrastructure/Atomic.js";
import dayjs from "dayjs";

export interface ListenPayload {
    count: number;
    listens: Listen[];
}

export interface Track {
    artist_name: string;
    track_name: string;
    release_name?: string;
    artist_mbids?: string[];
    artist_msid?: string;
    recording_mbid?: string;
    release_mbid?: string;
    release_msid?: string;
    tags?: string[];

    duration?: number
}

export interface Listen {
    listened_at: Date | number;
    recording_msid?: string;
    track_metadata: Track;
}

export class ListenbrainzApiClient extends AbstractApiClient {

    declare config: ListenBrainzClientData;
    url: string;

    constructor(name: any, config: ListenBrainzClientData, options = {}) {
        super('ListenBrainz', name, config, options);
        const {
            url = 'https://api.listenbrainz.org/'
        } = config;
        this.url = url;
    }


    callApi = async <T>(req: Request, retries = 0): Promise<T> => {
        const {
            maxRequestRetries = 2,
            retryMultiplier = 1.5
        } = this.config;

        try {
            req.set('Authorization', `Token ${this.config.token}`);
            return await req as T;
        } catch (e) {
            const {
                message,
            } = e;
            throw e;
        }
    }

    testConnection = async () => {
        try {
            const resp = await this.callApi(request.get(this.url))
            return true;
        } catch (e) {
            if(e.status === 410) {
                return true;
            }
            return false;
        }
    }

    testAuth = async () => {
        try {
            const resp = await this.callApi(request.get(`${this.url}1/validate-token`));
            return true;
        } catch (e) {
            return false;
        }
    }

    getUserListens = async (user?: string): Promise<PlayObject[]> => {
        try {

            const resp = await this.callApi(request.get(`${this.url}1/user/${user ?? this.config.username}/listens`).query({count: 25}));
            const {body: {payload}} = resp as any;

            let response: ListenPayload = {
                count: payload.count,
                listens: payload.listens.map((i: any) => {
                    let listen: Listen = {
                        listened_at: i.listened_at,
                        recording_msid: i.recording_msid,
                        track_metadata: {
                            artist_name: i.track_metadata.artist_name,
                            track_name: i.track_metadata.track_name,
                            release_name: i.track_metadata.additional_info.release_name,
                            artist_mbids: i.track_metadata.additional_info.artist_mbids,
                            artist_msid: i.track_metadata.additional_info.artist_msid,
                            recording_mbid: i.track_metadata.additional_info.recording_mbid,
                            release_mbid: i.track_metadata.additional_info.release_mbid,
                            release_msid: i.track_metadata.additional_info.release_msid,
                            tags: i.track_metadata.additional_info.tags,
                        },
                    }
                    return listen;
                })
            }

            return response.listens.map(x => ListenbrainzApiClient.listenToPlay(x));
        } catch (e) {
            return [];
        }
    }

    submitListen = async (play: PlayObject) => {
        try {
            const listenPayload = {listen_type: 'single', payload: [ListenbrainzApiClient.playToListen(play)]};
            await this.callApi(request.post(`${this.url}1/submit-listens`).type('json').send(listenPayload));
            return listenPayload;
        } catch (e) {
            throw e;
        }
    }

    static playToListen = (play: PlayObject): Listen => {
        return {
            listened_at: (play.data.playDate ?? dayjs()).unix(),
            track_metadata: {
                artist_name: play.data.artists[0],
                track_name: play.data.track,
                duration: play.data.duration !== undefined ? Math.round(play.data.duration) : undefined
            }
        }
    }

    static listenToPlay = (listen: Listen): PlayObject => {
        const {listened_at, recording_msid, track_metadata} = listen;
        return {
            data: {
                playDate: dayjs(listened_at),
                track: track_metadata.track_name,
                artists: [track_metadata.artist_name],
                album: track_metadata.release_name,
                duration: track_metadata.duration
            },
            meta: {
                source: 'listenbrainz',
                trackId: recording_msid
            }
        }
    }
}
