import EventEmitter from "events";
import { PlayObject, URLData } from "../../core/Atomic.js";
import { buildTrackString, combinePartsToString, truncateStringToLength } from "../../core/StringUtils.js";
import {
    asPlayerStateDataMaybePlay,
    FormatPlayObjectOptions,
    InternalConfig,
    NO_USER,
    PlayerStateData,
    PlayerStateDataMaybePlay,
    PlayPlatformId, REPORTED_PLAYER_STATUSES
} from "../common/infrastructure/Atomic.js";
import { genGroupIdStr, getFirstNonEmptyString, getPlatformIdFromData, isDebugMode, parseBool, } from "../utils.js";
import { buildStatePlayerPlayIdententifyingInfo, hashObject, parseArrayFromMaybeString } from "../utils/StringUtils.js";
import { GetSessionsMetadata } from "@lukehagar/plexjs/sdk/models/operations/getsessions.js";
import { PlexAPI, HTTPClient, Fetcher } from "@lukehagar/plexjs";
import { Agent } from 'undici';
import { PlexApiSourceConfig } from "../common/infrastructure/config/source/plex.js";
import { isPortReachable, joinedUrl, normalizeWebAddress } from '../utils/NetworkUtils.js';
import { GetTokenDetailsResponse, GetTokenDetailsUserPlexAccount } from '@lukehagar/plexjs/sdk/models/operations/gettokendetails.js';
import { parseRegexSingle } from '@foxxmd/regex-buddy-core';
import { Readable } from 'node:stream';
import { PlexPlayerState } from './PlayerState/PlexPlayerState.js';
import { AbstractPlayerState, PlayerStateOptions } from './PlayerState/AbstractPlayerState.js';
import { Logger } from '@foxxmd/logging';
import { MemoryPositionalSource } from './MemoryPositionalSource.js';
import { FixedSizeList } from 'fixed-size-list';
import { SDKValidationError } from '@lukehagar/plexjs/sdk/models/errors/sdkvalidationerror.js';
import { Keyv } from 'cacheable';
import { initMemoryCache } from "../common/Cache.js";

const shortDeviceId = truncateStringToLength(10, '');

export const LOCAL_USER = 'PLEX_LOCAL_USER';

const THUMB_REGEX = new RegExp(/\/library\/metadata\/(?<ratingkey>\d+)\/thumb\/\d+/)

export default class PlexApiSource extends MemoryPositionalSource {
    users: string[] = [];

    plexApi: PlexAPI;
    plexUser: string;

    httpClient: HTTPClient;

    deviceId: string;

    address: URLData;

    usersAllow: string[] = [];
    usersBlock: string[] = [];
    devicesAllow: string[] = [];
    devicesBlock: string[] = [];
    librariesAllow: string[] = [];
    librariesBlock: string[] = [];

    logFilterFailure: false | 'debug' | 'warn';

    mediaIdsSeen: FixedSizeList<string>;
    uniqueDropReasons: FixedSizeList<string>;

    libraries: {name: string, collectionType: string, uuid: string}[] = [];
    
    private mbIdCache: Keyv<string>;

    declare config: PlexApiSourceConfig;

    constructor(name: any, config: PlexApiSourceConfig, internal: InternalConfig, emitter: EventEmitter) {
        super('plex', name, config, internal, emitter);
        this.canPoll = true;
        this.multiPlatform = true;
        this.requiresAuth = true;
        this.requiresAuthInteraction = false;
        this.deviceId = `${name}-ms${internal.version}-${truncateStringToLength(10, '')(hashObject(config))}`;
        this.uniqueDropReasons = new FixedSizeList<string>(100);
        this.mediaIdsSeen = new FixedSizeList<string>(100);
        this.mbIdCache = initMemoryCache<string | null>({lruSize: 1000, ttl: '1m'}) as Keyv<string | null>;
    }

    protected async doBuildInitData(): Promise<true | string | undefined> {
        this.regexCache
        const {
            data: {
                token,
                interval = 5,
                usersAllow = [],
                usersBlock = [],
                devicesAllow = [],
                devicesBlock = [],
                librariesAllow = [],
                librariesBlock = []
            } = {},
            options: {
                logFilterFailure = (isDebugMode() ? 'debug' : 'warn'),
                ignoreInvalidCert = false
            } = {}
        } = this.config;

        this.config.data.interval = interval;

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

        if(this.librariesBlock.length > 0 && this.librariesAllow.length > 0) {
            this.logger.warn(`When both 'librariesAllow' and 'librariesBlock' are specified only 'librariesAllow' is used.`);
        }

        this.address = normalizeWebAddress(this.config.data.url);
        this.logger.debug(`Config URL: ${this.config.data.url} | Normalized: ${this.address.toString()}`);

        if(ignoreInvalidCert) {
            this.logger.debug('Using http client that ignores self-signed certs');

            // https://github.com/nodejs/undici/issues/1489#issuecomment-1543856261
            const bypassAgent = new Agent({
                connect: {
                    rejectUnauthorized: false,
                },
            });

            const bypassFetcher: Fetcher = (input, init) => {

                if (init == null) {
                    // @ts-ignore
                    return fetch(input, {dispatcher: bypassAgent});
                } else {
                    // @ts-ignore
                    return fetch(input, {...init, dispatcher: bypassAgent});
                }
            };
            this.httpClient = new HTTPClient({ fetcher: bypassFetcher });
        } else {
            this.httpClient = new HTTPClient();
        }

        this.plexApi = new PlexAPI({
            serverURL: this.address.url.toString(),
            accessToken: this.config.data.token,
            httpClient: this.httpClient
        });

        return true;
    }

    protected async doCheckConnection(): Promise<true | string | undefined> {
        try {
            const reachable = await isPortReachable(this.address.port, {host: this.address.url.hostname});
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
                this.usersAllow.push(LOCAL_USER.toLocaleLowerCase());
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
            if(e instanceof SDKValidationError) {
                if((e.rawValue as any).object?.MediaContainer?.Directory !== undefined) {
                    // ensure directory has required values
                    const ok = (e.rawValue as any).object?.MediaContainer?.Directory.every(x => x.title !== undefined && x.type !== undefined && x.uuid !== undefined);
                    if(ok) {
                        this.libraries = (e.rawValue as any).object.MediaContainer.Directory.map(x => ({name: x.title, collectionType: x.type, uuid: x.uuid}));
                        return;
                    }
                }
                this.logger.debug({ rawValue: e.rawValue }, 'Plex Response');
            }
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
            if(allowedLibraries.length > 0 && !allowedLibraries.some(x => (state.play.meta.library ?? '').toLocaleLowerCase() === x.name.toLocaleLowerCase())) {
                return `media not included in librariesAllow`;
            }
            
            if(allowedLibraries.length === 0) {
                const blockedLibraries = this.getBlockedLibraries();
                if(blockedLibraries.length > 0) {
                    const blockedLibrary = blockedLibraries.find(x => (state.play.meta.library ?? '').toLocaleLowerCase() === x.name.toLocaleLowerCase());
                    if(blockedLibrary !== undefined) {
                        return `media included in librariesBlock '${blockedLibrary.name}'`;
                    }
                }

                // this is inside this block because we SHOULD allow non-music libraries if
                // user specified name in librariesAllow
                // -- so only check for this if nothing is specified
                if(!this.getValidLibraries().some(x => (state.play.meta.library ?? '') === x.name)) {
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
            sessionKey,
            player: {
                product,
                title: playerTitle,
                machineIdentifier
            } = {},
            user: {
                title: userTitle,
            } = {},
            // plex returns the track artist as originalTitle (when there is an album artist)
            // otherwise this is undefined
            originalTitle: trackArtist
        } = obj;

        const realArtists: string[] = [];
        const albumArtists: string[] = [];

        if(trackArtist !== undefined) {
            realArtists.push(trackArtist);
            albumArtists.push(artist);
        } else {
            realArtists.push(artist);
        }

        return {
            data: {
                artists: realArtists,
                albumArtists,
                album,
                track,
                // albumArtists: AlbumArtists !== undefined ? AlbumArtists.map(x => x.Name) : undefined,
                duration: duration / 1000
            },
            meta: {
                // If a user does not have to login to Plex (local IP and no Home Management(?)) then the User node is never populated
                // in this case we will use a special constant to signal this is the local user
                user: userTitle ?? LOCAL_USER,
                trackId: guid,
                // server: ServerId,
                mediaType: type,
                source: 'Plex',
                library,
                deviceId: combinePartsToString([shortDeviceId(machineIdentifier), product, playerTitle]),
                sessionId: sessionKey,
                trackProgressPosition: viewOffset / 1000,
            }
        }
    }

    getRecentlyPlayed = async (options = {}) => {

        const result = await this.plexApi.sessions.getSessions();

        const allSessions: [PlayerStateDataMaybePlay, GetSessionsMetadata][] = (result.object.mediaContainer?.metadata ?? [])
        .map(x => [this.sessionToPlayerState(x), x]);
        const validSessions: PlayerStateDataMaybePlay[] = [];

        for(const sessionData of allSessions) {
            const validPlay = this.isActivityValid(sessionData[0], sessionData[1]);
            if(validPlay === true) {
                // Pull MBIDs for track, album, and artist.
                const [trackMbId, albumMbId, albumArtistMbId] = await Promise.all([
                    this.getMusicBrainzId(sessionData[1].ratingKey),
                    this.getMusicBrainzId(sessionData[1].parentRatingKey),
                    this.getMusicBrainzId(sessionData[1].grandparentRatingKey),
                ]);
                
                if (!sessionData[0].play.data.meta) {
                    sessionData[0].play.data.meta = {};
                }
                
                const prevBrainzMeta = sessionData[0].play.data.meta.brainz ?? {};
                sessionData[0].play.data.meta.brainz = {
                    ...prevBrainzMeta,
                    recording: trackMbId,
                    album: albumMbId,
                    // Plex doesn't track MBIDs for track artists, so we use the
                    // album artist MBID instead.
                    artist: albumArtistMbId !== undefined
                        ? [...new Set([...(prevBrainzMeta.artist ?? []), albumArtistMbId])]
                        : prevBrainzMeta.artist,
                    albumArtist: albumArtistMbId !== undefined
                        ? [...new Set([...(prevBrainzMeta.albumArtist ?? []), albumArtistMbId])]
                        : prevBrainzMeta.albumArtist,
                };
              
                validSessions.push(sessionData[0]);
            } else if(this.logFilterFailure !== false) {
                const stateIdentifyingInfo = buildStatePlayerPlayIdententifyingInfo(sessionData[0]);
                const dropReason = `Player State for  -> ${stateIdentifyingInfo} <-- is being dropped because ${validPlay}`;
                if(!this.uniqueDropReasons.data.some(x => x === dropReason)) {
                    this.logger[this.logFilterFailure](dropReason);
                    this.uniqueDropReasons.add(dropReason);
                }
            }
        }
        return await this.processRecentPlays(validSessions);
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

    pickPlatformSession = (sessions: (PlayObject | PlayerStateDataMaybePlay)[], player: AbstractPlayerState): PlayObject | PlayerStateDataMaybePlay => {
        if(sessions.length === 1) {
            return sessions[0];
        }
        // if all are player states and have session ids
        // then choose the player state with the "latest" session key
        if(sessions.every(x => asPlayerStateDataMaybePlay(x) && 'sessionId' in x)) {
            const pStateSessions = sessions as PlayerStateDataMaybePlay[];
            pStateSessions.sort((a, b) => parseInt(a.sessionId) - parseInt(b.sessionId));

            const validSession = pStateSessions[sessions.length - 1];
            const droppingSessions = pStateSessions.filter(x => x.sessionId !== validSession.sessionId).map(x => buildStatePlayerPlayIdententifyingInfo(x)).join('\n');
            player.logger.debug(`More than one data/state found in incoming data, dropping these sessions with "earlier" session keys:\n${droppingSessions}`);

            return validSession;
        }
        return sessions[0];
    }

    sessionToPlayerState = (obj: GetSessionsMetadata): PlayerStateDataMaybePlay => {

        const {
            // represents milliseconds position of player
            // * only available when player is PLAYING (not paused)
            // * when user seeks or pauses/stops -> plays the initial position is accurate
            //   * when playing, is only updated every 15 seconds from the position of play
            viewOffset,
            player: {
                machineIdentifier,
                product,
                title,
                state
            } = {},
            sessionKey
        } = obj;

        const msDeviceId = combinePartsToString([shortDeviceId(machineIdentifier), product, title]);

        const play: PlayObject = this.formatPlayObjAware(obj);

        if((this.config.options.logPayload || isDebugMode()) && !this.mediaIdsSeen.data.includes(play.meta.trackId)) {
            this.logger.debug(`First time seeing media ${play.meta.trackId} on ${msDeviceId} => ${JSON.stringify(play)}
Plex Payload:
${JSON.stringify(obj)}`);
            this.mediaIdsSeen.add(play.meta.trackId);
        }

        const reportedStatus = state !== 'playing' ? REPORTED_PLAYER_STATUSES.paused : REPORTED_PLAYER_STATUSES.playing;
        return {
            platformId: [msDeviceId, play.meta.user],
            sessionId: sessionKey,
            play,
            status: reportedStatus,
            position: viewOffset / 1000
        }
    }

    getNewPlayer = (logger: Logger, id: PlayPlatformId, opts: PlayerStateOptions) => new PlexPlayerState(logger, id, opts);
    
    getMusicBrainzId = async (ratingKey: string | undefined): Promise<string | undefined> => {
        if (!ratingKey) {
            return null;
        }
        
        const cachedMbId = await this.mbIdCache.get(ratingKey);
        if (cachedMbId !== undefined && cachedMbId !== null) {
            return cachedMbId;
        }
        if(cachedMbId === null) {
            return undefined;
        }
        
        try {
            const signal = AbortSignal.timeout(5000); // reasonable 5s timeout

            // The current version of plexjs (0.39.0) does not return the GUID
            // fields, so we make the call manually.
            const request = await this.httpClient.request(
                new Request(
                    new URL(`/library/metadata/${ratingKey}`, this.address.url),
                    {
                        method: "GET",
                        headers: {
                            "X-Plex-Token": this.config.data.token,
                            "Accept": "application/json",
                        },
                        signal
                    }
                )
            );
        
            const result = await request.json();
        
            // There shouldn't be multiple metadata or GUID objects, but we return
            // the first MBID to be safe.
            for (const metadata of result.MediaContainer.Metadata ?? []) {
                for (const guid of metadata.Guid ?? []) {
                    if (typeof guid.id === "string" && guid.id.startsWith("mbid://")) {
                        const mbid = guid.id.replace("mbid://", "");
                        
                        await this.mbIdCache.set(ratingKey, mbid);
                        return mbid;
                    }
                }
            }
        } catch (e) {
            this.logger.warn(new Error(`Failed to get MusicBrainz IDs from Plex for item ${ratingKey}`, {cause: e}));
        }
        
        this.mbIdCache.set(ratingKey, null);
        return undefined;
    }
}

async function streamToString(stream: any) {
  const reader = stream.getReader();
  const textDecoder = new TextDecoder();
  let result = '';

  async function read() {
    const { done, value } = await reader.read();

    if (done) {
      return result;
    }

    result += textDecoder.decode(value, { stream: true });
    return read();
  }

  return read();
}