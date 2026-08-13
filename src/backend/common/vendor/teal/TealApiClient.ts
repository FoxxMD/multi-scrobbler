import dayjs, { type Dayjs, type ManipulateType } from "dayjs";
import type {PlayObject, PlayObjectMinimal, BrainzMeta, MBID, ScrobbleActionResult} from "../../../../core/Atomic.ts";
import { getRoot } from "../../../ioc.ts";
import { removeUndefinedKeys } from '../../../../core/DataUtils.ts';
import { baseFormatPlayObj } from "../../../utils/PlayTransformUtils.ts";
import type { MSCache } from "../../Cache.ts";
import type {AbstractApiOptions, PagelessListensTimeRangeOptions, PagelessTimeRangeListens, PagelessTimeRangeListensResult} from "../../infrastructure/Atomic.ts";
import type {ListRecord, RecordOptions, TealClientData} from "../../infrastructure/config/client/tealfm.ts";
import AbstractApiClient from "../AbstractApiClient.ts";
import { ATProtoAppApiClient } from "../atproto/ATProtoAppApiClient.ts";
import type { FmTealActorStatus, FmTealAlphaActorStatus, FmTealAlphaFeedPlay, FmTealFeedPlay } from "./lexicons/index.ts";
import { ScrobbleSubmitError } from "../../errors/MSErrors.ts";
import { getScrobbleTsSOCDateWithContext, usecToUnix } from "../../../utils/TimeUtils.ts";
import { musicServiceToCononical } from "../listenbrainz/lzUtils.ts";
import { parseRegexSingle } from "@foxxmd/regex-buddy-core";
import { decodeTid, generateTID } from "@ewanc26/tid";
import type { ATProtoAuthenticatedApiClient } from "../atproto/ATProtoAuthenticatedApiClient.ts";
import { UpstreamError } from "../../errors/UpstreamError.ts";
import type { ComAtprotoRepoCreateRecord, ComAtprotoRepoPutRecord } from '@atcute/atproto';
import { nowPlayingExpirationDuration } from "../../../scrobblers/AbstractScrobbleClient.ts";
import { isrcNoHyphens, sortByNewestPlayDate } from "../../../../core/PlayUtils.ts";
import { isGenericUri } from "@atcute/lexicons/syntax";

type TealPlayRecord = FmTealAlphaFeedPlay.Main | FmTealFeedPlay.Main;

const TEAL_PLAY_COLLECTIONS = ['fm.teal.feed.play', 'fm.teal.alpha.feed.play'] as const;

const asMusicServiceUri = (musicService?: string): `${string}:${string}` | undefined => {
    if (musicService === undefined) {
        return undefined;
    }
    return isGenericUri(musicService) ? musicService : `https://${musicService}`;
};

export class TealApiClient extends AbstractApiClient implements PagelessTimeRangeListens {

    declare config: TealClientData;

    declare client: ATProtoAuthenticatedApiClient;

    cache: MSCache;

    constructor(name: any, config: TealClientData, options: AbstractApiOptions) {
        super('teal', name, config, options);

        if(config.appPassword !== undefined) {
            this.client = new ATProtoAppApiClient(name, config, {...options, logger: this.logger});
        } else if(config.baseUri !== undefined) {
            throw new Error('Oauth is not yet implemented');
        } else {
            throw new Error(`Must define either 'baseUri' or 'appPassword' in configuration!`);
        }

        this.cache = getRoot().items.cache();
    }


    async createScrobbleRecord(record: FmTealFeedPlay.Main): Promise<ScrobbleActionResult> {
        const input: ComAtprotoRepoCreateRecord.$input = {
            repo: this.client.userData.did,
            collection: 'fm.teal.feed.play',
            record
        };
        try {
            const res =  await this.client.post((client) => {
                return client.post('com.atproto.repo.createRecord', {
                input,
                params: {}
                });
            });
            return {payload: input, response: res.data, createdAt: dayjs().toISOString()};
        } catch (e) {
            throw new ScrobbleSubmitError(`Failed to create record for scrobble`, { cause: e, payload: input, response: 'response' in e ? e.response : undefined });
        }
    }

    async updateStatusRecord(record: FmTealActorStatus.Main): Promise<ScrobbleActionResult> {
        const input: ComAtprotoRepoPutRecord.$input = {
            repo: this.client.userData.did,
            collection: "fm.teal.actor.status",
            rkey: "self",
            record
        };
        try {
            const res = await this.client.post((client) => client.post('com.atproto.repo.putRecord', {
                input,
                params: {}
            }));
            return {payload: input, response: res.data, createdAt: dayjs().toISOString()};
        } catch (e) {
            throw new ScrobbleSubmitError(`Failed to update status record for scrobble`, { cause: e, payload: input, response: 'response' in e ? e.response : undefined });
        }
    }

    getPaginatedUnitOfTime(): ManipulateType {
        return 'second';
    }

    async getPagelessTimeRangeListens(params: PagelessListensTimeRangeOptions): Promise<PagelessTimeRangeListensResult> {
        const {to, limit} = params;

        let cursor: string;
        if(to !== undefined) {
            cursor = generateTID(dayjs.unix(to).toISOString());
        }

        const responses = await Promise.all(TEAL_PLAY_COLLECTIONS.map(collection => this.client.get((client) => client.get('com.atproto.repo.listRecords', {
            params: {
                repo: this.client.userData.did,
                collection,
                limit,
                cursor
            }
        }))));

        const fromTimestamps: number[] = [],
              playSets: PlayObject[][] = [];

        for (const resp of responses) {
            if (!resp.ok) {
                throw new UpstreamError('Fetching records from PDS failed', {cause: resp.data});
            }
            if(resp.data.cursor !== undefined) {
                fromTimestamps.push(usecToUnix(decodeTid(resp.data.cursor).timestampUs));
            }
            playSets.push((resp.data.records as ListRecord<TealPlayRecord>[]).map(x => listRecordToPlay(x)));
        }

        const from = fromTimestamps.length > 0 ? fromTimestamps.reduce((earliest, current) => current < earliest ? current : earliest) : undefined;
        const plays = playSets.flat().sort(sortByNewestPlayDate)

        return {data: plays, meta: {to, from, limit, more: false, order: 'desc'}};
    }
}

export const recordToPlay = (record: TealPlayRecord, options: RecordOptions = {}): PlayObject => {
    const artists = record.artists ?? [];
    let musicService: string;
    if('musicServiceUri' in record) {
        musicService = record.musicServiceUri
    } else if(`musicServiceBaseDomain` in record) {
        musicService = record.musicServiceBaseDomain;
    }
    let origin: string;
    if('originUri' in record) {
        origin = record.originUri;
    } else if(`originUrl` in record) {
        origin = record.originUrl;
    }

    const play: PlayObjectMinimal = {
        data: {
            track: record.trackName,
            artists: artists.filter(x => x.artistName !== undefined).map(x => ({ name: x.artistName, mbid: x.artistMbId })),
            duration: record.duration,
            playDate: dayjs(record.playedTime),
            album: record.releaseName,
            isrc: record.isrc
        },
        meta: {
            source: 'tealfm',
            parsedFrom: 'history',
            musicService,
            playId: options.playId,
            url: {
                web: options.web,
                origin
            },
            user: options.user
        }
    };

    const brainz = removeUndefinedKeys<BrainzMeta>({
        recording: record.recordingMbId,
        album: record.releaseMbId,
        artist: artists.filter(x => x.artistMbId !== undefined).length > 0 ? artists.filter(x => x.artistMbId !== undefined).map(x => x.artistMbId) : undefined
    });

    if (brainz !== undefined) {
        play.data.meta = { brainz };
    }

    return baseFormatPlayObj(record, play);
}

export const playToStatusRecord = (play: PlayObject, notPlaying: boolean, position?: number): FmTealActorStatus.Main => {
    const item = notPlaying
        ? { trackName: "", artists: [] }
        : (() => {
            const {
                $type,
                musicServiceUri,
                originUri,
                trackDiscriminant,
                releaseDiscriminant,
                ...record
            } = playToRecord(play);
            return {
                ...record,
                musicServiceBaseDomain: musicServiceUri,
                originUrl: originUri
            };
        })();

    let expiry: Dayjs;
    if (notPlaying) {
        // if clearing status we set expiration as one minute in the past
        expiry = dayjs().subtract(1, 'minute');
    } else {
        expiry = dayjs().add(nowPlayingExpirationDuration({ play, position }));
    }

    return {
        $type: "fm.teal.actor.status",
        time: dayjs().toISOString(),
        expiry: expiry.toISOString(),
        item: {
            artists: [],
            ...item
        }
    };
};
export const mbidToUri = (mbid: MBID): MBIDURI => {
    return `mbid:${mbid}`;
};
export const mbidUriOrUndefined = (mbid?: MBID): undefined | MBIDURI => {
    if (mbid === undefined) {
        return undefined;
    }
    return mbidToUri(mbid);
};
export type MBIDURI = `mbid:${MBID}`;
export const playToRecord = (play: PlayObject): FmTealFeedPlay.Main => {
    const musicService = musicServiceToCononical(play.meta.musicService) ?? play.meta.musicService;

    const record: FmTealFeedPlay.Main = {
        $type: "fm.teal.feed.play",
        trackName: play.data.track,
        artists: (play.data.artists ?? []).map(x => removeUndefinedKeys({ artistName: x.name, artistMbId: mbidUriOrUndefined(x.mbid as MBID) })),
        duration: Math.round(play.data.duration),
        playedTime: getScrobbleTsSOCDateWithContext(play)[0].toISOString(),
        releaseName: play.data.album,
        submissionClientAgent: `multi-scrobbler/${getRoot().items.version}`,
        musicServiceUri: asMusicServiceUri(musicService),
        originUri: isGenericUri(play.meta.url?.origin) ? play.meta.url?.origin : undefined,
        isrc: play.data.isrc !== undefined ? isrcNoHyphens(play.data.isrc) : undefined,
        trackMbId: mbidUriOrUndefined(play.data.meta?.brainz?.track as MBID),
        recordingMbId: mbidUriOrUndefined(play.data.meta?.brainz?.recording as MBID),
        releaseMbId: mbidUriOrUndefined(play.data.meta?.brainz?.album as MBID)
    };

    return record;
};
export const listRecordToPlay = (listRecord: ListRecord<TealPlayRecord>): PlayObject => {
    const opts: RecordOptions = {};
    const uriRes = parseRegexSingle(ATPROTO_URI_REGEX, listRecord.uri);
    if (uriRes !== undefined) {
        opts.web = `https://atproto.at/viewer?uri=${uriRes.named.resource}`;
        opts.playId = uriRes.named.tid;
        opts.user = uriRes.named.did;
    }
    return recordToPlay(listRecord.value, opts);
};
export const ATPROTO_URI_REGEX = new RegExp(/at:\/\/(?<resource>(?<did>did.*?)\/fm.teal(?:\.alpha)?\.feed.play\/(?<tid>.*))/);
