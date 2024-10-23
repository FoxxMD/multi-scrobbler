import objectHash from 'object-hash';
import EventEmitter from "events";
import { PlayObject } from "../../core/Atomic.js";
import { buildTrackString, truncateStringToLength } from "../../core/StringUtils.js";
import {
    FormatPlayObjectOptions,
    InternalConfig,
    PlayerStateData,
    PlayerStateDataMaybePlay,
    PlayPlatformId, REPORTED_PLAYER_STATUSES
} from "../common/infrastructure/Atomic.js";
import { combinePartsToString, genGroupIdStr, getFirstNonEmptyString, getPlatformIdFromData, joinedUrl, parseBool, } from "../utils.js";
import { parseArrayFromMaybeString } from "../utils/StringUtils.js";
import MemorySource from "./MemorySource.js";
import { GetSessionsMetadata } from "@lukehagar/plexjs/sdk/models/operations/getsessions.js";
import { PlexAPI } from "@lukehagar/plexjs";
import {
    SDKValidationError,
  } from "@lukehagar/plexjs/sdk/models/errors";
import { PlexApiSourceConfig } from "../common/infrastructure/config/source/plex.js";
import { isPortReachable } from '../utils/NetworkUtils.js';
import normalizeUrl from 'normalize-url';
import { GetTokenDetailsResponse, GetTokenDetailsUserPlexAccount } from '@lukehagar/plexjs/sdk/models/operations/gettokendetails.js';
import { parseRegexSingle } from '@foxxmd/regex-buddy-core';
import { Readable } from 'node:stream';

const shortDeviceId = truncateStringToLength(10, '');

const THUMB_REGEX = new RegExp(/\/library\/metadata\/(?<ratingkey>\d+)\/thumb\/\d+/)

export default class PlexApiSource extends MemorySource {
    users: string[] = [];

    plexApi: PlexAPI;
    plexUser: string;

    deviceId: string;

    address: URL;

    usersAllow: string[] = [];
    usersBlock: string[] = [];
    devicesAllow: string[] = [];
    devicesBlock: string[] = [];
    librariesAllow: string[] = [];
    librariesBlock: string[] = [];

    logFilterFailure: false | 'debug' | 'warn';

    mediaIdsSeen: string[] = [];

    libraries: {name: string, collectionType: string, uuid: string}[] = [];

    declare config: PlexApiSourceConfig;

    constructor(name: any, config: PlexApiSourceConfig, internal: InternalConfig, emitter: EventEmitter) {
        super('plex', name, config, internal, emitter);
        this.canPoll = true;
        this.multiPlatform = true;
        this.requiresAuth = true;
        this.requiresAuthInteraction = false;
        this.deviceId = `${name}-ms${internal.version}-${truncateStringToLength(10, '')(objectHash.sha1(config))}`;
    }

    protected async doBuildInitData(): Promise<true | string | undefined> {
        const {
            data: {
                token,
                usersAllow = [],
                usersBlock = [],
                devicesAllow = [],
                devicesBlock = [],
                librariesAllow = [],
                librariesBlock = [],
            } = {},
            options: {
                logFilterFailure = (parseBool(process.env.DEBUG_MODE) ? 'debug' : 'warn')
            } = {}
        } = this.config;

        if((token === undefined || token.trim() === '')) {
            throw new Error(`'token' must be specified in config data`);
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

        const normal = normalizeUrl(this.config.data.url, {removeSingleSlash: true});
        this.address = new URL(normal);
        this.logger.debug(`Config URL: ${this.config.data.url} | Normalized: ${this.address.toString()}`);

        this.plexApi = new PlexAPI({
            serverURL: this.address.toString(),
            accessToken: this.config.data.token,
            xPlexClientIdentifier: this.deviceId,
        });

        return true;
    }

    protected async doCheckConnection(): Promise<true | string | undefined> {
        try {
            const reachable = await isPortReachable(parseInt(this.address.port ?? '80'), {host: this.address.hostname});
            if(!reachable) {
                throw new Error(`Could not reach server at ${this.address}}`);
            }
            return true;
        } catch (e) {
            throw e;
        }
    }

    protected doAuthentication = async (): Promise<boolean> => {
        try {

            const server = await this.plexApi.server.getServerCapabilities();

            let userPlexAccount: GetTokenDetailsUserPlexAccount;

            try {
            const tokenDetails = await this.plexApi.authentication.getTokenDetails();
            userPlexAccount = tokenDetails.userPlexAccount;
            } catch (e) {
                if(e instanceof SDKValidationError && 'UserPlexAccount' in (e.rawValue as object)) {
                    userPlexAccount = (e.rawValue as {UserPlexAccount: GetTokenDetailsUserPlexAccount}).UserPlexAccount as GetTokenDetailsUserPlexAccount;
                } else {
                    throw new Error('Could not parse Plex Account details to determine authenticated username', {cause: e});
                }
            }

            this.plexUser = getFirstNonEmptyString([userPlexAccount.username, userPlexAccount.title, userPlexAccount.friendlyName, userPlexAccount.email]);

            if(this.usersAllow.length === 0) {
                this.usersAllow.push(this.plexUser.toLocaleLowerCase());
            }

            this.logger.info(`Authenticated on behalf of user ${this.plexUser} on Server ${server.object.mediaContainer.friendlyName} (version ${server.object.mediaContainer.version})`);
            return true;
        } catch (e) {
            if(e.message.includes('401') && e.message.includes('API error occurred')) {
                throw new Error('Plex Token was not valid for the specified server', {cause: e});
            } else {
                throw e;
            }
        }
    }
    protected buildLibraryInfo = async () => {
        try {
            const libraries = await this.plexApi.library.getAllLibraries();

            this.libraries = libraries.object.mediaContainer.directory.map(x => ({name: x.title, collectionType: x.type, uuid: x.uuid}));
        } catch (e) {
            throw new Error('Unable to get server libraries', {cause: e});
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

    getValidLibraries = () => this.libraries.filter(x => x.collectionType === 'artist');

    onPollPostAuthCheck = async () => {
        try {
            await this.buildLibraryInfo();
            return true;
        } catch (e) {
            this.logger.error(new Error('Cannot start polling because Plex prerequisite data could not be built', {cause: e}));
            return false;
        }5
    }

    isActivityValid = (state: PlayerStateDataMaybePlay, session: GetSessionsMetadata): boolean | string => {
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


        if(state.play !== undefined) {
            const allowedLibraries = this.getAllowedLibraries();
            if(allowedLibraries.length > 0 && !allowedLibraries.some(x => state.play.meta.library.toLocaleLowerCase().includes(x.name.toLocaleLowerCase()))) {
                return `media not included in librariesAllow`;
            }
            
            if(allowedLibraries.length === 0) {
                const blockedLibraries = this.getBlockedLibraries();
                if(blockedLibraries.length > 0) {
                    const blockedLibrary = blockedLibraries.find(x => state.play.meta.library.toLocaleLowerCase().includes(x.name.toLocaleLowerCase()));
                    if(blockedLibrary !== undefined) {
                        return `media included in librariesBlock '${blockedLibrary.name}'`;
                    }
                }
    
                if(!this.getValidLibraries().some(x => state.play.meta.library === x.name)) {
                    return `media not included in a valid library`;
                }
            }
        }

        if(state.play !== undefined) {
            if(state.play.meta.mediaType !== 'track'
            ) {
                return `media detected as ${state.play.meta.mediaType} is not allowed`;
            }
        }

        return true;
    }

    formatPlayObjAware(obj: GetSessionsMetadata, options: FormatPlayObjectOptions = {}): PlayObject {
        const play = PlexApiSource.formatPlayObj(obj, options);

        const thumb = getFirstNonEmptyString([obj.thumb, obj.parentThumb, obj.grandparentThumb]);

        if(thumb !== undefined) {
            const res = parseRegexSingle(THUMB_REGEX, thumb)
            if(res !== undefined) {
                return {
                    ...play,
                    meta: {
                        ...play.meta,
                        art: {
                            track: `/api/source/art?name=${this.name}&type=${this.type}&data=${res.named.ratingkey}`
                        }
                    }
                }
            }
        }

        return play;
    }

    static formatPlayObj(obj: GetSessionsMetadata, options: FormatPlayObjectOptions = {}): PlayObject {

        const {
            type,
            viewOffset,
            title: track,
            parentTitle: album,
            grandparentTitle: artist, // OR album artist
            librarySectionTitle: library,
            duration,
            guid,
            player: {
                product,
                title: playerTitle,
                machineIdentifier
            } = {},
            user: {
                title: userTitle
            } = {}
            // plex returns the track artist as originalTitle (when there is an album artist)
            // otherwise this is undefined
            //originalTitle: trackArtist = undefined
        } = obj;

        return {
            data: {
                artists: [artist],
                album,
                track,
                // albumArtists: AlbumArtists !== undefined ? AlbumArtists.map(x => x.Name) : undefined,
                duration: duration / 1000
            },
            meta: {
                user: userTitle,
                trackId: guid,
                // server: ServerId,
                mediaType: type,
                source: 'Plex',
                library,
                deviceId: combinePartsToString([shortDeviceId(machineIdentifier), product, playerTitle]),
                trackProgressPosition: viewOffset / 1000
            }
        }
    }

    getRecentlyPlayed = async (options = {}) => {

        const result = await this.plexApi.sessions.getSessions();

        const nonMSSessions: [PlayerStateDataMaybePlay, GetSessionsMetadata][] = (result.object.mediaContainer?.metadata ?? [])
        .map(x => [this.sessionToPlayerState(x), x]);
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
                this.logger[this.logFilterFailure](`Player State for  -> ${stateIdentifyingInfo} <-- is being dropped because ${validPlay}`);
            }
        }
        return this.processRecentPlays(validSessions);
    }

    getSourceArt = async (data: string): Promise<[Readable, string]> => {
        try {
            const resp = await this.plexApi.media.getThumbImage({
                ratingKey: parseInt(data),
                width: 250,
                height: 250,
                minSize: 1,
                upscale: 0,
                xPlexToken: this.config.data.token
            });

            // @ts-expect-error its fine
            return [Readable.fromWeb(resp.responseStream), resp.contentType]
        } catch (e) {
            throw new Error('Failed to get art', { cause: e });
        }
    }

    sessionToPlayerState = (obj: GetSessionsMetadata): PlayerStateDataMaybePlay => {

        const {
            viewOffset,
            player: {
                machineIdentifier,
                product,
                title,
                state
            } = {}
        } = obj;

        const msDeviceId = combinePartsToString([shortDeviceId(machineIdentifier), product, title]);

        const play: PlayObject = this.formatPlayObjAware(obj);

        if(this.config.options.logPayload && !this.mediaIdsSeen.includes(play.meta.trackId)) {
            this.logger.debug(`First time seeing media ${play.meta.trackId} on ${msDeviceId} => ${JSON.stringify(play)}`);
            this.mediaIdsSeen.push(play.meta.trackId);
        }

        const reportedStatus = state !== 'playing' ? REPORTED_PLAYER_STATUSES.paused : REPORTED_PLAYER_STATUSES.playing;
        return {
            platformId: [msDeviceId, play.meta.user],
            play,
            status: reportedStatus,
            position: viewOffset / 1000
        }
    }
}
