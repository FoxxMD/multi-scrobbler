import dayjs from "dayjs";
import type { Request, Response } from 'superagent';
import request from 'superagent';
import type { BrainzMeta, ParseDecision, UnixTimestamp, URLData } from "../../../core/Atomic.ts";
import type { PlayObject, PlayObjectMinimal, ScrobbleActionResult } from "../../../core/PlaySchema.ts";
import { combinePartsToString } from "../../../core/StringUtils.ts";
import { isrcMeta, nameToCredit } from "../../../core/MusicMetadata.ts";
import { creditsToNames, namesToCredits } from "../../../core/MusicMetadata.ts";
import {
    normalizeListenbrainzUrl,
    parseCredits,
    uniqueNormalizedStrArr,
} from "../../utils/StringUtils.ts";
import { creditsWithIds, mbMeta, mergeCredit, withMetadata } from "../../../core/MusicMetadata.ts";
import { UpstreamError } from "../errors/UpstreamError.ts";
import { type AbstractApiOptions, DEFAULT_RETRY_MULTIPLIER, retryTiming, type FormatPlayObjectOptions, type PagelessListensTimeRangeOptions, type PagelessTimeRangeListens, type PagelessTimeRangeListensResult } from "../infrastructure/Atomic.ts";
import { DEVELOPER_CONTACT } from "../infrastructure/Atomic.ts";
import { type ListenBrainzClientData, MAX_ITEMS_PER_GET_LZ } from "../infrastructure/config/client/listenbrainz.ts";
import AbstractApiClient from "./AbstractApiClient.ts";
import { getBaseFromUrl, isPortReachableConnect, joinedUrl, normalizeWebAddress } from '../../utils/NetworkUtils.ts';
import { unique } from '../../utils.ts';
import { diffObjects, removeUndefinedKeys } from '../../../core/DataUtils.ts';
import type {ListenPayload, ListenResponse, SubmitPayload} from '../../../core/vendor/listenbrainz/interfaces.ts';
import { baseFormatPlayObj } from '../../utils/PlayTransformUtils.ts';
import { AuthError, ScrobbleSubmitError, SimpleError } from '../errors/MSErrors.ts';
import pRetry from 'p-retry';
import { findCauseByFunc } from '../../utils/ErrorUtils.ts';
import { isSuperAgentResponseError } from '../errors/ErrorUtils.ts';
import { playToSubmitPayload, type AllowDeviceList, type SubmitOptions } from './listenbrainz/lzUtils.ts';
import { isrcNoHyphens } from '../../../core/PlayUtils.ts';
import { getRoot } from '../../ioc.ts';
import { parseWithoutReference, parseWithReference, type CreditReference } from '../../utils/CreditPipeline.ts';

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

    declare config: ListenBrainzClientData & {allowDeviceList?: AllowDeviceList, includePlayPosition?: boolean};
    url: URLData;
    userAgent: string

    constructor(name: any, config: ListenBrainzClientData & {allowDeviceList?: AllowDeviceList, includePlayPosition?: boolean}, options: AbstractApiOptions) {
        super('ListenBrainz', name, config, options);
        const {
            url = 'https://api.listenbrainz.org/'
        } = config;
        let cleanUrl = url;
        this.userAgent = `multi-scrobbler/${getRoot().items.version} (${config.contact ?? DEVELOPER_CONTACT})`
        const pathedUrl = normalizeListenbrainzUrl(cleanUrl);
        if(pathedUrl !== undefined) {
            this.logger.verbose(`LZ Server URL contained /1/, removing this because MS adds it automatically`);
            cleanUrl = pathedUrl;
        }
        this.url = normalizeWebAddress(cleanUrl);

        this.logger.verbose(`Config URL: '${url ?? '(None Given)'}' => Normalized: '${this.url.url}'`)
    }

    doCallApi = async <T = Response>(req: Request, retries = 0): Promise<T> => {
        const {
            maxRequestRetries = 2,
            retryMultiplier = DEFAULT_RETRY_MULTIPLIER
        } = this.config;

        try {
            req.set('Authorization', `Token ${this.config.token}`);
            req.set('User-Agent', this.userAgent);
            return await req as T;
        } catch (e: any) {
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


    callApi = async <T = Response>(reqFunc: () => Request, opts: {retries?: number, logFailure?: boolean} = {}): Promise<T> => {
        const {
            maxRequestRetries = 2,
            retryMultiplier = DEFAULT_RETRY_MULTIPLIER
        } = this.config;

        const {
            retries = maxRequestRetries,
            logFailure = true
        } = opts;

        try {
            return await pRetry(() => this.doCallApi(reqFunc()), {
                retries: retries,
                factor: retryMultiplier,
                minTimeout: 1000 * retryTiming.scale,
                maxRetryTime: 30000,
                onFailedAttempt: (context) => {
                    if(logFailure) {
                        this.logger.warn(new SimpleError(`Request attempt ${context.attemptNumber} failed. ${context.retriesLeft} retries left`, {cause: context.error, shortStack: true}));                
                    }
                   },
                shouldRetry(context) {
                    const cause = findCauseByFunc<request.ResponseError>(context.error, (e) => isSuperAgentResponseError(e));
                    if(cause === undefined) {
                        return false;
                    }
                    if(cause.status !== undefined && [400,403,401].includes(cause.status)) {
                        return false;
                    }
                    return true;
                }
            })
        } catch (e) {
            throw e;
        }
    }

    testConnection = async () => {
        try {
            await isPortReachableConnect(this.url.port, {host: this.url.url.hostname});
            return true;
        } catch (e: any) {
            if(e.status === 410 || e.message.includes('HTTP Status 410')) {
                return true;
            }
            throw e;
        }
    }

    testAuth = async () => {
        try {
            const resp = await this.callApi(() => request.get(`${joinedUrl(this.url.url,'1/validate-token')}`));
            return true;
        } catch (err) {
            const cause = findCauseByFunc<request.ResponseError>(err, (e) => isSuperAgentResponseError(e));
            if(cause?.status !== undefined && [401,403,400].includes(cause.status)) {
                throw new AuthError('Failed to validate token', {cause: err, unrecoverable: true});
            }
            throw new AuthError('Failed to validate token due to non-auth error', {cause: err, unrecoverable: false});
        }
    }

    async checkKoito(): Promise<boolean> {
        try {
            const resp = await this.callApi(() => request.get(`${joinedUrl(getBaseFromUrl(this.url.url), 'apis/web/v1/stats')}`), {retries: 0, logFailure: false});
            return true;
        } catch (e) {
            return false;
        }
    }

    getPlayingNow = async (user?: string): Promise<ListensResponse> => {
        try {

            const resp = await this.callApi(() => request
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

    submitListen = async (play: PlayObject, options: SubmitOptions = {}): Promise<ScrobbleActionResult> => {
        const listenPayload = playToSubmitPayload(play, {
            listenType: options.listenType,
            allowDeviceList: options.allowDeviceList ?? this.config.allowDeviceList,
            includePlayPosition: options.listenType === 'playing_now' && (options.includePlayPosition ?? this.config.includePlayPosition)
        });
        const { log = false} = options;
        try {
            if(log) {
                this.logger.debug(`Submit Payload: ${JSON.stringify(listenPayload)}`);
            }
            // response consists of {"status": "ok"}
            // so no useful information
            // https://listenbrainz.readthedocs.io/en/latest/users/api-usage.html#submitting-listens
            // TODO may we should make a call to recent-listens to get the parsed scrobble?
            const resp = await this.callApi(() => request.post(`${joinedUrl(this.url.url,'1/submit-listens')}`).type('json').send(listenPayload));
            if(log) {
                this.logger.debug(`Submit Response: ${resp.text}`)
            }
            return {payload: listenPayload, response: resp.text, createdAt: dayjs().toISOString()};
        } catch (e: any) {
            throw new ScrobbleSubmitError(`Failed to submit to Listenbrainz (listen_type ${listenPayload.listen_type})`, {cause: e, payload: listenPayload, response: e.response, responseBody: e.response?.text});
        }
    }

    static submitToPlayObj(submitObj: SubmitPayload, playObj: PlayObject): PlayObject {
        if (submitObj.payload.length > 0) {
            const respPlay = {
                ...playObj,
            };
            const {release_name, track_name} = submitObj.payload[0].track_metadata ?? {};
            respPlay.data = {
                ...playObj.data,
                album: release_name !== undefined ? mergeCredit(playObj.data.album, nameToCredit(release_name)) : playObj.data.album,
                track: track_name !== undefined ? mergeCredit(playObj.data.track, nameToCredit(track_name)) : playObj.data.track,
            };
            return respPlay;
        }
        return playObj;
    }

    getUserListens = async (options: UserListensOptions & {user?: string} = {}): Promise<ListensResponse> => {
        const { user } = options;
        try {
            /** https://rain0r.github.io/listenbrainz-openapi/#/lbCore/listensForUser
             *  https://listenbrainz.readthedocs.io/en/latest/users/api/core.html#get--1-user-(mb_username-user_name)-listens
             */
            const resp = await this.callApi(() => request
                .get(`${joinedUrl(this.url.url,'1/user',user ?? this.config.username, 'listens')}`)
                // this endpoint can take forever, sometimes, and we want to make sure we timeout in a reasonable amount of time for polling sources to continue trying to scrobble
                .timeout({
                    response: 15000, // wait 15 seconds before timeout if server doesn't respond at all
                    deadline: 30000 // wait 30 seconds overall for request to complete
                })
                .query(options));
            const {body: {payload}} = resp as any;
            return payload as ListensResponse;
        } catch (e) {
            throw new UpstreamError('Getting user listens failed', {cause: e});
        }
    }

    getPagelessTimeRangeListens = async (options: PagelessListensTimeRangeOptions & {user?: string} = {}): Promise<PagelessTimeRangeListensResult> => {
        const { limit = 100, to, from, user } = options;

        const lzListensOptions: UserListensOptions = {
            count: Math.min(limit, MAX_ITEMS_PER_GET_LZ),
        };

        if (from !== undefined) {
            lzListensOptions.min_ts = from;
        }
        if (to !== undefined) {
            lzListensOptions.max_ts = to;
        }

        try {
            const lr = await this.getUserListens({...lzListensOptions, user});
            const more = lr.count > 0 && lr.count === lzListensOptions.count;
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

export interface ListenPayloadParseOptions {
    extractArtists?: boolean
    nowPlaying?: boolean
}

export const listenPayloadToPlay = (payload: ListenPayload, opts: ListenPayloadParseOptions = {}): PlayObject => {

        const {
            nowPlaying = false
        } = opts;
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
        }, opts);

        play.meta.nowPlaying = nowPlaying;

        return play;
    }

export const listenResponseToPlay = (listen: ListenResponse, opts?: ListenPayloadParseOptions): PlayObject => {
        const {
            listened_at,
            track_metadata: {
                track_name,
                artist_name,
                mbid_mapping: {
                    recording_name,
                    artists: artistMappings = [],
                    recording_mbid: mRecordingMbid,
                    release_mbid,
                    release_group_mbid: mReleaseGroupMbid
                } = {},
                additional_info: {
                    release_artist_names = [],
                    release_group_mbid: aReleaseGroupMbid
                } = {}
            } = {}
        } = listen;

        // mapped release mbid replaces the user's so prefer the mapped release group to keep them paired
        const release_group_mbid = mReleaseGroupMbid ?? aReleaseGroupMbid;

        const {play: naivePlay, decisions: naiveDecisions} = listenToNaivePlayWithDecisions(listen, opts);
        // as submitted, so users can see exactly what parsing changed
        // names only: ids/metadata (MBIDs, ISRC) are attached to nearly every play and would hide what parsing actually changed
        const submitted = {track: track_name, artists: artist_name !== undefined ? [artist_name] : []};
        const withParse = (p: PlayObject, decisions: ParseDecision[]): PlayObject => {
            const patch = diffObjects(submitted, {track: p.data.track?.name, artists: creditsToNames(p.data.artists ?? [])});
            // new meta object so the record is not copied into original.play
            return {...p, meta: {...p.meta, parseRecord: {parser: 'listenbrainz', decisions, submitted, patch: patch.length > 0 ? patch : undefined}}};
        };
        // fallback when the mapping is missing or not trusted: the same no-reference pipeline step, in conservative mode (see listenToNaivePlayWithDecisions)
        const naive = (decisions: ParseDecision[]): PlayObject => withParse(naivePlay, [...decisions, {step: 'naive', outcome: 'applied', reason: 'Parsed artists and track from submitted values only, without reference data'}, ...naiveDecisions]);

        if(artistMappings.length === 0 || track_name === undefined || artist_name === undefined) {
            // if there are no artist mappings its likely MB doesn't have info on this track so just use our internally derived attempt
            // (and track/artist name are required by LZ so without them we can't do any better than naive)
            return naive([{step: 'reference', outcome: 'skipped', reason: artistMappings.length === 0 ? 'Listen has no Musicbrainz artist mapping' : 'Listen is missing submitted artist or track name'}]);
        }
        if(opts?.extractArtists === false) {
            // user wants data as-is
            return naive([{step: 'reference', outcome: 'skipped', reason: 'Artist extraction is disabled'}]);
        }

        const reference: CreditReference = {
            artists: artistMappings.map(x => ({name: x.artist_credit_name, joinPhrase: x.join_phrase, credit: nameToCredit(x.artist_credit_name, mbMeta(x.artist_mbid, 'artist'))})),
            track: recording_name
        };
        const result = parseWithReference(artist_name, track_name, reference);

        if(result.artists === undefined) {
            // mapping is likely incorrect so use user-submitted values only to be safe
            return naive(result.decisions);
        }
        if(result.track === undefined) {
            // track did not match mapping, use naive play but with good artists
            return withParse({
                ...naivePlay,
                data: {
                    ...naivePlay.data,
                    artists: result.artists
                }
            }, result.decisions);
        }

        let albumArtists = naivePlay.data.albumArtists;
        // this should always find an artist but to be safe...
        const primaryArtistMBMapping = artistMappings.find(x => x.artist_credit_name === result.primaryArtist);
        if(primaryArtistMBMapping !== undefined && albumArtists !== undefined) {
            // only include as primary if musicbrainz does not disagree with us
            if(release_artist_names.length === 0 || (release_artist_names.length > 0 && release_artist_names.includes(primaryArtistMBMapping.artist_credit_name))) {
                // the mbid belongs to the primary artist so only attach it to an album artist with the same name
                albumArtists = albumArtists.map(x => x.name === primaryArtistMBMapping.artist_credit_name ? withMetadata(x, mbMeta(primaryArtistMBMapping.artist_mbid, 'artist')) : x);
            }
        }

        const play: PlayObject = {
            data: {
                ...naivePlay.data,
                track: mergeCredit(naivePlay.data.track, nameToCredit(result.track)),
                album: withMetadata(naivePlay.data.album, mbMeta(release_mbid, 'release'), mbMeta(release_group_mbid, 'release-group')),
                albumArtists,
                artists: result.artists
            },
            meta: naivePlay.meta
        }

        return withParse(baseFormatPlayObj(listen, play), result.decisions);
    }

/**
 * Try to parse true artists and track name without using MB information
 * */
export const listenToNaivePlay = (listen: ListenResponse, opts?: ListenPayloadParseOptions): PlayObject => listenToNaivePlayWithDecisions(listen, opts).play;

export const listenToNaivePlayWithDecisions = (listen: ListenResponse, opts?: ListenPayloadParseOptions): {play: PlayObject, decisions: ParseDecision[]} => {
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
                    duration_played,
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

        const {
            extractArtists = true
        } = opts ?? {};

        const playId = recording_msid ?? aRecordingMsid;
        const trackId = aRecordingMbid ?? mRecordingMbid;
        let dur = aDuration;
        if (dur === undefined && aDurationMs !== undefined) {
            dur = Math.round(aDurationMs / 1000);
        }

        let normalTrackName = track_name;
        let artists: string[] = [];
        // leading artists that came from submitted artist values, only these can be matched to artist_mbids
        let fromArtistsCount = 0;
        const decisions: ParseDecision[] = [];

        if(artist_names.length > 0) {
            // player already sent artists as a list, use as-is
            artists = artist_names;
            fromArtistsCount = artist_names.length;
            decisions.push({step: 'artistNames', outcome: 'applied', reason: 'Used artist list submitted by the player (additional_info.artist_names)', candidates: artist_names});
        } else if(typeof artist_name === 'string') {
            // This runs when there is no reference data (no MB mapping) or the mapping was rejected as likely wrong,
            // so the submitted artist string is the only fact we have and any split on delimiters is a guess:
            // "Earth, Wind & Fire" is one artist, "Foo, Bar" may be two, and nothing here can tell them apart.
            //
            // To stay conservative the primary section of the artist string is never split (splitPrimary: false).
            // Only credits after a joiner ("Foo ft. Bar, Baz") are split because the joiner explicitly marks them as other artists.
            // Users who want more aggressive splitting can opt in with a native stage, where they control artistsIgnore.
            const parsed = parseWithoutReference([artist_name], track_name ?? '', {
                splitPrimary: false,
                artistDelimiters: [',', '/', '\\'],
                splitArtists: extractArtists,
                // default (all) delimiters for artists credited in track name, they are already marked by a joiner
                parseTrack: extractArtists && track_name !== undefined,
            });
            // if we found "ft. something" in track string then we now have a "real" track name and more artists
            normalTrackName = parsed.track ?? track_name;
            artists = parsed.artists;
            fromArtistsCount = parsed.fromArtistsCount;
            decisions.push(...parsed.decisions);
            if(artists.length === 0) {
                // fallback to original artist_name string if we weren't able to parse anything from artists/track credits
                artists.push(artist_name);
                fromArtistsCount = 1;
            }
            artists = uniqueNormalizedStrArr(artists);
        }

        let albumArtists: string[] | undefined;
        if(release_artist_name !== undefined) {
            albumArtists = [release_artist_name];
        }
        if(release_artist_names.length > 0) {
            albumArtists = unique([...(albumArtists ?? []), ...release_artist_names])
        }


        const artistMbids = artist_mbids.filter(x => x.trim() !== "");

        const play: PlayObjectMinimal = {
            data: {
                playDate: dayjs.unix(listened_at),
                track: nameToCredit(normalTrackName, mbMeta(trackId, 'recording'), isrcMeta(isrc !== undefined ? isrcNoHyphens(isrc) : undefined)),
                // artist_mbids are positional and describe the submitted artist values, so they are only applied to artists from those values
                // (and only when the counts match) -- artists found in the track would otherwise shift ids onto the wrong artist
                artists: [...creditsWithIds(namesToCredits(artists.slice(0, fromArtistsCount)), artistMbids, 'musicbrainz', 'artist'), ...namesToCredits(artists.slice(fromArtistsCount))],
                album: nameToCredit(release_name, mbMeta(release_mbid, 'release'), mbMeta(release_group_mbid, 'release-group')),
                albumArtists: albumArtists !== undefined ? namesToCredits(albumArtists) : undefined,
                duration: dur,
                meta: {
                }
            },
            meta: {
                source: submission_client ?? 'listenbrainz',
                playId,
                deviceId: combinePartsToString([music_service_name ?? music_service, submission_client, submission_client_version])
            }
        }

        if(duration_played !== undefined) {
            play.data.listenedFor = duration_played;
        }
        
        const brainzMeta = removeUndefinedKeys<BrainzMeta>({
            trackNumber: tracknumber
        }) ?? {};

        if(Object.keys(additional_info).length > 0) {
            brainzMeta.additionalInfo = additional_info;
            
        }
        if(artistMbids.length > 0) {
            brainzMeta.additionalInfo = {...(brainzMeta.additionalInfo ?? {}), artist_mbids: artistMbids};
        }

        if(Object.keys(brainzMeta).length > 0) {
            play.data.meta = {
                brainz: brainzMeta
            }
        }

        return {play: baseFormatPlayObj(listen, play), decisions};
    }


