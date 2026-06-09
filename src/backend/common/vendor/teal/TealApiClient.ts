import dayjs, { Dayjs, ManipulateType } from "dayjs";
import { PlayObject, PlayObjectLifecycleless, BrainzMeta, SourcePlayerObj, MBID, ScrobbleActionResult, UnixTimestamp } from "../../../../core/Atomic.js";
import { getRoot } from "../../../ioc.js";
import { removeUndefinedKeys } from "../../../utils.js";
import { baseFormatPlayObj } from "../../../utils/PlayTransformUtils.js";
import { MSCache } from "../../Cache.js";
import { AbstractApiOptions, PagelessListensTimeRangeOptions, PagelessTimeRangeListens, PagelessTimeRangeListensResult } from "../../infrastructure/Atomic.js";
import { ListRecord, RecordOptions, TealClientData } from "../../infrastructure/config/client/tealfm.js";
import AbstractApiClient from "../AbstractApiClient.js";
import { ATProtoAppApiClient } from "../atproto/ATProtoAppApiClient.js";
import { Duration } from "dayjs/plugin/duration.js";
import { FmTealAlphaActorStatus, FmTealAlphaFeedPlay } from "./lexicons/index.js";
import { ScrobbleSubmitError } from "../../errors/MSErrors.js";
import { getScrobbleTsSOCDateWithContext, usecToUnix } from "../../../utils/TimeUtils.js";
import { musicServiceToCononical } from "../listenbrainz/lzUtils.js";
import { parseRegexSingle } from "@foxxmd/regex-buddy-core";
import { decodeTid, generateTID } from "@ewanc26/tid";
import { ATProtoAuthenticatedApiClient } from "../atproto/ATProtoAuthenticatedApiClient.js";
import { UpstreamError } from "../../errors/UpstreamError.js";
import { ComAtprotoRepoCreateRecord, ComAtprotoRepoPutRecord } from '@atcute/atproto';

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


    async createScrobbleRecord(record: FmTealAlphaFeedPlay.Main): Promise<ScrobbleActionResult> {
        const input: ComAtprotoRepoCreateRecord.$input = {
            repo: this.client.userData.did,
            collection: 'fm.teal.alpha.feed.play',
            record
        };
        try {
            const res = await this.client.client.post('com.atproto.repo.createRecord', {
                input,
                params: {}
            });
            return {payload: input, response: res.data, createdAt: dayjs().toISOString()};
        } catch (e) {
            throw new ScrobbleSubmitError(`Failed to create record for scrobble`, { cause: e, payload: input, response: 'response' in e ? e.response : undefined });
        }
    }

    async updateStatusRecord(record: FmTealAlphaActorStatus.Main): Promise<ScrobbleActionResult> {
        const input: ComAtprotoRepoPutRecord.$input = {
            repo: this.client.userData.did,
            collection: "fm.teal.alpha.actor.status",
            rkey: "self",
            record
        };
        try {
            const res = await this.client.client.post('com.atproto.repo.putRecord', {
                input,
                params: {}
            });
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

        const resp = await this.client.client.get('com.atproto.repo.listRecords', {
            params: {
                repo: this.client.userData.did,
                collection: "fm.teal.alpha.feed.play",
                limit,
                cursor
            }
        });

        if(!resp.ok) {
            throw new UpstreamError('Fetching records from PDS failed', {cause: resp.data});
        }

        let fromTS: UnixTimestamp;
        if(resp.data.cursor !== undefined) {
            const { timestampUs } = decodeTid(resp.data.cursor);
            fromTS = usecToUnix(timestampUs);
        }

        const plays = (resp.data.records as unknown as ListRecord<FmTealAlphaFeedPlay.Main>[]).map(x => listRecordToPlay(x));

        return {data: plays, meta: {to, from: fromTS, limit}};
    }
}

export const recordToPlay = (record: FmTealAlphaFeedPlay.Main, options: RecordOptions = {}): PlayObject => {

    const play: PlayObjectLifecycleless = {
        data: {
            track: record.trackName,
            artists: record.artists.filter(x => x.artistName !== undefined).map(x => ({ name: x.artistName, mbid: x.artistMbId })),
            duration: record.duration,
            playDate: dayjs(record.playedTime),
            album: record.releaseName,
            isrc: record.isrc
        },
        meta: {
            source: 'tealfm',
            parsedFrom: 'history',
            musicService: record.musicServiceBaseDomain,
            playId: options.playId,
            url: {
                web: options.web
            },
            user: options.user
        }
    };

    const brainz = removeUndefinedKeys<BrainzMeta>({
        recording: record.recordingMbId,
        album: record.releaseMbId,
        artist: record.artists.filter(x => x.artistMbId !== undefined).length > 0 ? record.artists.filter(x => x.artistMbId !== undefined).map(x => x.artistMbId) : undefined
    });

    if (brainz !== undefined) {
        play.data.meta = { brainz };
    }

    return baseFormatPlayObj(record, play);
};export const nowPlayingExpirationDuration = (data: Pick<SourcePlayerObj, 'play' | 'position'>): Duration => {
    let expiry: Dayjs = dayjs().add(10, 'minute');

    const {
        position, play
    } = data;

    // if we have position and duration then expiration is set as calculated end of listening session
    if (position !== undefined && play?.data.duration !== undefined) {
        expiry = dayjs().add(play.data.duration - position, 'second');
    } else if (play?.data.duration !== undefined) {
        // else if we have duration but not position then use track duration
        expiry = dayjs().add(play.data.duration, 'second');
    }

    // otherwise use 10 minutes
    return dayjs.duration(expiry.diff(dayjs(), 'ms'));
};
export const playToStatusRecord = (play: PlayObject, notPlaying: boolean, position?: number): FmTealAlphaActorStatus.Main => {
    const { $type, ...item } = notPlaying
        ? { trackName: "", artists: [] }
        : playToRecord(play);

    let expiry: Dayjs;
    if (notPlaying) {
        // if clearing status we set expiration as one minute in the past
        expiry = dayjs().subtract(1, 'minute');
    } else {
        expiry = dayjs().add(nowPlayingExpirationDuration({ play, position }));
    }

    return {
        $type: "fm.teal.alpha.actor.status",
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
export const playToRecord = (play: PlayObject): FmTealAlphaFeedPlay.Main => {

    const record: FmTealAlphaFeedPlay.Main = {
        $type: "fm.teal.alpha.feed.play",
        trackName: play.data.track,
        artists: play.data.artists.map(x => removeUndefinedKeys({ artistName: x.name, artistMbId: mbidUriOrUndefined(x.mbid as MBID) })),
        duration: Math.round(play.data.duration),
        playedTime: getScrobbleTsSOCDateWithContext(play)[0].toISOString(),
        releaseName: play.data.album,
        submissionClientAgent: `multi-scrobbler/${getRoot().items.version}`,
        musicServiceBaseDomain: musicServiceToCononical(play.meta.musicService) ?? play.meta.musicService,
        isrc: play.data.isrc,
        trackMbId: mbidUriOrUndefined(play.data.meta?.brainz?.track as MBID),
        recordingMbId: mbidUriOrUndefined(play.data.meta?.brainz?.recording as MBID),
        releaseMbId: mbidUriOrUndefined(play.data.meta?.brainz?.album as MBID)
    };

    return record;
};
export const listRecordToPlay = (listRecord: ListRecord<FmTealAlphaFeedPlay.Main>): PlayObject => {
    const opts: RecordOptions = {};
    const uriRes = parseRegexSingle(ATPROTO_URI_REGEX, listRecord.uri);
    if (uriRes !== undefined) {
        opts.web = `https://atproto.at/viewer?uri=${uriRes.named.resource}`;
        opts.playId = uriRes.named.tid;
        opts.user = uriRes.named.did;
    }
    return recordToPlay(listRecord.value, opts);
};
export const ATPROTO_URI_REGEX = new RegExp(/at:\/\/(?<resource>(?<did>did.*?)\/fm.teal.alpha.feed.play\/(?<tid>.*))/);

