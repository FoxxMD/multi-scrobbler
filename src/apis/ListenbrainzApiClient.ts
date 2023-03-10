import AbstractApiClient from "./AbstractApiClient.js";
import request, {Request} from 'superagent';
import {ListenBrainzClientData} from "../common/infrastructure/config/client/listenbrainz.js";
import {FormatPlayObjectOptions, PlayObject} from "../common/infrastructure/Atomic.js";
import dayjs from "dayjs";


export interface ArtistMBIDMapping {
    artist_credit_name: string
    artist_mbid: string
    join_phrase: string
}

export interface MinimumTrack {
    artist_name: string;
    track_name: string;
    release_name?: string;
}

export interface AdditionalTrackInfo {
    artist_mbids?: string[]
    release_mbid?: string
    release_group_mbid?: string
    recording_mbid?: string
    submission_client?: string
    submission_client_version?: string
    spotify_id?: string
    media_player?: string
    media_player_version?: string

    music_service?: string
    music_service_name?: string
    origin_url?: string
    tags?: string[]
    duration?: number

    duration_ms?: number
    track_mbid?: string
    work_mbids?: string[]
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

export interface AdditionalTrackInfoResponse extends AdditionalTrackInfo {
    recording_msid?: string
}

export interface TrackPayload extends MinimumTrack {
    additional_info?: AdditionalTrackInfo
}

export interface ListenPayload {
    listened_at: Date | number;
    recording_msid?: string;
    track_metadata: TrackPayload;
}

export interface SubmitPayload {
    listen_type: 'single',
    payload: [ListenPayload]
}

export interface TrackResponse extends MinimumTrack {
    duration: number
    additional_info: AdditionalTrackInfoResponse
    mbid_mapping: {
        artist_mbids?: string[]
        artists?: ArtistMBIDMapping[]
        caa_id?: number
        caa_release_mbid?: string
        recording_mbid?: string
        release_mbid?: string
    }
}

export interface ListensResponse {
    count: number;
    listens: ListenResponse[];
}

export interface ListenResponse {

    inserted_at: number
    listened_at: number;
    recording_msid?: string;
    track_metadata: TrackResponse;
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

    getUserListens = async (maxTracks: number, user?: string): Promise<ListensResponse> => {
        try {

            const resp = await this.callApi(request
                .get(`${this.url}1/user/${user ?? this.config.username}/listens`)
                // this endpoint can take forever, sometimes, and we want to make sure we timeout in a reasonable amount of time for polling sources to continue trying to scrobble
                .timeout({
                    response: 15000, // wait 15 seconds before timeout if server doesn't response at all
                    deadline: 30000 // wait 30 seconds overall for request to complete
                })
                .query({
                    count: maxTracks
                }));
            const {body: {payload}} = resp as any;
            return payload as ListensResponse;
        } catch (e) {
            throw e;
        }
    }

    getRecentlyPlayed = async (maxTracks: number, user?: string): Promise<PlayObject[]> => {
        try {
            const resp = await this.getUserListens(maxTracks, user);
            return resp.listens.map(x => ListenbrainzApiClient.listenResponseToPlay(x));
        } catch (e) {
            this.logger.error(`Error encountered while getting User listens | Error =>  ${e.message}`);
            return [];
        }
    }

    submitListen = async (play: PlayObject) => {
        try {
            const listenPayload: SubmitPayload = {listen_type: 'single', payload: [ListenbrainzApiClient.playToListenPayload(play)]};
            await this.callApi(request.post(`${this.url}1/submit-listens`).type('json').send(listenPayload));
            return listenPayload;
        } catch (e) {
            throw e;
        }
    }

    static playToListenPayload = (play: PlayObject): ListenPayload => {
        return {
            listened_at: (play.data.playDate ?? dayjs()).unix(),
            track_metadata: {
                artist_name: play.data.artists[0],
                track_name: play.data.track,
                additional_info: {
                    duration: play.data.duration !== undefined ? Math.round(play.data.duration) : undefined
                }
            }
        }
    }

    static listenResponseToPlay = (listen: ListenResponse): PlayObject => {
        const {
            listened_at,
            recording_msid,
            track_metadata: {
                track_name,
                artist_name,
                release_name,
                duration,
                additional_info: {
                    recording_msid: aRecordingMsid,
                    recording_mbid: aRecordingMbid,
                    duration: aDuration,
                    duration_ms: aDurationMs,
                } = {},
                mbid_mapping: {
                    artists: artistMappings = [],
                    recording_mbid: mRecordingMbid
                } = {}
            } = {}
        } = listen;

        const playId = recording_msid ?? aRecordingMsid;
        const trackId = aRecordingMbid ?? mRecordingMbid;
        let dur = duration ?? aDuration;
        if (dur === undefined && aDurationMs !== undefined) {
            dur = Math.round(aDurationMs / 1000);
        }

        let artists: string[] = [artist_name];
        if (artistMappings.length > 0) {
            const secondaryArtists = artistMappings.filter(x => x.artist_credit_name !== artist_name);
            artists = artists.concat(secondaryArtists.map(x => x.artist_credit_name));
        }

        return {
            data: {
                playDate: dayjs.unix(listened_at),
                track: track_name,
                artists: artists,
                album: release_name,
                duration: dur
            },
            meta: {
                source: 'listenbrainz',
                trackId,
                playId
            }
        }
    }

    static formatPlayObj = (obj: any, options: FormatPlayObjectOptions): PlayObject => {
        return ListenbrainzApiClient.listenResponseToPlay(obj);
    }
}
