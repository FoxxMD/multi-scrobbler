import dayjs from "dayjs";
import EventEmitter from "events";
import { type PlayObject, SOURCE_SOT } from "../../core/Atomic.ts";
import {
    type ExpressRequest,
    type FormatPlayObjectOptions,
    type InternalConfig,
    NO_USER,
    type PlayerStateData,
    REPORTED_PLAYER_STATUSES,
    type ReportedPlayerStatus
} from "../common/infrastructure/Atomic.ts";
import { type PlayPlatformId } from '../../core/Atomic.ts';
import MemorySource from "./MemorySource.ts";
import { type LastFMEndpointSourceConfig } from "../common/infrastructure/config/source/endpointlfm.ts";
import { type LastFMScrobbleRequestPayload, scrobblePayloadToPlay } from "../common/vendor/LastfmApiClient.ts";
import { type Logger } from "@foxxmd/logging";
import { type PlayerStateOptions } from "./PlayerState/AbstractPlayerState.ts";
import { NowPlayingPlayerState } from "./PlayerState/NowPlayingPlayerState.ts";
import { parseRegexSingle } from "@foxxmd/regex-buddy-core";

const noSlugMatch = new RegExp(/(?:\/api\/lastfm\/?)$|(?:\/1\/?|\/2.0\/?)$/i);
const slugMatch = new RegExp(/\/api\/lastfm\/([^\/]+)$/i);

export const authHeaderRegex = new RegExp(/Token (.+)$/i);

export class EndpointLastfmSource extends MemorySource {

    declare config: LastFMEndpointSourceConfig;

    constructor(name: any, config: LastFMEndpointSourceConfig, internal: InternalConfig, emitter: EventEmitter) {
        super('endpointlfm', name, config, internal, emitter);
        this.multiPlatform = false;
        this.playerSourceOfTruth = SOURCE_SOT.HISTORY;

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

    matchRequest(req: ExpressRequest): boolean {
        let matchesPath = false;
        const slug = parseSlugFromRequest(req);
        if (slug === false) {
            return false;
        } else {
            matchesPath = (this.config.data.slug === undefined && slug === undefined) || (slug !== undefined && this.config.data.slug !== undefined && this.config.data.slug.toLowerCase().trim() === slug.toLocaleLowerCase().trim());
        }

        return matchesPath;
    }

    static formatPlayObj(obj: LastFMScrobbleRequestPayload, options: FormatPlayObjectOptions = {}): PlayObject {
        return scrobblePayloadToPlay(obj);
    }

    getRecentlyPlayed = async (options = {}) => {
        return await this.getFlatRecentlyDiscoveredPlays();
    }

    isValidScrobble = (playObj: PlayObject) => {
        return true;
    }

    handle = async (stateData: PlayerStateData) => {

        if(stateData[0].play.meta.nowPlaying === true) {
            this.setStatus('Received Now Playing');
        } else {
            this.setStatus('Received Play');
        }
        await this.processRecentPlays([stateData]);

        if (stateData.play.meta.nowPlaying === false && this.isValidScrobble(stateData.play)) {
            const discovered = await this.discover([stateData.play]);
            if (discovered.length > 0) {
                await this.scrobble(discovered);
            }
        }
        this.componentRepo.updateById(this.dbComponent.id, {lastActiveAt: dayjs()});
        this.setStatus('Waiting for Plays');
    }

    protected async postInitialize(): Promise<void> {
        this.setStatus('Waiting for Plays');
    }

    getNewPlayer = (logger: Logger, id: PlayPlatformId, opts: PlayerStateOptions) => new NowPlayingPlayerState(logger,  id, opts);
}

export const playStateFromRequest = (obj: LastFMScrobbleRequestPayload): PlayerStateData => {

    const play = scrobblePayloadToPlay(obj);
    play.meta.sourceSOT = SOURCE_SOT.HISTORY;
    return {
        platformId: [play.meta.deviceId, NO_USER],
        play,
        status: obj.method === 'track.updateNowPlaying' ? REPORTED_PLAYER_STATUSES.playing : REPORTED_PLAYER_STATUSES.unknown,
        stateUpdatedAt: dayjs()
    }
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

export const parseSlugFromRequest = (req: ExpressRequest): string | false | undefined => parseSlugFromString(req.baseUrl);

export const parseIdentifiersFromRequest = (req: ExpressRequest): [string | false | undefined] => {
    const slug = parseSlugFromRequest(req);

    return [slug];
}

export const parseDisplayIdentifiersFromRequest = (req: ExpressRequest): [string] => {
    const [slug] = parseIdentifiersFromRequest(req);
    let slugStr = '(no slug)';
    if (slug === false) {
        slugStr = '(invalid slug)';
    } else if (slug !== undefined) {
        slugStr = slug;
    }
    return [slugStr];
}