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
import { ListenbrainzEndpointSourceConfig } from "../common/infrastructure/config/source/endpointlz.js";
import { ListenbrainzApiClient, ListenPayload, SubmitPayload } from "../common/vendor/ListenbrainzApiClient.js";
import { parseRegexSingleOrFail } from "../utils.js";
import MemorySource from "./MemorySource.js";

const noSlugMatch = new RegExp(/\/api\/listenbrainz(?:\/?|\/1\/?|\/1\/submit-listens\/?)$/i);
const slugMatch = new RegExp(/\/api\/listenbrainz\/([^\/]+)(?:\/?|\/1\/?|\/1\/submit-listens\/?)$/i);

export const authHeaderRegex = new RegExp(/Token (.+)$/i);

export class EndpointListenbrainzSource extends MemorySource {

    declare config: ListenbrainzEndpointSourceConfig;

    constructor(name: any, config: ListenbrainzEndpointSourceConfig, internal: InternalConfig, emitter: EventEmitter) {
        super('endpointlz', name, config, internal, emitter);
        this.multiPlatform = true;
        this.playerSourceOfTruth = SOURCE_SOT.HISTORY;

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

    static parseSlugFromString(path: string): string | false | undefined {
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

    static parseSlugFromRequest(req: ExpressRequest): string | false | undefined {
        return EndpointListenbrainzSource.parseSlugFromString(req.baseUrl);
    }

    static parseTokenFromString(str: string): string | undefined {
        const tokenMatch = parseRegexSingleOrFail(authHeaderRegex, str);
        if(tokenMatch !== undefined) {
            return tokenMatch.groups[0];
        }
        return undefined;
    }

    static parseTokenFromRequest(req: ExpressRequest): string | false | undefined {
        const auth = req.header('Authorization');
        if(typeof auth === 'string' && auth !== '') {
            const matchedToken = EndpointListenbrainzSource.parseTokenFromString(auth);
            if(matchedToken === undefined) {
                return false;
            }
            return matchedToken;
        }
        return undefined;
    }

    static parseIdentifiersFromRequest(req: ExpressRequest): [string | false | undefined, false | string | undefined] {
        const slug = EndpointListenbrainzSource.parseSlugFromRequest(req);
        const token = EndpointListenbrainzSource.parseTokenFromRequest(req);

        return [slug, token];
    }

    static parseDisplayIdentifiersFromRequest(req: ExpressRequest): [string, string] {
        const [slug, token] = EndpointListenbrainzSource.parseIdentifiersFromRequest(req);
        let slugStr = '(no slug)';
        if (slug === false) {
            slugStr = '(invalid slug)';
        } else if (slug !== undefined) {
            slugStr = slug;
        }

        let tokenStr = '(no token)';
        if (token === false) {
            tokenStr = '(invalid token)';
        } else if (token !== undefined) {
            tokenStr = `${token.substring(0,3)}****`
        }
        return [slugStr, tokenStr];
    }

    matchRequest(req: ExpressRequest): boolean {
        let matchesToken = this.config.data.token === undefined;
        const reqToken = EndpointListenbrainzSource.parseTokenFromRequest(req);
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
        const slug = EndpointListenbrainzSource.parseSlugFromRequest(req);
        if (slug === false) {
            return false;
        } else {
            matchesPath = (this.config.data.slug === undefined && slug === undefined) || (slug !== undefined && this.config.data.slug !== undefined && this.config.data.slug.toLowerCase().trim() === slug.toLocaleLowerCase().trim());
        }

        return matchesToken && matchesPath;
    }

    static listenTypeAsPlayerStatus(event: string): ReportedPlayerStatus {
        switch (event) {
            case 'single':
            case 'playing_now':
                return REPORTED_PLAYER_STATUSES.playing;
            default:
                return REPORTED_PLAYER_STATUSES.unknown;
        }
    }

    static formatPlayObj(obj: ListenPayload, options: FormatPlayObjectOptions & {
        nowPlaying?: boolean
    } = {}): PlayObject {
        return ListenbrainzApiClient.listenPayloadToPlay(obj, options.nowPlaying);
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

export const playStateFromRequest = (obj: SubmitPayload): PlayerStateData => {
    const {
        listen_type,
        payload,
    } = obj;

    const play = ListenbrainzApiClient.listenPayloadToPlay(payload[0], listen_type === 'playing_now');
    return {
        platformId: [play.meta.deviceId, NO_USER],
        play,
        status: listenTypeAsPlayerStatus(listen_type),
        timestamp: dayjs()
    }
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