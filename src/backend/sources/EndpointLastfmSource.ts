import dayjs from "dayjs";
import EventEmitter from "events";
import { PlayObject, SOURCE_SOT } from "../../core/Atomic.js";
import {
    ExpressRequest,
    FormatPlayObjectOptions,
    InternalConfig,
    NO_USER,
    PlayerStateData,
    REPORTED_PLAYER_STATUSES,
    ReportedPlayerStatus
} from "../common/infrastructure/Atomic.js";
import { parseRegexSingleOrFail } from "../utils.js";
import MemorySource from "./MemorySource.js";
import { LastFMEndpointSourceConfig } from "../common/infrastructure/config/source/endpointlfm.js";
import { LastfmTrackUpdateRequest, NowPlayingPayload, TrackScrobblePayload } from "lastfm-node-client";
import { scrobblePayloadToPlay } from "../common/vendor/LastfmApiClient.js";

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

    static formatPlayObj(obj: LastfmTrackUpdateRequest, options: FormatPlayObjectOptions = {}): PlayObject {
        return scrobblePayloadToPlay(obj);
    }

    getRecentlyPlayed = async (options = {}) => {
        return this.getFlatRecentlyDiscoveredPlays();
    }

    isValidScrobble = (playObj: PlayObject) => {
        return true;
    }

    handle = async (stateData: PlayerStateData) => {

        this.processRecentPlays([stateData]);

        if (stateData.play.meta.nowPlaying === false && this.isValidScrobble(stateData.play)) {
            const discovered = this.discover([stateData.play]);
            if (discovered.length > 0) {
                this.scrobble(discovered);
            }
        }
    }
}

export const playStateFromRequest = (obj: LastfmTrackUpdateRequest): PlayerStateData => {

    const play = scrobblePayloadToPlay(obj);
    return {
        platformId: [play.meta.deviceId, NO_USER],
        play,
        status: obj.method === 'track.updateNowPlaying' ? REPORTED_PLAYER_STATUSES.playing : REPORTED_PLAYER_STATUSES.unknown,
        timestamp: dayjs()
    }
}

export const parseSlugFromString = (path: string): string | false | undefined => {
    const noSlug = parseRegexSingleOrFail(noSlugMatch, path);
    if (noSlug !== undefined) {
        return undefined;
    }
    const slugResult = parseRegexSingleOrFail(slugMatch, path);
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