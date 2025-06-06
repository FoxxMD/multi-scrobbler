import dayjs from "dayjs";
import EventEmitter from "events";
import request, { Request, Response, SuperAgent } from 'superagent';
import { PlayObject, SOURCE_SOT, TA_CLOSE, TA_FUZZY } from "../../core/Atomic.js";
import { DEFAULT_RETRY_MULTIPLIER, FormatPlayObjectOptions, InternalConfig, TRANSFORM_HOOK } from "../common/infrastructure/Atomic.js";
import { DeezerInternalSourceConfig, DeezerInternalTrackData, DeezerSourceConfig } from "../common/infrastructure/config/source/deezer.js";
import { parseRetryAfterSecsFromObj, playObjDataMatch, readJson, sleep, sortByOldestPlayDate, writeFile, } from "../utils.js";
import AbstractSource, { RecentlyPlayedOptions } from "./AbstractSource.js";
import { CookieJar, Cookie } from 'tough-cookie';
import { MixedCookieAgent } from 'http-cookie-agent/http';
import MemorySource from "./MemorySource.js";
import { genericSourcePlayMatch } from "../utils/PlayComparisonUtils.js";

interface DeezerHistoryResponse {
    errors: []
    results: {
        data: DeezerInternalTrackData[]
        error: string[]
    }
}

export default class DeezerInternalSource extends MemorySource {
    requiresAuth = true;
    requiresAuthInteraction = false;

    csrfToken?: string;

    agent: request.SuperAgentStatic & request.Request
    jar: CookieJar

    declare config: DeezerInternalSourceConfig;

    constructor(name: any, config: DeezerInternalSourceConfig, internal: InternalConfig, emitter: EventEmitter) {
        super('deezer', name, config, internal, emitter);
        const {
            data: {
                interval = 60,
                ...rest
            } = {},
        } = config;

        if (interval < 15) {
            this.logger.warn('Interval should be above 30 seconds...😬');
        }

        // @ts-expect-error not correct structure
        this.config.data = {
            ...rest,
            interval,
        };

        this.canPoll = true;
        this.canBacklog = true;
        this.supportsUpstreamRecentlyPlayed = true;
        this.playerSourceOfTruth = SOURCE_SOT.HISTORY;
        // https://developers.deezer.com/api/user/history
        // https://stackoverflow.com/a/19497151/1469797
        this.SCROBBLE_BACKLOG_COUNT = 50;

        this.jar = new CookieJar();
        const mixedAgent = new MixedCookieAgent({ cookies: { jar: this.jar } });
        this.agent = request.agent().use((req) => req.agent(mixedAgent));
    }

    static formatPlayObj(obj: DeezerInternalTrackData, options: FormatPlayObjectOptions = {}): PlayObject {
        const {newFromSource = false} = options;
        const play: PlayObject = {
            data: {
                artists: [obj.ART_NAME],
                album: obj.ALB_TITLE,
                track: obj.SNG_TITLE,
                duration: obj.DURATION,
                playDate: dayjs(obj.TS * 1000),
            },
            meta: {
                source: 'Deezer',
                trackId: obj.SNG_ID,
                newFromSource,
                url: {
                    web: `https://www.deezer.com/track/${obj.SNG_ID}`
                }
            }
        };
        if(obj.ALB_PICTURE !== undefined && obj.ALB_PICTURE !== '') {
            play.meta.art = {
                album: `https://cdn-images.dzcdn.net/images/cover/${obj.ALB_PICTURE}/500x500-000000-80-0-0.jpg`
            }
        }
        return play;
    }

    protected async doBuildInitData(): Promise<true | string | undefined> {
        this.logger.warn('This Source uses unofficial methods to access Deezer data that are likely against Deezer\'s TOS. Deezer may change or remove these methods at any time breaking functionality as well as revoke access to your account. Use this Source at your own risk.');
        if (this.config.data.arl === undefined) {
            throw new Error('arl must be defined in configuration');
        }
        this.jar.setCookie(`arl=${this.config.data.arl}; comeback=1`, 'https://www.deezer.com');
        return true;
    }

    protected async doCheckConnection(): Promise<true | string | undefined> {
        try {
            await request.get('https://deezer.com');
            return true;
        } catch (e) {
            throw e;
        }
    }

    doAuthentication = async () => {
        try {
            const req = this.agent.post('https://www.deezer.com/ajax/gw-light.php')
            .query({
                method: 'deezer.getUserData'
            })
            const resp = await this.callApi(req);
            return true;
        } catch (e) {
            throw e;
        }
    }

    getUpstreamRecentlyPlayed = async (options: RecentlyPlayedOptions = {}): Promise<PlayObject[]> => this.getRecentlyPlayed(options)

    getRecentlyPlayed = async (options: RecentlyPlayedOptions = {}) => {

        const req = this.agent.post('https://www.deezer.com/ajax/gw-light.php')
        .query({
            method: 'user.getSongsHistory'
        })
        .set('Content-Type', 'application/json')
        .send({
            nb: 30,
            start: 0
        });
        // returns listening history in descending order (newest to oldest)
        const resp = (await this.callApi(req)) as DeezerHistoryResponse;
        for(const e of resp.results.error) {
            this.logger.warn(`Error returned in history response: ${e}`);
        }
        const nonSong = resp.results.data.filter(x => x.__TYPE__ !== 'song');
        if(nonSong.length > 0) {
            const nonSongTypes = [];
            for(const n of nonSong) {
                if(!nonSongTypes.includes(n.__TYPE__)) {
                    nonSongTypes.push(n.__TYPE__);
                }
            }
            this.logger.debug(`Ignoring ${nonSong.length} entries in history with types of ${nonSongTypes.join(',')}`);
        }
        return resp.results.data.filter(x => x.__TYPE__ === 'song').map(x => DeezerInternalSource.formatPlayObj(x)).sort(sortByOldestPlayDate);
    }

    callApi = async (req: request.SuperAgentRequest, retries = 0) => {
        const {
            maxRequestRetries = 1,
            retryMultiplier = DEFAULT_RETRY_MULTIPLIER
        } = this.config.options;

        req.query({
            input: 3,
            api_version: '1.0',
            api_token: this.csrfToken ?? ''
           });
        setRequestHeaders(req);
        try {
            const resp = await req;
            const {
                body: {
                    error,
                    results
                } = {}
            } = resp;
            if('checkForm' in results) {
                this.csrfToken = results.checkForm;
            }
            if (error !== undefined && error.length > 0) {
                const err = new Error((error as string[]).join(' | '));
                throw  err;
            }
            return resp.body;
        } catch (e) {
            if(retries < maxRequestRetries) {
                const retryAfter = parseRetryAfterSecsFromObj(e) ?? (retryMultiplier * (retries + 1));
                this.logger.warn(`Request failed but retries (${retries}) less than max (${maxRequestRetries}), retrying request after ${retryAfter} seconds...`);
                await sleep(retryAfter * 1000);
                return await this.callApi(req, retries + 1)
            }
            const {
                message,
                response,
            } = e;
            const msg = response !== undefined ? `API Call failed: Server Response => ${response}` : `API Call failed: ${message}`;
            throw new Error(msg, {cause: e});
        }
    }

    protected getBackloggedPlays = async (options: RecentlyPlayedOptions = {}) => await this.getRecentlyPlayed({formatted: true, ...options})


    existingDiscovered = (play: PlayObject, opts: {checkAll?: boolean} = {}): PlayObject | undefined => {
        const lists: PlayObject[][] = this.getExistingDiscoveredLists(play, opts);
        const candidate = this.transformPlay(play, TRANSFORM_HOOK.candidate);
        for(const list of lists) {
            const existing = list.find(x => {
                const e = this.transformPlay(x, TRANSFORM_HOOK.existing);
                return genericSourcePlayMatch(e, candidate, TA_CLOSE);
            });
            if(existing) {
                return existing;
            }
            if(this.config.options?.fuzzyDiscoveryIgnore === true || this.config.options?.fuzzyDiscoveryIgnore === 'aggressive') {
                const fuzzyIndex = list.findIndex(x => {
                    const e = this.transformPlay(x, TRANSFORM_HOOK.existing);
                    return genericSourcePlayMatch(e, candidate, TA_FUZZY, {fuzzyDiffThreshold: this.config.options?.fuzzyDiscoveryIgnore === 'aggressive' ? 40 : undefined});
                });
                if(fuzzyIndex !== -1) {
                    if(this.config.options?.fuzzyDiscoveryIgnore === 'aggressive') {
                        // always return fuzzy match as existing
                        // likely will make MS miss scrobbles for repeated plays
                        return list[fuzzyIndex];
                    }
                    if(fuzzyIndex + 1 === list.length || playObjDataMatch(list[fuzzyIndex], list[fuzzyIndex + 1])) {
                        // last discovered play was this one, or next played play was also this one
                        // so we'll assume this means the play is on repeat, don't count as existing
                        return undefined;
                    }
                    // next played play was *not* this one (Deezer reports play between candidate TS and fuzzy match)
                    // so this is likely a duplicate deezer should not have reported
                    return list[fuzzyIndex];
                }
            }
        }
        return undefined;
    }
}

const setRequestHeaders = (req: Request, userAgent: string = 'Mozilla/5.0 (X11; Linux i686; rv:135.0) Gecko/20100101 Firefox/135.0') => {
    req
    .set('Pragma', 'no-cache')
    .set('Origin', 'https://www.deezer.com')
    .set('Accept-Encoding', 'gzip, deflate, br')
    .set('Accept-Language', 'en-US,en;q=0.9')
    .set('User-Agent', userAgent)
    .set('Accept', '*/*')
    .set('Cache-Control', 'no-cache')
    .set('X-Requested-With', 'XMLHttpRequest')
    .set('Connection', 'keep-alive')
    .set('Referer',  'https://www.deezer.com/login')
    .set('DNT', '1')

    const ct = req.get('Content-Type');
    if(ct === '' || ct === null || ct === undefined) {
            req.set('Content-Type', 'application/x-www-form-urlencoded; charset=UTF-8');
    }
}

const buildInternalUrl = (method: string, token: string = ''): URL => {
    const params = new URLSearchParams([
        ['api_version', '1.0'],
        ['input', '3']
    ]);
    params.append('method', method);
    params.append('api_token', token);

    const u = new URL(`https://www.deezer.com/ajax/gw-light.php?${params.toString()}`);

    return u;
}