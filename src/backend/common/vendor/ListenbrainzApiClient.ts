import AbstractApiClient from "./AbstractApiClient.js";
import request, {Request} from 'superagent';
import { ListenBrainzClientData } from "../infrastructure/config/client/listenbrainz.js";
import { DEFAULT_RETRY_MULTIPLIER, FormatPlayObjectOptions } from "../infrastructure/Atomic.js";
import dayjs from "dayjs";
import { stringSameness } from '@foxxmd/string-sameness';
import { combinePartsToString } from "../../utils.js";
import { PlayObject } from "../../../core/Atomic.js";
import { slice } from "../../../core/StringUtils.js";
import {
    findDelimiters,
    normalizeStr,
    parseArtistCredits,
    parseCredits,
    parseTrackCredits,
    uniqueNormalizedStrArr,
} from "../../utils/StringUtils.js";
import { UpstreamError } from "../errors/UpstreamError.js";
import { getScrobbleTsSOCDate } from "../../utils/TimeUtils.js";


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
        recording_name?: string
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
            if(status !== undefined) {
                const msgParts = [`(HTTP Status ${status})`];
                // if the response is 400 then its likely there was an issue with the data we sent rather than an error with the service
                let showStopper = status !== 400;
                if(body !== undefined) {
                    if(typeof body === 'object') {
                        if('code' in body) {
                            msgParts.push(`Code ${body.code}`);
                        }
                        if('error' in body) {
                            msgParts.push(`Error => ${body.error}`);
                        }
                        if('message' in body) {
                            msgParts.push(`Message => ${body.error}`);
                        }
                        // if('track_metadata' in body) {
                        //     msgParts.push(`Track Metadata => ${JSON.stringify(body.track_metadata)}`);
                        // }
                    } else if(typeof body === 'string') {
                        msgParts.push(`Response => ${body}`);
                    }
                } else if (text !== undefined) {
                    msgParts.push(`Response => ${text}`);
                }
                throw new UpstreamError(`Listenbrainz API Request Failed => ${msgParts.join(' | ')}`, {cause: e, showStopper});
            }
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
            throw e;
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

    getPlayingNow = async (user?: string): Promise<ListensResponse> => {
        try {

            const resp = await this.callApi(request
                .get(`${this.url}1/user/${user ?? this.config.username}/playing-now`)
                // this endpoint can take forever, sometimes, and we want to make sure we timeout in a reasonable amount of time for polling sources to continue trying to scrobble
                .timeout({
                    response: 15000, // wait 15 seconds before timeout if server doesn't response at all
                    deadline: 30000 // wait 30 seconds overall for request to complete
                }));
            const {body: {payload}} = resp as any;
            // const data = payload as ListensResponse;
            // if(data.listens.length > 0) {}
            // return data.listens[0];
            return payload as ListensResponse;
        } catch (e) {
            throw e;
        }
    }

    getRecentlyPlayed = async (maxTracks: number, user?: string): Promise<PlayObject[]> => {
        try {
            const resp = await this.getUserListens(maxTracks, user);
            const now = await this.getPlayingNow(user);
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
        const {
            data: {
                playDate,
                artists = [],
                // MB doesn't use this during submission AFAIK
                // instead it relies on (assumes??) you will submit album/release group/etc where album artist gets credit on an individual release
                albumArtists = [],
                album,
                track,
                duration,
                meta: {
                    brainz = {}
                } = {}
            }
        } = play;
        return {
            listened_at: getScrobbleTsSOCDate(play).unix(),
            track_metadata: {
                artist_name: artists[0],
                track_name: track,
                release_name: album,
                additional_info: {
                    duration: play.data.duration !== undefined ? Math.round(duration) : undefined,
                    track_mbid: brainz.track,
                    artist_mbids: brainz.artist,
                    release_mbid: brainz.album,
                    release_group_mbid: brainz.releaseGroup
                }
            }
        }
    }

    static listenResponseToPlay = (listen: ListenResponse): PlayObject => {
        const {
            listened_at,
            track_metadata: {
                track_name,
                artist_name,
                mbid_mapping: {
                    recording_name,
                    artists: artistMappings = [],
                    recording_mbid: mRecordingMbid
                } = {}
            } = {}
        } = listen;

        const naivePlay = ListenbrainzApiClient.listenResponseToNaivePlay(listen);

        if(artistMappings.length === 0) {
            // if there are no artist mappings its likely MB doesn't have info on this track so just use our internally derived attempt
            return naivePlay;
        }

        const mappedArtists = artistMappings.length > 0 ? artistMappings.map(x => x.artist_credit_name) : [];

        let normalTrackName: string = track_name;
        let primaryArtistHint: string | undefined;
        let artistsFromUserValues: string[] = [];
        let derivedArtists: string[] = [];

        let filteredSubmittedArtistName = artist_name;
        let filteredSubmittedTrackName = track_name;

        if(artistMappings.length > 0) {

            // first get mapped artists they have joiners we usually look for
            const artistsWithJoiners = artistMappings.filter(x => findDelimiters(x.artist_credit_name) !== undefined);
            if(artistsWithJoiners.length > 0) {
                // verify if these exists in our name values
                const artistsWithJoinersInArtistName = artistsWithJoiners.filter(x => filteredSubmittedArtistName.toLocaleLowerCase().includes(x.artist_credit_name.toLocaleLowerCase()));
                if(artistsWithJoinersInArtistName.length > 0) {
                    //  if they do then add them as proper artists
                    artistsFromUserValues = artistsFromUserValues.concat(artistsWithJoinersInArtistName.map(x => x.artist_credit_name));

                    // then filter these out of user-submitted artist/track names
                    // -- additionally remove joiner if mapped artists has one and it is present
                    filteredSubmittedArtistName = artistsWithJoinersInArtistName.reduce((acc, curr) => {
                        if(curr.join_phrase !== '') {
                            const joinedName = `${curr.artist_credit_name} ${curr.join_phrase}`;
                            const index = acc.toLocaleLowerCase().indexOf(joinedName.toLocaleLowerCase());
                            if(index !== -1) {
                                if(index === 0) {
                                    // primary artist, most likely
                                    primaryArtistHint = curr.artist_credit_name;
                                }
                                return slice(acc, index, joinedName.length);
                            }
                        }
                        // joiner doesn't exist or wasn't found
                        const index = acc.toLocaleLowerCase().indexOf(curr.artist_credit_name.toLocaleLowerCase());
                        if(index !== -1) {
                            if(index === 0) {
                                // primary artist, most likely
                                primaryArtistHint = curr.artist_credit_name;
                            }
                            return slice(acc, index, curr.artist_credit_name.length);
                        }
                        return acc;
                    }, filteredSubmittedArtistName);
                }

                const artistsWithJoinersInTrackName = artistsWithJoiners.filter(x => filteredSubmittedTrackName.toLocaleLowerCase().includes(x.artist_credit_name.toLocaleLowerCase()));
                if(artistsWithJoinersInTrackName.length > 0) {
                    artistsFromUserValues = artistsFromUserValues.concat(artistsWithJoinersInTrackName.map(x => x.artist_credit_name));

                    filteredSubmittedTrackName = artistsWithJoinersInTrackName.reduce((acc, curr) => {
                        if(curr.join_phrase !== '') {
                            const joinedName = `${curr.artist_credit_name} ${curr.join_phrase}`;
                            const index = acc.toLocaleLowerCase().indexOf(joinedName.toLocaleLowerCase());
                            if(index !== -1) {
                                return slice(acc, index, joinedName.length);
                            }
                        }
                        // joiner doesn't exist or wasn't found
                        const index = acc.toLocaleLowerCase().indexOf(curr.artist_credit_name.toLocaleLowerCase());
                        if(index !== -1) {
                            return slice(acc, index, curr.artist_credit_name.length);
                        }
                        return acc;
                    }, filteredSubmittedTrackName);
                }
                artistsFromUserValues = uniqueNormalizedStrArr(artistsFromUserValues);
            }

            // now we have track/artist names that don't include artists with joiners (that we know of) as part of their names
            // and an array of artists we know were in the names
            if(primaryArtistHint !== undefined) {
                // if we filtered out the primary artists (seen first in artist name value)
                // then lets make sure its first in our artists array
                artistsFromUserValues = uniqueNormalizedStrArr([primaryArtistHint].concat(artistsFromUserValues));
            }

            // now try to extract any remaining artists from filtered artist/name values
            let parsedArtists = parseArtistCredits(filteredSubmittedArtistName);
            if (parsedArtists !== undefined) {
                if (parsedArtists.primary !== undefined) {
                    artistsFromUserValues.push(parsedArtists.primary);
                }
                if(parsedArtists.secondary !== undefined) {
                    artistsFromUserValues = artistsFromUserValues.concat(parsedArtists.secondary);
                }
            }
            const parsedTrackArtists = parseTrackCredits(filteredSubmittedTrackName);
            if (parsedTrackArtists !== undefined) {
                // if we found "ft. something" in track string then we now have a "real" track name and more artists
                normalTrackName = parsedTrackArtists.primary;
                artistsFromUserValues = artistsFromUserValues.concat(parsedTrackArtists.secondary)
            }

            artistsFromUserValues = uniqueNormalizedStrArr(artistsFromUserValues);

            // at this point:
            // * the primary artist should be first in the array
            // * artists should be cleaned separated and those with proper joiners in names should be respected
            // * the artist array only contains "proper joiner artists" or artists extracted from user submitted values
            //
            // now we check that primary artist exists in mapped artists
            const candidatedPrimaryArtist = artistsFromUserValues[0];
            const normalizedCandidatePrimary = normalizeStr(candidatedPrimaryArtist);
            const primaryArtist = mappedArtists.find(x => {
                if(normalizeStr(x) === normalizedCandidatePrimary)
                {
                    return true;
                }
                // if not *exact* still return if string similarity is very close
                const results = stringSameness(normalizeStr(x), normalizedCandidatePrimary);
                if(results.highScore > 80) {
                    return true;
                }
            });
            if(primaryArtist === undefined) {
                // if we STILL can't find primary artist after all of this then its likely the mapping is incorrect
                // so return our naive play from user-submitted values only to be safe
                return naivePlay;
            }

            // now we have the primary artist matched!
            // at this point we assume any differences between user and MB artists is a data discrepancy rather than being outright wrong

            // next we match up user artists with mapped artists in order to use "more correct" spelling/punctuation/etc. from MB mapping
            const mappedUserArtists: string[] = [];
            for(const userArtist of artistsFromUserValues) {
                const normalizedUserArtist = normalizeStr(userArtist)
                const matchedArtist = mappedArtists.find(x => {
                    if(normalizeStr(x) === normalizedUserArtist)
                    {
                        return true;
                    }
                    // if not *exact* still return if string similarity is very close
                    const results = stringSameness(normalizeStr(x), normalizedUserArtist);
                    // can be a little more lenient since we are confident on primary artist already
                    if(results.highScore > 75) {
                        return true;
                    }
                });
                if(matchedArtist !== undefined) {
                    derivedArtists.push(matchedArtist);
                    mappedUserArtists.push(userArtist);
                }
            }
            // now we can add any remainders from user/mb artists
            const remainingUserArtists = artistsFromUserValues.filter(x => !mappedUserArtists.includes(x));
            const remainingMappedArtists = artistMappings.filter(x => !derivedArtists.includes(x.artist_credit_name));
            if(remainingUserArtists.length > 0) {
                derivedArtists = derivedArtists.concat(remainingUserArtists);
            }
            if(remainingMappedArtists.length > 0) {
                derivedArtists = derivedArtists.concat(remainingMappedArtists.map(x => x.artist_credit_name));
            }

            derivedArtists = uniqueNormalizedStrArr(derivedArtists);
        }


        // if we've made it this far then there are mapped artists and we have confirmed a primary artist derived from user values matches a mapped one
        // now we do a sanity check on track name and then adjust if mapped name is slightly different

        if (recording_name !== undefined) {
            // user value track name should be extracted (should not have artists in it anymore)
            // MB name and user name should *either* have at least one include the other
            // or they should have high similarity
            const mutuallyIncludes = normalizeStr(normalTrackName).includes(normalizeStr(recording_name)) || normalizeStr(recording_name).includes(normalizeStr(normalTrackName));
            const samenessResults = stringSameness(normalizeStr(normalTrackName), normalizeStr(recording_name));
            const similar = samenessResults.highScore > 70;
            if(!mutuallyIncludes && !similar) {
                // something went terrible wrong and this should not happen
                // fallback to naive but with good artists?
                return {
                    ...naivePlay,
                    data: {
                        ...naivePlay.data,
                        artists: derivedArtists
                    }
                };
            }

            // defer to MB name
            normalTrackName = recording_name;
        }

        return {
            data: {
                ...naivePlay.data,
                track: normalTrackName,
                artists: derivedArtists,
            },
            meta: naivePlay.meta
        }
    }

    /**
     * Try to parse true artists and track name without using MB information
     * */
    static listenResponseToNaivePlay = (listen: ListenResponse): PlayObject => {
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
                    music_service_name,
                    music_service,
                    submission_client,
                    submission_client_version
                } = {},
                mbid_mapping: {
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

        let normalTrackName = track_name;
        let artists: string[] = [artist_name];

        // since we aren't using MB mappings we should be conservative and assume artist string with & are proper names (not joiner)
        const parsedArtists = parseCredits(artist_name, [',', '/', '\\']);
        if (parsedArtists !== undefined) {
            if (parsedArtists.primary !== undefined) {
                artists.push(parsedArtists.primary);
            }
            artists = artists.concat(parsedArtists.secondary);
        }
        // use all delimiters when trying to find artists in track name
        const parsedTrackArtists = parseCredits(track_name);
        if (parsedTrackArtists !== undefined) {
            // if we found "ft. something" in track string then we now have a "real" track name and more artists
            normalTrackName = parsedTrackArtists.primary;
            artists = artists.concat(parsedTrackArtists.secondary)
        }
        artists = uniqueNormalizedStrArr(artists);

        return {
            data: {
                playDate: dayjs.unix(listened_at),
                track: normalTrackName,
                artists: artists,
                album: release_name,
                duration: dur
            },
            meta: {
                source: 'listenbrainz',
                trackId,
                playId,
                deviceId: combinePartsToString([music_service_name ?? music_service, submission_client, submission_client_version])
            }
        }
    }

    static formatPlayObj = (obj: any, options: FormatPlayObjectOptions): PlayObject => {
        return ListenbrainzApiClient.listenResponseToPlay(obj);
    }
}
