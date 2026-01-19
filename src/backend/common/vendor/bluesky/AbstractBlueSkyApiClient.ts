import { getRoot } from "../../../ioc.js";
import { AbstractApiOptions } from "../../infrastructure/Atomic.js";
import { ListRecord, ScrobbleRecord, TealClientData } from "../../infrastructure/config/client/tealfm.js";
import AbstractApiClient from "../AbstractApiClient.js";
import { Agent } from "@atproto/api";
import { MSCache } from "../../Cache.js";
import { BrainzMeta, PlayObject } from "../../../../core/Atomic.js";
import { musicServiceToCononical } from "../ListenbrainzApiClient.js";
import { parseRegexSingle } from "@foxxmd/regex-buddy-core";
import { RecordOptions } from "../../infrastructure/config/client/tealfm.js";
import dayjs from "dayjs";
import { getScrobbleTsSOCDateWithContext } from "../../../utils/TimeUtils.js";
import { removeUndefinedKeys } from "../../../utils.js";


export abstract class AbstractBlueSkyApiClient extends AbstractApiClient {

    declare config: TealClientData;

    agent!: Agent;

    cache: MSCache;

    constructor(name: any, config: TealClientData, options: AbstractApiOptions) {
        super('blueSky', name, config, options);

        this.cache = getRoot().items.cache();
    }

    abstract initClient(): Promise<void>;

    abstract restoreSession(): Promise<boolean>;

    async createScrobbleRecord(record: ScrobbleRecord): Promise<void> {
        try {
            await this.agent.com.atproto.repo.createRecord({
                repo: this.agent.sessionManager.did,
                collection: "fm.teal.alpha.feed.play",
                record
            });
        } catch (e) {
            throw new Error(`Failed to create record`, { cause: e });
        }
    }

    async listScrobbleRecord(limit: number = 20): Promise<ListRecord<ScrobbleRecord>[]> {
        try {
            const response = await this.agent.com.atproto.repo.listRecords({
                repo: this.agent.sessionManager.did,
                collection: "fm.teal.alpha.feed.play",
                limit
            });
            return response.data.records as unknown as ListRecord<ScrobbleRecord>[];
        } catch (e) {
            throw new Error(`Failed to create record`, { cause: e });
        }
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

    const play: PlayObject = {
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

    const brainz: BrainzMeta | undefined = removeUndefinedKeys({
        recording: record.recordingMbId,
        album: record.releaseMbId,
        artist: record.artists.filter(x => x.artistMbId !== undefined).length > 0 ? record.artists.filter(x => x.artistMbId !== undefined).map(x => x.artistMbId) : undefined
    });

    if(brainz !== undefined) {
        play.data.meta = {brainz};
    }

    return play;
};
export const ATPROTO_URI_REGEX = new RegExp(/at:\/\/(?<resource>(?<did>did.*?)\/fm.teal.alpha.feed.play\/(?<tid>.*))/);

