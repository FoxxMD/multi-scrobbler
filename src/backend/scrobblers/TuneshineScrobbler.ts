import { childLogger, type Logger, type LogLevel } from "@foxxmd/logging";
import type EventEmitter from "events";
import {type PlayMatchResult, type PlayObject, type SourcePlayerObj} from "../../core/Atomic.ts";
import type {FormatPlayObjectOptions} from "../common/infrastructure/Atomic.ts";
import AbstractScrobbleClient, { nowPlayingUpdateByPlayDuration, shouldClearNPStatus } from "./AbstractScrobbleClient.ts";
import { playToPostImageMetadata, TuneshineApiClient } from "../common/vendor/tuneshine/TuneshineApiClient.ts";
import type { TuneshineClientConfig } from "../common/infrastructure/config/client/tuneshine.ts";
import dayjs from "dayjs";

export default class TuneshineScrobbler extends AbstractScrobbleClient {

    override nowPlayingIsRealtime: boolean = true;
    override supportsNowPlaying: boolean = true;

    api: TuneshineApiClient;

    declare config: TuneshineClientConfig

    constructor(name: any, config: TuneshineClientConfig, options = {}, emitter: EventEmitter, logger: Logger) {
        super('tuneshine', name, config, emitter, logger);
        this.api = new TuneshineApiClient(name, this.config, { logger: childLogger(this.logger, 'API') });
        this.nowPlayingMaxThreshold = nowPlayingUpdateByPlayDuration;
        this.nowPlayingMinThreshold = (_: any) => 5;
    }

    getScrobblesForTimeRange = async (_: any) => [];

    formatPlayObj = (obj: any, options: FormatPlayObjectOptions = {}) => obj;

    protected async doBuildInitData(): Promise<true | string | undefined> {
        await this.api.buildData();
        return true;
    }

    protected async doCheckConnection(): Promise<true | string | undefined> {

        try {
            await this.api.checkConnection();
            return true;
        } catch (e) {
            throw e;
        }

    }
    // tuneshine does not handle scrobbles, only Now Playing
    // so don't bother queueing any scrobbles as we don't want to cache them
    // or give the user the impression they are used (in UI as a number of queued scrobbles)
    queuePlay = async (data: Parameters<AbstractScrobbleClient['queuePlay']>[0]) => []
    alreadyScrobbled = async (playObj: PlayObject, log = false): Promise<[boolean, PlayMatchResult]> => ([false, {match: false, breakdowns: [], score: 0, createdAt: dayjs().toISOString()}])
    doScrobble = async (playObj: PlayObject) => ({ play: playObj, payload: {}, createdAt: dayjs().toISOString() })

    public playToClientPayload(playObject: PlayObject): any {
        return playToPostImageMetadata(playObject)
    }

    doPlayingNow = async (data: SourcePlayerObj) => {
        try {
            if(shouldClearNPStatus(data) || data.play === undefined) {
                await this.api.clearNowPlaying();
            } else {
                const play = {
                    ...data.play,
                    meta: {
                        ...(data.play.meta ?? {}),
                        trackProgressPosition: data.position ?? data.play.meta?.trackProgressPosition
                    }}
                await this.api.sendNowPlaying(play);
            }
        } catch (e) {
            throw e;
        }
    }

    shouldUpdatePlayingNowPlatformSpecific = async (data: SourcePlayerObj): Promise<[boolean, string?, LogLevel?]> => {
        if(data === undefined || data.play === undefined) {
            return [true];
        }
        let artUrl: string | undefined = undefined;
        if (data.play.meta?.art?.track !== undefined) {
            artUrl = data.play.meta?.art?.track;
        } else if (data.play.meta?.art?.album !== undefined) {
            artUrl = data.play.meta?.art?.album;
        } else if (data.play.meta?.art?.artist !== undefined) {
            artUrl = data.play.meta?.art?.artist;
        }
        if (artUrl === undefined) {
            return [false, 'Play does not contain artwork'];
        }
        return [true];
    }
}