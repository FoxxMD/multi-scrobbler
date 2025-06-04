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
    SortOrder, UserDto, VirtualFolderInfo, CollectionType, CollectionTypeOptions, ImageUrlsApi
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
    getLibraryStructureApi,
    // @ts-expect-error weird typings?
    getImageApi,

} from "@jellyfin/sdk/lib/utils/api/index.js";
import {
    // @ts-expect-error weird typings?
    SystemInfoIssue
} 
from "@jellyfin/sdk/lib/index.js";
import dayjs from "dayjs";
import EventEmitter from "events";
import { nanoid } from "nanoid";
import pEvent from "p-event";
import { Simulate } from "react-dom/test-utils";
import { BrainzMeta, PlayObject } from "../../core/Atomic.js";
import { buildTrackString, combinePartsToString, truncateStringToLength } from "../../core/StringUtils.js";
import {
    FormatPlayObjectOptions,
    InternalConfig,
    PlayerStateData,
    PlayerStateDataMaybePlay,
    PlayPlatformId, REPORTED_PLAYER_STATUSES
} from "../common/infrastructure/Atomic.js";
import { JellyApiSourceConfig } from "../common/infrastructure/config/source/jellyfin.js";
import { genGroupIdStr, getPlatformIdFromData, isDebugMode, parseBool, } from "../utils.js";
import { joinedUrl } from "../utils/NetworkUtils.js";
import { parseArrayFromMaybeString } from "../utils/StringUtils.js";
import { MemoryPositionalSource } from "./MemoryPositionalSource.js";
import { FixedSizeList } from "fixed-size-list";

const shortDeviceId = truncateStringToLength(10, '');

export default class JellyfinApiSource extends MemoryPositionalSource {
    users: string[] = [];

    client: Jellyfin
    api: Api
    imageApi!: ImageUrlsApi
    wsClient!: WS;
    address!: string;
    user!: UserDto

    deviceId: string;

    usersAllow: string[] = [];
    usersBlock: string[] = [];
    devicesAllow: string[] = [];
    devicesBlock: string[] = [];
    librariesAllow: string[] = [];
    librariesBlock: string[] = [];
    allowedLibraryTypes: CollectionType[] = [];

    logFilterFailure: false | 'debug' | 'warn';

    mediaIdsSeen: FixedSizeList<string>;
    uniqueDropReasons: FixedSizeList<string>;

    libraries: {name: string, paths: string[], collectionType: CollectionType}[] = [];

    declare config: JellyApiSourceConfig;

    constructor(name: any, config: JellyApiSourceConfig, internal: InternalConfig, emitter: EventEmitter) {
        super('jellyfin', name, config, internal, emitter);
        this.canPoll = true;
        this.multiPlatform = true;
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

        this.uniqueDropReasons = new FixedSizeList<string>(100);
        this.mediaIdsSeen = new FixedSizeList<string>(100);
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
                devicesBlock = [],
                librariesAllow = [],
                librariesBlock = [],
                additionalAllowedLibraryTypes = [],
            } = {},
            options: {
                logFilterFailure = (isDebugMode() ? 'debug' : 'warn')
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
        this.librariesAllow = parseArrayFromMaybeString(librariesAllow, {lower: true});
        this.librariesBlock = parseArrayFromMaybeString(librariesBlock, {lower: true});
        this.allowedLibraryTypes = Array.from(new Set(['music', ...parseArrayFromMaybeString(additionalAllowedLibraryTypes, {lower: true})]));

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
            if(servers.length === 0) {
                throw new Error(`No servers were parseable from the given Jellyfin URL ${this.config.data.url}`);
            }
            const best = this.client.discovery.findBestServer(servers);
            if(best === undefined) {
                for(const s of servers) {
                    const sysError = s.issues.find(x => x instanceof SystemInfoIssue);
                    if(sysError !== undefined) {
                        this.logger.warn(new Error(`Server ${s.address} failed to communicate or something went wrong (SystemInfoIssue)`, {cause: sysError.error}));
                    } else {
                        for(const i of s.issues) {
                            this.logger.warn(`Server ${s.address} has an issue (${i.constructor.name})`)
                        }
                    }
                }
                throw new Error('Unable to determine a valid Server to connect to. See warnings above.');
            }
            this.api = this.client.createApi(best.address);
            this.imageApi = getImageApi(this.api);
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

    // protected getItemFromLibrary = async (id: string, virtualFolderId: string) => {
    //     const items = await getItemsApi(this.api).getItems({
    //         // NowPlayingItem.Id
    //         ids: [id], 
    //         // does not work, always returns item anyway
    //         parentId: virtualFolderId
    //     });
    // }

    protected buildLibraryInfo = async () => {
        try {
            const virtualResp = await getLibraryStructureApi(this.api).getVirtualFolders();
            const folders = virtualResp.data as VirtualFolderInfo[];
            this.libraries = folders.map(x => ({name: x.Name, paths: x.Locations, collectionType: x.CollectionType}));
        } catch (e) {
            throw new Error('Unable to get server Libraries and paths', {cause: e});
        }

    }

    getAllowedLibraries = () => {
        if(this.librariesAllow.length === 0) {
            return [];
        }
        return this.libraries.filter(x => this.librariesAllow.includes(x.name.toLocaleLowerCase()));
    }

    getBlockedLibraries = () => {
        if(this.librariesBlock.length === 0) {
            return [];
        }
        return this.libraries.filter(x => this.librariesBlock.includes(x.name.toLocaleLowerCase()));
    }

    getValidLibraries = () => this.libraries.filter(x => this.allowedLibraryTypes.includes(x.collectionType))

    onPollPostAuthCheck = async () => {
        try {
            await this.buildLibraryInfo();
            return true;
        } catch (e) {
            this.logger.error(new Error('Cannot start polling because JF prerequisite data could not be built', {cause: e}));
            return false;
        }
    }

    isActivityValid = (state: PlayerStateDataMaybePlay, session: SessionInfo): boolean | string => {
        if(this.usersAllow.length > 0 && !this.usersAllow.includes(state.platformId[1].toLocaleLowerCase())) {
            return `'usersAllow does not include user ${state.platformId[1]}`;
        }
        if(this.usersBlock.length > 0 && this.usersBlock.includes(state.platformId[1].toLocaleLowerCase())) {
            return `'usersBlock includes user ${state.platformId[1]}`;
        }

        if(this.devicesAllow.length > 0 && !this.devicesAllow.some(x => state.platformId[0].toLocaleLowerCase().includes(x))) {
            return `'devicesAllow does not include a phrase found in ${state.platformId[0]}`;
        }
        if(this.devicesBlock.length > 0 && this.devicesBlock.some(x => state.platformId[0].toLocaleLowerCase().includes(x))) {
            return `'devicesBlock includes a phrase found in ${state.platformId[0]}`;
        }


        if(session.NowPlayingItem !== undefined) {
            const allowedLibraries = this.getAllowedLibraries();
            if(allowedLibraries.length > 0 && !allowedLibraries.map(x => x.paths).flat(1).some(x => session.NowPlayingItem.Path.includes(x))) {
                return `media not included in librariesAllow`;
            }
            
            if(allowedLibraries.length === 0) {
                const blockedLibraries = this.getBlockedLibraries();
                if(blockedLibraries.length > 0) {
                    const blockedLibrary = blockedLibraries.find(x => x.paths.some(y => session.NowPlayingItem.Path.includes(y)));
                    if(blockedLibrary !== undefined) {
                        return `media included in librariesBlock '${blockedLibrary.name}'`;
                    }
                }
    
                if(!this.getValidLibraries().map(x => x.paths).flat(1).some(x => session.NowPlayingItem.Path.includes(x))) {
                    return `media not included in a valid library`;
                }
            }
        }

        if(state.play !== undefined) {
            if(state.play.meta.mediaType !== MediaType.Audio
                && (state.play.meta.mediaType !== MediaType.Unknown
                    || state.play.meta.mediaType === MediaType.Unknown && !this.config.data.allowUnknown
                )
            ) {
                return `media detected as ${state.play.meta.mediaType} (MediaType) is not allowed`;
            }
        }

        if(session.NowPlayingItem !== undefined) {
            if('ExtraType' in session.NowPlayingItem && session.NowPlayingItem.ExtraType === 'ThemeSong'/* 
                || play.data.track === 'theme' && 
                (play.data.artists === undefined || play.data.artists.length === 0) */) {
                    return `media detected as a ThemeSong (ExtraType) is not allowed`;
            }
            if(session.NowPlayingItem.Type !== 'Audio') {
                    return `media detected as a ${session.NowPlayingItem.Type} (Type) is not allowed`;
            }
        }

        return true;
    }

    formatPlayObjAware(obj: BaseItemDto, options: FormatPlayObjectOptions = {}): PlayObject {
        const play = JellyfinApiSource.formatPlayObj(obj, options);

        const {
            ParentId,
            AlbumId,
            AlbumPrimaryImageTag,
            ServerId
        } = obj;


        if(AlbumId !== undefined && AlbumPrimaryImageTag !== undefined) {
            const existingArt = play.meta?.art || {};
            existingArt.album = this.imageApi.getItemImageUrlById(AlbumId, undefined, {maxHeight: 500});
            play.meta.art = existingArt;
        }
        if(ParentId !== undefined) {
            const u = joinedUrl(new URL(this.address), '/web/#/details')
            u.searchParams.append('id', ParentId);
            u.searchParams.append('serviceId', ServerId);
            play.meta.url = {
                ...(play.meta?.url || {}),
                web: u.toString().replace('%23', '#')
            }
        }

        return play;
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
            ProviderIds = {}
        } = obj;

        const meta: BrainzMeta = {};

        if(ProviderIds.MusicBrainzAlbum !== undefined) {
            meta.album = ProviderIds.MusicBrainzAlbum;
        }
        if(ProviderIds.MusicBrainzTrack !== undefined) {
            meta.track = ProviderIds.MusicBrainzTrack;
        }
        if(ProviderIds.MusicBrainzTrack !== undefined) {
            meta.track = ProviderIds.MusicBrainzTrack;
        }
        if(ProviderIds.MusicBrainzArtist !== undefined) {
            meta.artist = [ProviderIds.MusicBrainzArtist];
        }
        if(ProviderIds.MusicBrainzAlbumArtist !== undefined) {
            meta.albumArtist = ProviderIds.MusicBrainzAlbumArtist;
        }

        const play: PlayObject = {
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
        if(Object.keys(meta).length > 0) {
            play.data.meta = { brainz: meta };
        }
        return play;
    }

    getRecentlyPlayed = async (options = {}) => {

        // for potential future use with offline scrobbling?
        //const activities = await getActivityLogApi(this.api).getLogEntries({hasUserId: true, minDate: dayjs().subtract(1, 'day').toISOString()});
        //const items = await getItemsApi(this.api).getItems({ids: ['ID']});
        //const userData = await getItemsApi(this.api).getItemUserData({itemId: 'ID', userId: this.user.Id});

        const sessions = await getSessionApi(this.api).getSessions();
        const nonMSSessions = sessions.data
        .filter(x => x.DeviceId !== this.deviceId)
        .map(x => [this.sessionToPlayerState(x), x])
        .filter((x: [PlayerStateDataMaybePlay, SessionInfo]) => {
            return x[0].play !== undefined
            || this.hasPlayer(x[0]);
        }) as [PlayerStateDataMaybePlay, SessionInfo][];
        const validSessions: PlayerStateDataMaybePlay[] = [];

        for(const sessionData of nonMSSessions) {
            const validPlay = this.isActivityValid(sessionData[0], sessionData[1]);
            if(validPlay === true) {
                validSessions.push(sessionData[0]);
            } else if(this.logFilterFailure !== false) {
                let stateIdentifyingInfo: string = genGroupIdStr(getPlatformIdFromData(sessionData[0]));
                if(sessionData[0].play !== undefined) {
                    stateIdentifyingInfo = buildTrackString(sessionData[0].play, {include: ['artist', 'track', 'platform']});
                }
                const dropReason = `Player State for  -> ${stateIdentifyingInfo} <-- is being dropped because ${validPlay}`;
                if(!this.uniqueDropReasons.data.some(x => x === dropReason)) {
                    this.logger[this.logFilterFailure](dropReason);
                    this.uniqueDropReasons.add(dropReason);
                }
                this.logger[this.logFilterFailure](dropReason);
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
        // sometimes, immediately after a track change on the player, PlayState indicates it is NOT paused but
        // does not return PositionTicks
        const playerPosition = PositionTicks !== undefined ? ticksToSeconds(PositionTicks) : undefined; // dayjs.duration(PositionTicks / 1000, 'ms').asSeconds() : undefined;

        let play: PlayObject | undefined;
        if(NowPlayingItem !== undefined) {
            const sessionPlay = this.formatPlayObjAware(NowPlayingItem);
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

            if(this.config.options.logPayload && !this.mediaIdsSeen.data.includes(NowPlayingItem.Id)) {
                this.logger.debug(`First time seeing media ${NowPlayingItem.Id} on ${msDeviceId} (play position ${playerPosition}) => ${JSON.stringify(NowPlayingItem)}`);
                this.mediaIdsSeen.add(NowPlayingItem.Id);
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
