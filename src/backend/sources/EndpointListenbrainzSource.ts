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
import type {ReportedPlayerStatus} from '../../core/Atomic.ts';
import type {PlayPlatformId} from '../../core/Atomic.ts';
import type {ListenbrainzEndpointSourceConfig} from "../common/infrastructure/config/source/endpointlz.ts";
import { listenPayloadToPlay } from "../common/vendor/ListenbrainzApiClient.ts";
import type {SubmitPayload} from '../../core/vendor/listenbrainz/interfaces.ts';
import type {ListenPayload} from '../../core/vendor/listenbrainz/interfaces.ts';
import MemorySource from "./MemorySource.ts";
import { NowPlayingPlayerState } from "./PlayerState/NowPlayingPlayerState.ts";
import type {Logger} from "@foxxmd/logging";
import type {PlayerStateOptions} from "./PlayerState/AbstractPlayerState.ts";
import { AUTH_HEADER_DEFAULT_REGEX, parseSlugFromRequest, parseTokenFromRequest, type RequestIdentifierRegexes } from "../utils/RequestUtils.ts";

const noSlugMatch = new RegExp(/\/api\/listenbrainz\/?$|(\/1\/?|\/1\/.+)$/i);
const slugMatch = new RegExp(/\/api\/listenbrainz\/([^\/]+)$/i);

export const requestMatchers: RequestIdentifierRegexes = {
    slug: slugMatch,
    noSlug: noSlugMatch,
    token: AUTH_HEADER_DEFAULT_REGEX
}

export const authHeaderRegex = new RegExp(/Token (.+)$/i);

export class EndpointListenbrainzSource extends MemorySource {

    declare config: ListenbrainzEndpointSourceConfig;

    constructor(name: any, config: ListenbrainzEndpointSourceConfig, internal: InternalConfig, emitter: EventEmitter) {
        super('endpointlz', name, config, internal, emitter);
        this.multiPlatform = false;
        this.playerSourceOfTruth = SOURCE_SOT.INGRESS;

        const {
            data = {},
            data: {
                slug,
            } = {}
        } = this.config;
        this.config.data = {
            token: undefined,
            ...data,
            slug: slug === null ? undefined : slug,
        };
    }

    matchRequest(req: Pick<ExpressRequest, 'baseUrl' | 'header'>): boolean {
        let matchesToken = this.config.data.token === undefined;
        const reqToken = parseTokenFromRequest(req, requestMatchers);
        if (reqToken === false) {
            return false;
        }
        matchesToken = this.config.data.token === undefined && reqToken === undefined ||
            (reqToken !== undefined && this.config.data.token !== undefined
                && this.config.data.token.toLowerCase().trim() === reqToken.toLowerCase().trim());

        if (!matchesToken) {
            return false;
        }

        let matchesPath = false;
        const slug = parseSlugFromRequest(req, requestMatchers);
        if (slug === false) {
            return false;
        } else {
            matchesPath = (this.config.data.slug === undefined && slug === undefined) || (slug !== undefined && this.config.data.slug !== undefined && this.config.data.slug.toLowerCase().trim() === slug.toLocaleLowerCase().trim());
        }

        return matchesToken && matchesPath;
    }

    static formatPlayObj(obj: ListenPayload, options: FormatPlayObjectOptions & {
        nowPlaying?: boolean
    } = {}): PlayObject {
        const play = listenPayloadToPlay(obj, options.nowPlaying);
        play.meta.newFromSource = true;
        return play;
    }

    getRecentlyPlayed = async (options = {}) => {
        return await this.getFlatRecentlyDiscoveredPlays();
    }

    isValidScrobble = (playObj: PlayObject) => {
        return true;
    }

    handle = async (stateData: PlayerStateData[]) => {

        // if request was an import (multiple plays) then we don't want to process for "now playing" player
        // so only process if we only have one payload in the request
        if(stateData.length === 1) {
            if(stateData[0].play.meta.nowPlaying === true) {
                this.setStatus('Received Now Playing');
            } else {
                this.setStatus('Received single Play');
            }
            await this.processRecentPlays(stateData);
        } else {
            this.setStatus('Received batch Plays');
        }

        const discoverable = stateData.filter(x => x.play.meta.nowPlaying === false && this.isValidScrobble(x.play));
        await this.queuePlay(discoverable.map(x => ({...x.play, meta: {...x.play.meta, parsedFrom: PARSED_FROM.ingress}})))
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

export const playStateFromRequest = (obj: SubmitPayload): PlayerStateData[] => {
    const {
        listen_type,
        payload,
    } = obj;

    const playStates: PlayerStateData[] = payload.map((x) => {
        const play = listenPayloadToPlay(x, listen_type === 'playing_now');
        play.meta.sourceSOT = SOURCE_SOT.INGRESS;
        return {
            platformId: [play.meta.deviceId, NO_USER],
            play,
            status: listenTypeAsPlayerStatus(listen_type),
            stateUpdatedAt: dayjs()
        }
    });
    return playStates;
}

export const listenTypeAsPlayerStatus = (event: string): ReportedPlayerStatus => {
    switch (event) {
        case 'single':
        case 'playing_now':
            return REPORTED_PLAYER_STATUSES.playing;
        default:
            return REPORTED_PLAYER_STATUSES.unknown;
    }
}