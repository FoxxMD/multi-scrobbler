import { getRoot } from "../../../ioc.js";
import { AbstractApiOptions, PagelessListensTimeRangeOptions, PagelessTimeRangeListens, PagelessTimeRangeListensResult } from "../../infrastructure/Atomic.js";
import { ListRecord, ScrobbleRecord, TealClientData } from "../../infrastructure/config/client/tealfm.js";
import AbstractApiClient from "../AbstractApiClient.js";
import { Agent, ComAtprotoRepoCreateRecord, ComAtprotoRepoListRecords } from "@atproto/api";
import { MSCache } from "../../Cache.js";
import { BrainzMeta, PlayObject, PlayObjectLifecycleless, ScrobbleActionResult } from "../../../../core/Atomic.js";
import { musicServiceToCononical } from "../ListenbrainzApiClient.js";
import { parseRegexSingle } from "@foxxmd/regex-buddy-core";
import { RecordOptions } from "../../infrastructure/config/client/tealfm.js";
import dayjs, { ManipulateType } from "dayjs";
import { getScrobbleTsSOCDateWithContext } from "../../../utils/TimeUtils.js";
import { removeUndefinedKeys } from "../../../utils.js";
import { baseFormatPlayObj } from "../../../utils/PlayTransformUtils.js";
import { ScrobbleSubmitError } from "../../errors/MSErrors.js";
import { UpstreamError } from "../../errors/UpstreamError.js";
import * as TID from '@atcute/tid';
import { randomInt } from "node:crypto";

export abstract class AbstractBlueSkyApiClient extends AbstractApiClient implements PagelessTimeRangeListens {

    declare config: TealClientData;

    agent!: Agent;

    cache: MSCache;

    constructor(name: any, config: TealClientData, options: AbstractApiOptions) {
        super('blueSky', name, config, options);

        this.cache = getRoot().items.cache();
    }

    abstract initClient(): Promise<void>;

    abstract restoreSession(): Promise<boolean>;

    async createScrobbleRecord(record: ScrobbleRecord): Promise<ScrobbleActionResult> {
        const input: ComAtprotoRepoCreateRecord.InputSchema = {
            repo: this.agent.sessionManager.did,
            collection: "fm.teal.alpha.feed.play",
            record
        };
        try {
            const resp = await this.agent.com.atproto.repo.createRecord(input);
            return {payload: input, response: resp.data};
        } catch (e) {
            throw new ScrobbleSubmitError(`Failed to create record for scrobble`, { cause: e, payload: input, response: 'response' in e ? e.response : undefined });
        }
    }

    async listScrobbleRecord(options: {limit?: number, cursor?: string} = {}): Promise<ComAtprotoRepoListRecords.Response> {
        const {limit = 20, cursor} = options;
        try {
            // records are returned newest to oldest
            const response = await this.agent.com.atproto.repo.listRecords({
                repo: this.agent.sessionManager.did,
                collection: "fm.teal.alpha.feed.play",
                limit,
                cursor // cursor TID is EXCLUSIVE IE first record returned will be the first older than cursor
            });
            return response;
        } catch (e) {
            throw new UpstreamError(`Failed to list scrobble record`, { cause: e, response: 'response' in e ? e.response : undefined });
        }
    }

    async getPagelessTimeRangeListens(params: PagelessListensTimeRangeOptions): Promise<PagelessTimeRangeListensResult> {
        const {to, limit} = params;

        let cursor: string;
        if(to !== undefined) {
            cursor = TID.create(to, randomInt(1023));
        }

        const resp = await this.listScrobbleRecord({cursor, limit});
        const fromTS = TID.parse(resp.data.cursor);

        const plays = (resp.data.records as unknown as ListRecord<ScrobbleRecord>[]).map(x => listRecordToPlay(x));

        return {data: plays, meta: {to, from: fromTS.timestamp, limit}};
    }

    getPaginatedUnitOfTime(): ManipulateType {
        return 'second';
    }
}

export const playToRecord = (play: PlayObject): ScrobbleRecord => {

    const record: ScrobbleRecord = {
        $type: "fm.teal.alpha.feed.play",
        trackName: play.data.track,
        artists: play.data.artists.map(x => ({ artistName: x })),
        duration: Math.round(play.data.duration),
        playedTime: getScrobbleTsSOCDateWithContext(play)[0].toISOString(),
        releaseName: play.data.album,
        submissionClientAgent: `multi-scrobbler/${getRoot().items.version}`,
        musicServiceBaseDomain: musicServiceToCononical(play.meta.musicService) ?? play.meta.musicService,
        isrc: play.data.isrc,
        recordingMbId: play.data.meta?.brainz?.recording,
        releaseMbId: play.data.meta?.brainz?.album
    };

    return record;
}

export const listRecordToPlay = (listRecord: ListRecord<ScrobbleRecord>): PlayObject => {
    const opts: RecordOptions = {};
    const uriRes = parseRegexSingle(ATPROTO_URI_REGEX, listRecord.uri);
    if (uriRes !== undefined) {
        opts.web = `https://atproto.at/viewer?uri=${uriRes.named.resource}`;
        opts.playId = uriRes.named.tid;
        opts.user = uriRes.named.did;
    }
    return recordToPlay(listRecord.value, opts);
}

export const recordToPlay = (record: ScrobbleRecord, options: RecordOptions = {}): PlayObject => {

    const play: PlayObjectLifecycleless = {
        data: {
            track: record.trackName,
            artists: record.artists.filter(x => x.artistName !== undefined).map(x => x.artistName),
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

    if(brainz !== undefined) {
        play.data.meta = {brainz};
    }

    return baseFormatPlayObj(record, play);
};
export const ATPROTO_URI_REGEX = new RegExp(/at:\/\/(?<resource>(?<did>did.*?)\/fm.teal.alpha.feed.play\/(?<tid>.*))/);

