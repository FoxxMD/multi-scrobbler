import { Logger } from "@foxxmd/logging";
import { WS } from "iso-websocket";
import objectHash from 'object-hash';
// @ts-expect-error weird typings?
import { Api, Jellyfin } from "@jellyfin/sdk";
import {
    // @ts-expect-error weird typings?
    AuthenticationResult,
    // @ts-expect-error weird typings?
    BaseItemDto,
    // @ts-expect-error weird typings?
    BaseItemKind,
    // @ts-expect-error weird typings?
    ItemSortBy,
    // @ts-expect-error weird typings?
    MediaType,
    // @ts-expect-error weird typings?
    SessionInfo,
    // @ts-expect-error weird typings?
    SortOrder, UserDto,
} from "@jellyfin/sdk/lib/generated-client/index.js";
import {
    // @ts-expect-error weird typings?
    getItemsApi,
    // @ts-expect-error weird typings?
    getSessionApi,
    // @ts-expect-error weird typings?
    getSystemApi,
    // @ts-expect-error weird typings?
    getUserApi,
    // @ts-expect-error weird typings?
    getApiKeyApi,
    // @ts-expect-error weird typings?
    getActivityLogApi
} from "@jellyfin/sdk/lib/utils/api/index.js";
import dayjs from "dayjs";
import EventEmitter from "events";
import { nanoid } from "nanoid";
import pEvent from "p-event";
import { Simulate } from "react-dom/test-utils";
import { PlayObject } from "../../core/Atomic.js";
import { buildTrackString, truncateStringToLength } from "../../core/StringUtils.js";
import {
    FormatPlayObjectOptions,
    InternalConfig,
    PlayerStateData,
    PlayerStateDataMaybePlay,
    PlayPlatformId, REPORTED_PLAYER_STATUSES
} from "../common/infrastructure/Atomic.js";
import { JellyApiSourceConfig } from "../common/infrastructure/config/source/jellyfin.js";
import { combinePartsToString, parseBool, } from "../utils.js";
import { parseArrayFromMaybeString } from "../utils/StringUtils.js";
import MemorySource from "./MemorySource.js";
import { PlayerStateOptions } from "./PlayerState/AbstractPlayerState.js";
import { JellyfinPlayerState } from "./PlayerState/JellyfinPlayerState.js";

const shortDeviceId = truncateStringToLength(10, '');

export default class JellyfinApiSource extends MemorySource {
    users: string[] = [];

    client: Jellyfin
    api: Api
    wsClient!: WS;
    address!: string;
    user!: UserDto

    deviceId: string;

    usersAllow: string[] = [];
    usersBlock: string[] = [];
    devicesAllow: string[] = [];
    devicesBlock: string[] = [];

    multiPlatform: boolean = true;

    logFilterFailure: false | 'debug' | 'warn';

    declare config: JellyApiSourceConfig;

    constructor(name: any, config: JellyApiSourceConfig, internal: InternalConfig, emitter: EventEmitter) {
        super('jellyfin', name, config, internal, emitter);
        this.canPoll = true;
        this.requiresAuth = true;
        this.deviceId = `${name}-ms${internal.version}-${truncateStringToLength(10, '')(objectHash.sha1(config))}`;

        this.client = new Jellyfin({
            clientInfo: {
                name: 'Multi-Scrobbler',
                version: internal.version
            },
            deviceInfo: {
                name: `MS - ${name}`,
                id: this.deviceId
            }
        });
    }

    protected async doBuildInitData(): Promise<true | string | undefined> {
        const {
            data: {
                user,
                password,
                apiKey,
                usersAllow = [user],
                usersBlock = [],
                devicesAllow = [],
                devicesBlock = []
            } = {},
            options: {
                logFilterFailure = (parseBool(process.env.DEBUG_MODE) ? 'debug' : 'warn')
            } = {}
        } = this.config;

        if((password === undefined || password.trim() === '') && (apiKey === undefined || apiKey.trim() === '')) {
            throw new Error(`Either 'password' or 'apiKey' must be specified in config data`);
        }

        if (logFilterFailure !== false && !['debug', 'warn'].includes(logFilterFailure)) {
            this.logger.warn(`logFilterFailure value of '${logFilterFailure.toString()}' is NOT VALID. Logging will not occur if filters fail. You should fix this.`);
        } else {
            this.logFilterFailure = logFilterFailure;
        }

        if(usersAllow === true) {
            this.usersAllow = [];
        } else {
            const ua = parseArrayFromMaybeString(usersAllow, {lower: true});
            if(ua.length === 1 && ua[0] === 'true') {
                this.usersAllow = [];
            } else {
                this.usersAllow = ua;
            }
        }
        this.usersBlock = parseArrayFromMaybeString(usersBlock, {lower: true});
        this.devicesAllow = parseArrayFromMaybeString(devicesAllow, {lower: true});
        this.devicesBlock = parseArrayFromMaybeString(devicesBlock, {lower: true});

        return true;
    }

    protected buildWSClient(url: string, token: string) {
        this.wsClient = new WS(`ws://${url}/socket?api_key=${token}&deviceId=${Buffer.from(this.deviceId).toString('base64')}`, {
            automaticOpen: false,
            retry: {
                retries: 0
            }
        });
        this.wsClient.addEventListener('close', (e) => {
            this.logger.warn(`Connection was closed: ${e.code} => ${e.reason}`, {labels: 'WS'});
        });
        this.wsClient.addEventListener('open', (e) => {
            this.logger.verbose(`Connection was established.`, {labels: 'WS'});
        });
        this.wsClient.addEventListener('message', (e) => {
            this.logger.debug(e.data, {labels: 'WS'});
        });
    }

    protected async doCheckConnection(): Promise<true | string | undefined> {
        try {
            const servers = await this.client.discovery.getRecommendedServerCandidates(this.config.data.url);
            const best = this.client.discovery.findBestServer(servers);
            this.api = this.client.createApi(best.address);
            this.address = best.address;
            const info = await getSystemApi(this.api).getPublicSystemInfo();
            return `Found Server ${info.data.ServerName} (${info.data.Version})`;
        } catch (e) {
            throw e;
        }
    }

    /**
     * https://gist.github.com/nielsvanvelzen/ea047d9028f676185832e51ffaf12a6f
     * */
    protected doAuthentication = async (): Promise<boolean> => {
        try {

            let token: string;
            if(this.config.data.password !== undefined) {
                const auth = await this.api.authenticateUserByName(this.config.data.user,this.config.data.password);
                this.user = auth.data.User;
                token = auth.data.AccessToken;
                this.logger.info(`Authenticated with user ${this.user.Name}`);

                // not in use for now
                //this.buildWSClient(this.address, token);
            } else {
                this.api.accessToken = this.config.data.apiKey;
                token = this.config.data.apiKey;
                const users = await getUserApi(this.api).getUsers();
                for(const user of users.data) {
                    if(user.Name.toLocaleLowerCase() === this.config.data.user.toLocaleLowerCase()) {
                        this.user = user;
                        break;
                    }
                }
                this.logger.info(`Authenticated with API Key on behalf of user ${this.user.Name}`);
            }
            return true;
        } catch (e) {
            throw e;
        }
    }

    isActivityValid = (deviceId: string, user: string, play: PlayObject): boolean | string => {
        if(this.usersAllow.length > 0 && !this.usersAllow.includes(user.toLocaleLowerCase())) {
            return `'usersAllow does not include user ${user}`;
        }
        if(this.usersBlock.length > 0 && this.usersBlock.includes(user.toLocaleLowerCase())) {
            return `'usersBlock includes user ${user}`;
        }

        if(this.devicesAllow.length > 0 && !this.devicesAllow.some(x => deviceId.toLocaleLowerCase().includes(x))) {
            return `'devicesAllow does not include a phrase found in ${deviceId}`;
        }
        if(this.devicesBlock.length > 0 && this.devicesBlock.some(x => deviceId.toLocaleLowerCase().includes(x))) {
            return `'devicesBlock includes a phrase found in ${deviceId}`;
        }
        if(play.meta.mediaType !== MediaType.Audio) {
            if(play.meta.mediaType === MediaType.Unknown && this.config.data.allowUnknown) {
                return true;
            }
            return `media type ${play.meta.mediaType} is not allowed`;
        }
        return true;
    }

    static formatPlayObj(obj: BaseItemDto, options: FormatPlayObjectOptions = {}): PlayObject {

        const {
            Album,
            AlbumId,
            AlbumArtists = [],
            Artists = [],
            ArtistItems = [],
            Id,
            MediaType: md, // should be MediaType.Audio
            Name, // track title
            ServerId,
            RunTimeTicks,
            Type, // should be BaseItemKind.Audio
            UserData,
        } = obj;

        return {
            data: {
                artists: Artists,
                album: Album,
                track: Name,
                albumArtists: AlbumArtists !== undefined ? AlbumArtists.map(x => x.Name) : undefined,
                playDate: UserData !== undefined ? dayjs(UserData.LastPlayedDate) : undefined,
                duration: RunTimeTicks !== undefined ? ticksToSeconds(RunTimeTicks) : undefined
            },
            meta: {
                trackId: Id,
                server: ServerId,
                mediaType: md,
                source: 'Jellyfin',
            }
        }
    }

    getRecentlyPlayed = async (options = {}) => {

        // itemUserData.data.Items[0].UserData.LastPlayedDate
        // time when track was started playing
        // 'played' is always true, for some reason
        // const itemUserData = await getItemsApi(this.api).getItems({
        //     userId: this.user.Id,
        //     enableUserData: true,
        //     sortBy: ItemSortBy.DatePlayed,
        //     sortOrder: [SortOrder.Descending],
        //     //fields: [ItemFields.],
        //     excludeItemTypes: [BaseItemKind.CollectionFolder],
        //     includeItemTypes: [BaseItemKind.Audio],
        //     recursive: true,
        //     limit: 50,
        // });


        // for potential future use with offline scrobbling?
        //const activities = await getActivityLogApi(this.api).getLogEntries({hasUserId: true, minDate: dayjs().subtract(1, 'day').toISOString()});
        //const items = await getItemsApi(this.api).getItems({ids: ['ID']});
        //const userData = await getItemsApi(this.api).getItemUserData({itemId: 'ID', userId: this.user.Id});

        const sessions = await getSessionApi(this.api).getSessions();
        const nonMSSessions = sessions.data
        .filter(x => x.DeviceId !== this.deviceId)
        .map(x => this.sessionToPlayerState(x))
        .filter((x: PlayerStateDataMaybePlay) => x.play !== undefined) as PlayerStateData[];
        const validSessions: PlayerStateData[] = [];

        for(const session of nonMSSessions) {
            const validPlay = this.isActivityValid(session.platformId[0], session.platformId[1], session.play);
            if(validPlay === true) {
                validSessions.push(session);
            } else if(this.logFilterFailure !== false) {
                this.logger[this.logFilterFailure](`Player State for  -> ${buildTrackString(session.play, {include: ['artist', 'track', 'platform']})} <-- is being dropped because ${validPlay}`);
            }
        }
        return this.processRecentPlays(validSessions);
    }

    sessionToPlayerState = (obj: SessionInfo): PlayerStateDataMaybePlay => {

        const {
            UserName,
            UserId,
            NowPlayingItem,
            DeviceId,
            DeviceName,
            Client,
            LastActivityDate,
            PlayState: {
                PositionTicks,
                IsPaused
            }
        } = obj;

        const msDeviceId = combinePartsToString([shortDeviceId(DeviceId), DeviceName, Client]);
        const playerPosition = PositionTicks !== undefined ? ticksToSeconds(PositionTicks) : undefined; // dayjs.duration(PositionTicks / 1000, 'ms').asSeconds() : undefined;

        let play: PlayObject | undefined;
        if(NowPlayingItem !== undefined) {
            const sessionPlay = JellyfinApiSource.formatPlayObj(NowPlayingItem);
            play = {
                data: {
                    ...sessionPlay.data
                },
                meta: {
                    ...sessionPlay.meta,
                    user: UserName ?? UserId,
                    deviceId: msDeviceId,
                    trackProgressPosition: playerPosition
                }
            }
        }

        let reportedStatus = REPORTED_PLAYER_STATUSES.stopped;
        if(NowPlayingItem !== undefined) {
            reportedStatus = IsPaused ? REPORTED_PLAYER_STATUSES.paused : REPORTED_PLAYER_STATUSES.playing;
        }

        return {
            platformId: [msDeviceId, UserName ?? UserId],
            play,
            status: reportedStatus,
            position: playerPosition,
            //timestamp: LastActivityDate !== undefined ? dayjs(LastActivityDate) : undefined
        }
    }

    getNewPlayer = (logger: Logger, id: PlayPlatformId, opts: PlayerStateOptions) => new JellyfinPlayerState(logger, id, opts)
}

/**
 * https://github.com/jellyfin/jellyfin-web/pull/1866/files#diff-08dcbf5550945f2ee7ace7c72d8b367bbeb77f23b4610b450e1b7decb0fc9363
* */
const ticksToSeconds = (ticks: number) => {
    if (typeof ticks === 'number') {
        return ticks / 10000000;
    } else {
        return ticks; // Undefined or not a number.
    }
}

/**
 * https://github.com/jellyfin/jellyfin-web/pull/1866/files#diff-08dcbf5550945f2ee7ace7c72d8b367bbeb77f23b4610b450e1b7decb0fc9363
 * */
const ticksToMs = (ticks: number) => {
    if (typeof ticks === 'number') {
        return ticks / 10000;
    } else {
        return ticks; // Undefined or not a number.
    }
}
