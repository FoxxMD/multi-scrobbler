import dayjs from "dayjs";
import EventEmitter from "events";
import { type PlayObject, SOURCE_SOT } from "../../core/Atomic.js";
import {
    type ExpressRequest,
    type FormatPlayObjectOptions,
    type InternalConfig,
    NO_USER,
    type PlayerStateData,
    type PlayPlatformId,
    REPORTED_PLAYER_STATUSES,
    type ReportedPlayerStatus
} from "../common/infrastructure/Atomic.js";
import { type ListenbrainzEndpointSourceConfig } from "../common/infrastructure/config/source/endpointlz.js";
import { ListenbrainzApiClient, listenPayloadToPlay } from "../common/vendor/ListenbrainzApiClient.js";
import { type SubmitPayload } from '../common/vendor/listenbrainz/interfaces.js';
import { type ListenPayload } from '../common/vendor/listenbrainz/interfaces.js';
import MemorySource from "./MemorySource.js";
import { NowPlayingPlayerState } from "./PlayerState/NowPlayingPlayerState.js";
import { type Logger } from "@foxxmd/logging";
import { type PlayerStateOptions } from "./PlayerState/AbstractPlayerState.js";
import { parseRegexSingle } from "@foxxmd/regex-buddy-core";

const noSlugMatch = new RegExp(/(?:\/api\/listenbrainz\/?)$|(?:\/1\/?|\/1\/submit-listens\/?\/1\/validate-token\/|)$/i);
const slugMatch = new RegExp(/\/api\/listenbrainz\/([^\/]+)$/i);

export const authHeaderRegex = new RegExp(/Token (.+)$/i);

export class EndpointListenbrainzSource extends MemorySource {

    declare config: ListenbrainzEndpointSourceConfig;

    constructor(name: any, config: ListenbrainzEndpointSourceConfig, internal: InternalConfig, emitter: EventEmitter) {
        super('endpointlz', name, config, internal, emitter);
        this.multiPlatform = false;
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

    matchRequest(req: ExpressRequest): boolean {
        let matchesToken = this.config.data.token === undefined;
        const reqToken = parseTokenFromRequest(req);
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
        const slug = parseSlugFromRequest(req);
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
        const discovered = await this.discover(discoverable.map(x => x.play));
        if (discovered.length > 0) {
            await this.scrobble(discovered);
        }
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
        play.meta.sourceSOT = SOURCE_SOT.HISTORY;
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

export const parseTokenFromString = (str: string): string | undefined => {
    const tokenMatch = parseRegexSingle(authHeaderRegex, str);
    if(tokenMatch !== undefined) {
        return tokenMatch.groups[0];
    }
    return undefined;
}

export const parseTokenFromRequest = (req: ExpressRequest): string | false | undefined => {
    const auth = req.header('Authorization');
    if(typeof auth === 'string' && auth !== '') {
        const matchedToken = parseTokenFromString(auth);
        if(matchedToken === undefined) {
            return false;
        }
        return matchedToken;
    }
    return undefined;
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

export const parseIdentifiersFromRequest = (req: ExpressRequest): [string | false | undefined, false | string | undefined] => {
    const slug = parseSlugFromRequest(req);
    const token = parseTokenFromRequest(req);

    return [slug, token];
}

export const parseDisplayIdentifiersFromRequest = (req: ExpressRequest): [string, string] => {
    const [slug, token] = parseIdentifiersFromRequest(req);
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