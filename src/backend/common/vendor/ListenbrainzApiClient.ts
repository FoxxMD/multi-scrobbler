import { stringSameness } from '@foxxmd/string-sameness';
import dayjs from "dayjs";
import request, { Request, Response } from 'superagent';
import { BrainzMeta, PlayObject, PlayObjectLifecycleless, ScrobbleActionResult, UnixTimestamp, URLData } from "../../../core/Atomic.js";
import { combinePartsToString, slice } from "../../../core/StringUtils.js";
import {
    findDelimiters,
    normalizeListenbrainzUrl,
    normalizeStr,
    parseArtistCredits,
    parseCredits,
    parseTrackCredits,
    uniqueNormalizedStrArr,
} from "../../utils/StringUtils.js";
import { getScrobbleTsSOCDate } from "../../utils/TimeUtils.js";
import { UpstreamError } from "../errors/UpstreamError.js";
import { AbstractApiOptions, DEFAULT_RETRY_MULTIPLIER, DELIMITERS, FormatPlayObjectOptions, PagelessListensTimeRangeOptions, PagelessTimeRangeListens, PagelessTimeRangeListensResult } from "../infrastructure/Atomic.js";
import { DEFAULT_ITEMS_PER_GET_LZ, ListenBrainzClientData, MAX_ITEMS_PER_GET_LZ } from "../infrastructure/config/client/listenbrainz.js";
import AbstractApiClient from "./AbstractApiClient.js";
import { getBaseFromUrl, isPortReachableConnect, joinedUrl, normalizeWebAddress } from '../../utils/NetworkUtils.js';
import { isEmptyArrayOrUndefined, removeUndefinedKeys, unique } from '../../utils.js';
import { version } from '../../ioc.js';
import { ListenPayload, ListenResponse, ListenType, MinimumTrack, SubmitListenAdditionalTrackInfo, SubmitPayload } from './listenbrainz/interfaces.js';
import { baseFormatPlayObj } from '../../utils/PlayTransformUtils.js';
import { ScrobbleSubmitError } from '../errors/MSErrors.js';

interface SubmitOptions {
    log?: boolean
    listenType?: ListenType
}

export interface ListensResponse {
    count: number;
    listens: ListenResponse[];
    latest_listen_ts: number;
    oldest_listen_ts: number;
}

export interface UserListensOptions {
    /** unix epoch timestamp, listens with listened_at less than (but not including) this value will be returned. */
    max_ts?: UnixTimestamp
    /** unix epoch timestamp, listens with listened_at greater than (but not including) this value will be returned. */
    min_ts?: UnixTimestamp
    /** number of listens to return. Max is `MAX_ITEMS_PER_GET_LZ`
     * 
     * @default 25
     */
    count?: number
}

export class ListenbrainzApiClient extends AbstractApiClient implements PagelessTimeRangeListens {

    declare config: ListenBrainzClientData;
    url: URLData;

    constructor(name: any, config: ListenBrainzClientData, options: AbstractApiOptions) {
        super('ListenBrainz', name, config, options);
        const {
            url = 'https://api.listenbrainz.org/'
        } = config;
        let cleanUrl = url;
        const pathedUrl = normalizeListenbrainzUrl(cleanUrl);
        if(pathedUrl !== undefined) {
            this.logger.verbose(`LZ Server URL contained /1/, removing this because MS adds it automatically`);
            cleanUrl = pathedUrl;
        }
        this.url = normalizeWebAddress(cleanUrl);

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
            if(status !== undefined) {
                const msgParts = [`(HTTP Status ${status})`];
                // if the response is 400 then its likely there was an issue with the data we sent rather than an error with the service
                const showStopper = status !== 400;
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
            await isPortReachableConnect(this.url.port, {host: this.url.url.hostname});
            return true;
        } catch (e) {
            if(e.status === 410 || e.message.includes('HTTP Status 410')) {
                return true;
            }
            throw e;
        }
    }

    testAuth = async () => {
        try {
            const resp = await this.callApi(request.get(`${joinedUrl(this.url.url,'1/validate-token')}`));
            return true;
        } catch (e) {
            throw e;
        }
    }

    async checkKoito(): Promise<boolean> {
        try {
            const resp = await this.callApi(request.get(`${joinedUrl(getBaseFromUrl(this.url.url), 'apis/web/v1/stats')}`));
            return true;
        } catch (e) {
            return false;
        }
    }

    getUserListens = async (maxTracks: number, user?: string): Promise<ListensResponse> => {
        try {

            const resp = await this.callApi(request
                .get(`${joinedUrl(this.url.url,'1/user',user ?? this.config.username, 'listens')}`)
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
                .get(`${joinedUrl(this.url.url,'1/user',user ?? this.config.username, 'playing-now')}`)
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
            return resp.listens.map(x => listenResponseToPlay(x));
        } catch (e) {
            this.logger.error(`Error encountered while getting User listens | Error =>  ${e.message}`);
            return [];
        }
    }


    submitListen = async (play: PlayObject, options: SubmitOptions = {}): Promise<ScrobbleActionResult> => {
        const listenPayload = playToSubmitPayload(play, {listenType: options.listenType});
        const { log = false} = options;
        try {
            if(log) {
                this.logger.debug(`Submit Payload: ${JSON.stringify(listenPayload)}`);
            }
            // response consists of {"status": "ok"}
            // so no useful information
            // https://listenbrainz.readthedocs.io/en/latest/users/api-usage.html#submitting-listens
            // TODO may we should make a call to recent-listens to get the parsed scrobble?
            const resp = await this.callApi(request.post(`${joinedUrl(this.url.url,'1/submit-listens')}`).type('json').send(listenPayload));
            if(log) {
                this.logger.debug(`Submit Response: ${resp.text}`)
            }
            return {payload: listenPayload, response: resp.text};
        } catch (e) {
            throw new ScrobbleSubmitError(`Failed to submit to Listenbrainz (listen_type ${listenPayload.listen_type})`, {cause: e, payload: listenPayload, response: e.response, responseBody: e.response?.text});
        }
    }

    static submitToPlayObj(submitObj: SubmitPayload, playObj: PlayObject): PlayObject {
        if (submitObj.payload.length > 0) {
            const respPlay = {
                ...playObj,
            };
            respPlay.data = {
                ...playObj.data,
                album: submitObj.payload[0].track_metadata?.release_name ?? playObj.data.album,
                track: submitObj.payload[0].track_metadata?.track_name ?? playObj.data.album,
            };
            return respPlay;
        }
        return playObj;
    }

    getUserListensWithPagination = async (options: UserListensOptions & {user?: string} = {}): Promise<ListensResponse> => {
        const { count = 100, user } = options;

        try {
            /** https://rain0r.github.io/listenbrainz-openapi/#/lbCore/listensForUser
             *  https://listenbrainz.readthedocs.io/en/latest/users/api/core.html#get--1-user-(mb_username-user_name)-listens
             */
            const resp = await this.callApi(request
                .get(`${joinedUrl(this.url.url,'1/user', user ?? this.config.username, 'listens')}`)
                .timeout({
                    response: 15000,
                    deadline: 30000
                })
                .query({...options, count: Math.min(count, DEFAULT_ITEMS_PER_GET_LZ)}));

            const {body: {payload}} = resp as any;
            return payload as ListensResponse;
        } catch (e) {
            throw e;
        }
    }

    getPagelessTimeRangeListens = async (options: PagelessListensTimeRangeOptions & {user?: string} = {}): Promise<PagelessTimeRangeListensResult> => {
        const { limit = 100, to, from, user } = options;

        const lzListensOptions: UserListensOptions = {
            count: Math.min(limit, MAX_ITEMS_PER_GET_LZ),
        };

        try {
            if (from !== undefined) {
                lzListensOptions.min_ts = from;
            }
            if (to !== undefined) {
                lzListensOptions.max_ts = to;
            }

            /** https://rain0r.github.io/listenbrainz-openapi/#/lbCore/listensForUser
             *  https://listenbrainz.readthedocs.io/en/latest/users/api/core.html#get--1-user-(mb_username-user_name)-listens
             */
            const resp = await this.callApi(request
                .get(`${joinedUrl(this.url.url,'1/user', user ?? this.config.username, 'listens')}`)
                .timeout({
                    response: 15000,
                    deadline: 30000
                })
                .query(lzListensOptions));

            const {body: {payload}} = resp as any;
            const lr = payload as ListensResponse;
            const more = to > lr.latest_listen_ts;
            return {data: lr.listens.map(x => listenResponseToPlay(x)), meta: {...options, total: lr.count, more}};
        } catch (e) {
            throw e;
        }
    }

    getPaginatedUnitOfTime(): dayjs.ManipulateType {
        return 'second';
    }


    static formatPlayObj(obj: any, options: FormatPlayObjectOptions): PlayObject {
        return listenResponseToPlay(obj);
    }
}

export const listenPayloadToPlay = (payload: ListenPayload, nowPlaying: boolean = false): PlayObject => {

        const listened = payload.listened_at ?? dayjs().unix();
        const listenedAt = typeof listened === 'number' ? dayjs.unix(listened) : dayjs(listened);

        const {
            track_metadata: {
                additional_info = {}
            } = {},
        } = payload;

        const play = listenResponseToPlay({
            ...payload, 
            track_metadata: {
                ...payload.track_metadata, 
                additional_info,
            }, 
            listened_at: listenedAt.unix()
        });

        play.meta.nowPlaying = nowPlaying;

        return play;
    }

export const listenResponseToPlay = (listen: ListenResponse): PlayObject => {
        const {
            listened_at,
            track_metadata: {
                track_name,
                artist_name,
                mbid_mapping: {
                    recording_name,
                    artists: artistMappings = [],
                    recording_mbid: mRecordingMbid,
                    release_mbid
                } = {},
                additional_info: {
                    release_artist_names = [],
                    release_group_mbid
                } = {}
            } = {}
        } = listen;

        const naivePlay = listenToNaivePlay(listen);

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

        let primaryArtist;

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
            const splitAmpersand = artistsWithJoiners.length === 0 && artistMappings.some(x => x.join_phrase.includes('&'));
            let nonProperJoinedDelims = undefined;
            if(artistsWithJoiners.length === 0) {
                nonProperJoinedDelims = unique(artistMappings.filter(x => DELIMITERS.includes(x.join_phrase.trim())).map(x => x.join_phrase.trim()));
                if(nonProperJoinedDelims.length === 0) {
                    nonProperJoinedDelims = undefined;
                }
            }
            const parsedArtists = parseArtistCredits(filteredSubmittedArtistName, nonProperJoinedDelims);
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
            primaryArtist = mappedArtists.find(x => {
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

            /*
            *
            * Can safely use musicbrainz metadata beyond this point!
            *
            */

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

        const brainzMetaRaw: BrainzMeta = {
            ...(naivePlay.data.meta.brainz ?? {}),
            artist: artistMappings.map(x => x.artist_mbid),
            album: release_mbid,
            releaseGroup: release_group_mbid
        }

        // this should always find an artist but to be safe...
        const primaryArtistMBMapping = artistMappings.find(x => x.artist_credit_name === primaryArtist);
        if(primaryArtistMBMapping !== undefined) {
            // only include as primary if musicbrainz does not disagree with us
            if(release_artist_names.length === 0 || (release_artist_names.length > 0 && release_artist_names.includes(primaryArtist))) {
                brainzMetaRaw.albumArtist = [primaryArtistMBMapping.artist_mbid];
            }
        }

        const brainzMeta = removeUndefinedKeys(brainzMetaRaw);

        const play: PlayObject = {
            data: {
                ...naivePlay.data,
                track: normalTrackName,
                artists: derivedArtists
            },
            meta: naivePlay.meta
        }

        if(brainzMeta !== undefined) {
            play.data.meta = {
                brainz: brainzMeta
            }
        }

        return baseFormatPlayObj(listen, play);
    }

/**
 * Try to parse true artists and track name without using MB information
 * */
export const listenToNaivePlay = (listen: ListenResponse): PlayObject => {
        const {
            listened_at,
            recording_msid,
            track_metadata: {
                track_name,
                artist_name,
                release_name,
                additional_info: {
                    recording_msid: aRecordingMsid,
                    recording_mbid: aRecordingMbid,
                    release_artist_name,
                    release_artist_names = [],
                    release_group_mbid,
                    release_mbid,
                    artist_mbids = [],
                    duration: aDuration,
                    duration_ms: aDurationMs,
                    music_service_name,
                    music_service,
                    submission_client,
                    submission_client_version,
                    artist_names = [],
                    isrc,
                    tracknumber
                } = {},
                mbid_mapping: {
                    recording_mbid: mRecordingMbid
                } = {},
                additional_info = {},
            } = {}
        } = listen;

        const playId = recording_msid ?? aRecordingMsid;
        const trackId = aRecordingMbid ?? mRecordingMbid;
        let dur = aDuration;
        if (dur === undefined && aDurationMs !== undefined) {
            dur = Math.round(aDurationMs / 1000);
        }

        let normalTrackName = track_name;
        let artists: string[] = [];

        if(artist_names.length > 0) {
            artists = artist_names;
        } else {
            artists = [artist_name];

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
        }

        let albumArtists: string[];
        if(release_artist_name !== undefined) {
            albumArtists = [release_artist_name];
        }
        if(release_artist_names.length > 0) {
            albumArtists = unique([...(albumArtists ?? []), ...release_artist_names])
        }


        const play: PlayObjectLifecycleless = {
            data: {
                playDate: dayjs.unix(listened_at),
                track: normalTrackName,
                artists: artists,
                album: release_name,
                albumArtists,
                duration: dur,
                isrc: isrc !== undefined ? isrc : undefined,
                meta: {
                }
            },
            meta: {
                source: submission_client ?? 'listenbrainz',
                playId,
                deviceId: combinePartsToString([music_service_name ?? music_service, submission_client, submission_client_version])
            }
        }

        if(trackId !== undefined) {
            play.meta.trackid = trackId;
        }

        const brainzMeta = removeUndefinedKeys<BrainzMeta>({
            album: release_mbid,
            releaseGroup: release_group_mbid,
            recording: trackId,
            trackNumber: tracknumber
        }) ?? {};

        if(Object.keys(additional_info).length > 0) {
            brainzMeta.additionalInfo = additional_info;
            
        }
        if(artist_mbids.filter(x => x.trim() !== "").length > 0) {
            brainzMeta.artist = artist_mbids.filter(x => x.trim() !== "");
            brainzMeta.additionalInfo.artist_mbids = brainzMeta.artist;
        }

        if(Object.keys(brainzMeta).length > 0) {
            play.data.meta = {
                brainz: brainzMeta
            }
        }

        return baseFormatPlayObj(listen, play);
    }


export const playToListenPayload = (play: PlayObject): ListenPayload => {
        const {
            data: {
                playDate,
                artists = [],
                // MB doesn't use this during submission AFAIK
                // instead it relies on (assumes??) you will submit album/release group/etc where album artist gets credit on an individual release
                albumArtists = [],
                album,
                track,
                isrc,
                duration,
                meta: {
                    brainz = {},
                    spotify = {},
                } = {}
            },
            meta: {
                mediaPlayerName,
                mediaPlayerVersion,
                musicService,
                source
            }
        } = play;
        // using submit-listens exmaple from openapi https://rain0r.github.io/listenbrainz-openapi/index.html#/lbCore/submitListens
        // which is documented in official docs https://listenbrainz.readthedocs.io/en/latest/users/api/index.html#openapi-specification
        // and based on this LZ developer comment https://github.com/lyarenei/jellyfin-plugin-listenbrainz/issues/10#issuecomment-1253867941

        const msAdditionalInfo = brainz.additionalInfo ?? {};

        let addInfo: SubmitListenAdditionalTrackInfo = {
            // primary artists
            artist_names: Array.from(new Set([...artists])),
            // primary artist
            release_artist_name: albumArtists.length === 1  ? albumArtists[0] : undefined,
            release_artist_names: albumArtists.length > 0 ? albumArtists : undefined,
            // use data from LZ response, if this Play was originally from LZ Source
            media_player: mediaPlayerName ?? msAdditionalInfo.media_player,
            media_player_version: mediaPlayerVersion ?? msAdditionalInfo.media_player_version,
            music_service: musicService !== undefined ? musicServiceToCononical(musicService) : msAdditionalInfo.music_service,
            music_service_name: musicService ?? source ?? msAdditionalInfo.music_service_name,
            spotify_id: msAdditionalInfo.spotify_id,
            spotify_album_id: msAdditionalInfo.spotify_album_id,
            spotify_artist_ids: msAdditionalInfo.spotify_artist_ids,
            origin_url: msAdditionalInfo.origin_url,
            isrc: isrc ?? msAdditionalInfo.isrc,
            tracknumber: brainz.trackNumber ?? msAdditionalInfo.tracknumber
        };

        if(Object.keys(spotify).length > 0) {
            if(spotify.track !== undefined) {
                const trackUrl = `https://open.spotify.com/track/${spotify.track}`;
                if(addInfo.origin_url === undefined) {
                    addInfo.origin_url = trackUrl;
                }
                if(addInfo.spotify_id === undefined) {
                    addInfo.spotify_id = trackUrl;
                }
            }
            if(isEmptyArrayOrUndefined(addInfo.spotify_artist_ids) && !isEmptyArrayOrUndefined(spotify.artist)) {
                addInfo.spotify_artist_ids = spotify.artist.map(x => `https://open.spotify.com/artist/${x}`)
            }
            if(isEmptyArrayOrUndefined(addInfo.spotify_album_artist_ids) && !isEmptyArrayOrUndefined(spotify.albumArtist)) {
                addInfo.spotify_album_artist_ids = spotify.albumArtist.map(x => `https://open.spotify.com/artist/${x}`)
            }
            if(addInfo.spotify_album_id === undefined && spotify.album !== undefined) {
                addInfo.spotify_album_id = `https://open.spotify.com/album/${spotify.album}`
            }
        }

        addInfo = removeUndefinedKeys(addInfo)

        // possible lastfm provides an empty album field when no album data is found
        let al = album;
        if(al !== undefined && al !== null) {
            if(al.trim() === '') {
                al = undefined;
            }
        }

        const minTrackData = removeUndefinedKeys<MinimumTrack>({
                artist_name: Array.from(new Set([...artists])).join(', '),
                track_name: track,
                release_name: al,
        });

        return {
            listened_at: getScrobbleTsSOCDate(play).unix(),
            track_metadata: {
                ...minTrackData,
                additional_info: {
                    duration: play.data.duration !== undefined ? Math.round(duration) : undefined,
                    track_mbid: brainz.track,
                    recording_mbid: brainz.recording,
                    artist_mbids: brainz.artist,
                    release_mbid: brainz.album,
                    release_group_mbid: brainz.releaseGroup,
                    submission_client: 'multi-scrobbler',
                    submission_client_version: version,
                    ...addInfo
                }
            }
        }
    }

const musicServices = {
    spotify: 'spotify.com',
    bandcamp: 'bandcamp.com',
    ['youtube music']: 'music.youtube.com',
    youtube: 'youtube.com',
    deezer: 'deezer.com',
    tidal: 'tidal.com',
    apple: 'music.apple.com',
    archive: 'archive.org',
    soundcloud: 'soundcloud.com',
    jamendo: 'jamendo.com',
    play: 'play.google.com'
}
/**
 *  Converts MS musicService to LZ cononical Music Service Name, if one exists 
 * @see https://listenbrainz.readthedocs.io/en/latest/users/json.html#payload-json-details
 * */
export const musicServiceToCononical = (str?: string): string | undefined => {
    if(str === undefined) {
        return undefined;
    }
    const lower = str.trim().toLocaleLowerCase();
    for(const [k, v] of Object.entries(musicServices)) {
        if(lower.includes(k)) {
            return v;
        }
    }
    return undefined;
}

/**
 *  Returns a known music service based on the given URL 
 * @see https://listenbrainz.readthedocs.io/en/latest/users/json.html#payload-json-details
 * */
export const urlToMusicService = (url?: string): string | undefined => {
    if(url === undefined) {
        return undefined;
    }
    const lower = url.trim().toLocaleLowerCase();
    for(const [k, v] of Object.entries(musicServices)) {
        if(url.includes(v)) {
            return k;
        }
    }
    return undefined;
}

export const playToSubmitPayload = (play: PlayObject, options: SubmitOptions = {}): SubmitPayload => {
    const { listenType = 'single'} = options;  
    const listenPayload: SubmitPayload = {listen_type: listenType, payload: [playToListenPayload(play)]};
    if(listenType === 'playing_now') {
        delete listenPayload.payload[0].listened_at;
    }
    return listenPayload;
}