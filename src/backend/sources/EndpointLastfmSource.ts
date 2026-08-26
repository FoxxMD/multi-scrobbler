import dayjs from "dayjs";
import type EventEmitter from "events";
import { PARSED_FROM, type PlayObject, SOURCE_SOT } from "../../core/Atomic.ts";
import {
    type ExpressRequest,
    type FormatPlayObjectOptions,
    type InternalConfig,
    type PlayerStateData} from "../common/infrastructure/Atomic.ts";
import { NO_USER } from '../../core/Atomic.ts';
import { REPORTED_PLAYER_STATUSES } from '../../core/Atomic.ts';
import type {PlayPlatformId} from '../../core/Atomic.ts';
import MemorySource from "./MemorySource.ts";
import type {LastFMEndpointSourceConfig} from "../common/infrastructure/config/source/endpointlfm.ts";
import { ingressPayloads, type LastFmSingleSubmitPayload, type LastFmSubmitPayload, scrobblePayloadToPlay } from "../common/vendor/LastfmApiClient.ts";
import type {Logger} from "@foxxmd/logging";
import type {PlayerStateOptions} from "./PlayerState/AbstractPlayerState.ts";
import { NowPlayingPlayerState } from "./PlayerState/NowPlayingPlayerState.ts";
import { parseRegexSingle } from "@foxxmd/regex-buddy-core";
import { AUTH_HEADER_DEFAULT_REGEX, parseSlugFromRequest, type RequestIdentifierRegexes } from "../utils/RequestUtils.ts";

const noSlugMatch = new RegExp(/(?:\/api\/lastfm\/?)$|(?:^\/1\/?|^\/2.0\/?)$/i);
const slugMatch = new RegExp(/\/api\/lastfm\/([^\/]+)(\/|\/2.0\/)?$/i);

export const requestMatchers: RequestIdentifierRegexes = {
    slug: slugMatch,
    noSlug: noSlugMatch,
    token: AUTH_HEADER_DEFAULT_REGEX
}
export class EndpointLastfmSource extends MemorySource {

    declare config: LastFMEndpointSourceConfig;

    constructor(name: any, config: LastFMEndpointSourceConfig, internal: InternalConfig, emitter: EventEmitter) {
        super('endpointlfm', name, config, internal, emitter);
        this.multiPlatform = false;
        this.playerSourceOfTruth = SOURCE_SOT.INGRESS;

        const {
            data = {},
            data: {
                slug,
            } = {}
        } = this.config;
        this.config.data = {
            ...data,
            slug: slug === null ? undefined : slug,
        };
    }

    matchRequest(req: Pick<ExpressRequest, 'baseUrl' | 'originalUrl' | 'header'>): boolean {
        const slug = parseSlugFromRequest(req, requestMatchers);
        if (slug === false) {
            return false;
        }

        return (this.config.data.slug === undefined && slug === undefined) || (slug !== undefined && this.config.data.slug !== undefined && this.config.data.slug.toLowerCase().trim() === slug.toLocaleLowerCase().trim());
    }

    static formatPlayObj(obj: LastFmSingleSubmitPayload, options: FormatPlayObjectOptions = {}): PlayObject {
        return scrobblePayloadToPlay(obj);
    }

    getRecentlyPlayed = async (options = {}) => {
        return await this.getFlatRecentlyDiscoveredPlays();
    }

    isValidScrobble = (playObj: PlayObject) => {
        return true;
    }

    handle = async (stateData: PlayerStateData[]) => {

        if(stateData.length === 1) {
            if(stateData[0].play.meta.nowPlaying === true) {
                this.setStatus('Received Now Playing');
            } else {
                this.setStatus('Received Play');
            }
            await this.processRecentPlays(stateData);
        } else {
            this.setStatus(`Received ${stateData.length} batch Plays`);
        }

        const discoverable = stateData.filter(x => x.play.meta.nowPlaying === false);
        await this.queuePlay(discoverable.map(x => ({...x.play, meta: {...x.play.meta, parsedFrom: PARSED_FROM.ingress}})));
        // const discovered = await this.discover(discoverable.map(x => x.play));
        // if (discovered.length > 0) {
        //     await this.scrobble(discovered);
        // }
        this.componentRepo.updateById(this.dbComponent.id, {lastActiveAt: dayjs()});
        this.setStatus('Waiting for Plays');
    }

    protected async postInitialize(): Promise<void> {
        this.setStatus('Waiting for Plays');
    }

    getNewPlayer = (logger: Logger, id: PlayPlatformId, opts: PlayerStateOptions) => new NowPlayingPlayerState(logger,  id, opts);
}

export const playStateFromRequest = (obj: LastFmSubmitPayload): PlayerStateData[] => {
    let payloads: LastFmSingleSubmitPayload[];
    if(obj.method === 'track.updateNowPlaying') {
        payloads = [obj];
    } else {
        payloads = ingressPayloads(obj);
    }
    return payloads.map(x => {
        const play = scrobblePayloadToPlay(x);
        play.meta.sourceSOT = SOURCE_SOT.INGRESS;
        return {
            platformId: [play.meta.deviceId, NO_USER],
            play,
            status: obj.method === 'track.updateNowPlaying' ? REPORTED_PLAYER_STATUSES.playing : REPORTED_PLAYER_STATUSES.unknown,
            stateUpdatedAt: dayjs()
        }
    });
}

export const parseSlugFromString = (path: string): string | false | undefined => {
    const noSlug = parseRegexSingle(noSlugMatch, path);
    if (noSlug !== undefined) {
        return undefined;
    }
    const slugResult = parseRegexSingle(slugMatch, path);
    if (slugResult !== undefined) {
        return slugResult.groups[0];
    }
    return false;
}