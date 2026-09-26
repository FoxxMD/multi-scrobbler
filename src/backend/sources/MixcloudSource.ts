import dayjs from "dayjs";
import type EventEmitter from "events";
import request from 'superagent';
import { PARSED_FROM, type PlayObject, type PlayObjectMinimal } from "../../core/Atomic.ts";
import { artistNamesToCredits } from "../../core/StringUtils.ts";
import type { FormatPlayObjectOptions, InternalConfig } from "../common/infrastructure/Atomic.ts";
import type { MixcloudListen, MixcloudSourceConfig } from "../common/infrastructure/config/source/mixcloud.ts";
import { sortByOldestPlayDate } from "../utils.ts";
import { baseFormatPlayObj } from "../utils/PlayTransformUtils.ts";
import AbstractSource, { type RecentlyPlayedOptions } from "./AbstractSource.ts";

export default class MixcloudSource extends AbstractSource {

    baseUrl = 'https://api.mixcloud.com';

    declare config: MixcloudSourceConfig;

    constructor(name: any, config: MixcloudSourceConfig, internal: InternalConfig, emitter: EventEmitter) {
        const {
            data: {
                interval = 60,
                maxInterval = 300,
                ...restData
            } = {}
        } = config;
        super('mixcloud', name, {...config, data: {interval, maxInterval, ...restData}}, internal, emitter);
        this.canPoll = true;
        this.canBacklog = true;
        this.supportsUpstreamRecentlyPlayed = true;
        // https://www.mixcloud.com/developers/#pagination
        this.SCROBBLE_BACKLOG_COUNT = 50;
    }

    static formatPlayObj(obj: MixcloudListen, options: FormatPlayObjectOptions = {}): PlayObject {
        const {newFromSource = false} = options;
        const {
            key,
            url,
            name,
            audio_length,
            listen_time,
            user,
            hosts = [],
            pictures = {},
        } = obj;

        // Mixcloud does not expose tracklists through the public API so a listen is always an entire mix
        // prefer credited hosts (DJs) as artists and fall back to the account that uploaded the mix
        const artists = hosts.length > 0 ? hosts.map(x => x.name) : [user.name];

        const play: PlayObjectMinimal = {
            data: {
                artists: artistNamesToCredits(artists),
                track: name,
                duration: audio_length,
                playDate: dayjs(listen_time),
            },
            meta: {
                source: 'Mixcloud',
                musicService: 'Mixcloud',
                trackId: key,
                newFromSource,
                url: {
                    web: url
                },
                art: {
                    track: pictures.large ?? pictures.medium
                }
            }
        }
        return baseFormatPlayObj(obj, play);
    }

    protected async doBuildInitData(): Promise<true | string | undefined> {
        if (this.config.data.username === undefined || this.config.data.username.trim() === '') {
            throw new Error('username must be defined');
        }
        return true;
    }

    protected async doCheckConnection(): Promise<true | string | undefined> {
        // also verifies the configured user exists
        await this.callApi(`/${encodeURIComponent(this.config.data.username)}/`);
        return true;
    }

    getUpstreamRecentlyPlayed = async (options: RecentlyPlayedOptions = {}): Promise<PlayObject[]> => this.getRecentlyPlayed(options)

    getRecentlyPlayed = async (options: RecentlyPlayedOptions = {}): Promise<PlayObject[]> => {
        const {limit = 20} = options;
        this.setStatus('Checking for new Plays');
        const body = await this.callApi(`/${encodeURIComponent(this.config.data.username)}/listens/`, {limit});
        const listens: MixcloudListen[] = body.data ?? [];
        return listens
            .filter(x => x.listen_time !== undefined)
            .map(x => {
                const play = MixcloudSource.formatPlayObj(x);
                play.meta.parsedFrom = PARSED_FROM.history;
                return play;
            })
            .sort(sortByOldestPlayDate);
    }

    protected getBackloggedPlays = async (options: RecentlyPlayedOptions = {}) => await this.getRecentlyPlayed({formatted: true, ...options})

    callApi = async (path: string, query: Record<string, any> = {}): Promise<any> => {
        try {
            // Mixcloud serves JSON as text/javascript so superagent will not parse it by default
            const resp = await request.get(`${this.baseUrl}${path}`)
                .query(query)
                .buffer(true)
                .parse(request.parse['application/json']);
            return resp.body;
        } catch (e: any) {
            // Mixcloud returns errors as {"error": {"type": "...", "message": "..."}}
            const {
                type,
                message
            } = e?.response?.body?.error ?? {};
            if (message !== undefined) {
                throw new Error(`Mixcloud API returned an error (${e.status} ${type ?? 'unknown'}): ${message}`, {cause: e});
            }
            throw e;
        }
    }
}
