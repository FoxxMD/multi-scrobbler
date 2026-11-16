import type { Logger } from "@foxxmd/logging";
import type EventEmitter from "events";
import request from 'superagent';
import dayjs from "dayjs";
import type { PlayObject, SourcePlayerObj } from "../../core/Atomic.ts";
import { buildTrackString } from "../../core/MusicMetadata.ts";
import type { FormatPlayObjectOptions } from "../common/infrastructure/Atomic.ts";
import type { BlackboxClientConfig, BlackboxNowPlayingPayload, BlackboxScrobblePayload } from "../common/infrastructure/config/client/blackbox.ts";
import { playToSubmitPayload } from "../common/vendor/listenbrainz/lzUtils.ts";
import AbstractScrobbleClient, { nowPlayingUpdateByPlayDuration } from "./AbstractScrobbleClient.ts";
import {redactString} from "@foxxmd/redact-string";
import { SimpleError } from "../common/errors/MSErrors.ts";
import { toPublicPlay, toPublicPlayer } from "../../core/PlayJsonSchema.ts";
import type { SubmitPayload } from "../../core/vendor/listenbrainz/interfaces.ts";

/**
 * One-way, webhook-like Client.
 * */
export default class BlackboxScrobbler extends AbstractScrobbleClient {

    override supportsNowPlaying: boolean = true;
    override preloadScrobbles: boolean = false;

    declare config: BlackboxClientConfig;

    constructor(name: any, config: BlackboxClientConfig, options = {}, emitter: EventEmitter, logger: Logger) {
        super('blackbox', name, config, emitter, logger);
        // nothing to read back from endpoint, dupe detection only uses Plays MS has recorded as scrobbled
        this.upstreamRefresh.refreshEnabled = false;
        this.nowPlayingMaxThreshold = nowPlayingUpdateByPlayDuration;
    }

    getScrobblesForTimeRange = async (_: any) => [];

    formatPlayObj = (obj: any, options: FormatPlayObjectOptions = {}) => obj;

    protected async doBuildInitData(): Promise<true | string | undefined> {
        if(this.config.data?.headers === undefined) {
            this.logger.info('No Headers provided.');
        } else {
            this.logger.info(`Will send these Headers with every request:\n${Object.entries(this.config.data.headers).map(([key,val]) => `${key}: ${redactString(val, 6, {replaceFrom: 'end'})}`).join('\n')}`);
        }
        return true;
    }

    protected async doCheckConnection(): Promise<true | string | undefined> {
        if(this.config.data.endpointHealth !== undefined) {
            const res = await request
            .get(this.config.data.endpointHealth)
            .set(this.config.data.headers ?? {});
            if(res.statusCode >= 200 && res.statusCode < 300) {
                return true;
            }
            throw new SimpleError(`Returned non-2xx status code: ${res.statusCode}`);
        }
        return undefined;
    }

    protected doAuthentication = async () => {
        if(this.config.data.endpointAuth !== undefined) {
            const res = await request
            .get(this.config.data.endpointAuth)
            .set(this.config.data.headers ?? {});
            if(res.statusCode >= 200 && res.statusCode < 300) {
                return true;
            }
            throw new SimpleError(`Returned non-2xx status code: ${res.statusCode}`);
        }
        return true;
    }

    public playToClientPayload(playObj: PlayObject, type: 'scrobble' | 'nowPlaying' = 'scrobble'): SubmitPayload | BlackboxScrobblePayload  {
        if(this.config.data.payloadStyle === 'listenbrainz') {
            return playToSubmitPayload(playObj, {listenType: type === 'scrobble' ? 'single' : 'playing_now'});
        }
        return {play: toPublicPlay(playObj), type: 'scrobble'};
    }

    protected send = async (payload: object) => request.post(this.config.data.endpoint).set(this.config.data.headers ?? {}).type('json').send(payload);

    doScrobble = async (playObj: PlayObject) => {
        const payload = this.playToClientPayload(playObj);
        const resp = await this.send(payload);
        this.logger.info(`Scrobbled => (${playObj.meta.source}) ${buildTrackString(playObj)}`);
        return {play: playObj, payload, response: resp.text, createdAt: dayjs().toISOString()};
    }

    doPlayingNow = async (data: SourcePlayerObj) => {
        if(data.play === undefined) {
            if(this.config.data.payloadStyle === 'listenbrainz') {
                return;
            }
            await this.send({play: null, type: 'nowPlaying'});
        } else {
            await this.send(this.config.data.payloadStyle === 'listenbrainz' ? this.playToClientPayload(data.play, 'nowPlaying') : {play: toPublicPlayer(data), type: 'nowPlaying'} satisfies BlackboxNowPlayingPayload);
        }
    }
}
