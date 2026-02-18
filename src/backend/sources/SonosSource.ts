import { EventEmitter } from "events";
import { PlayObject, PlayObjectLifecycleless } from "../../core/Atomic.js";
import {
    FormatPlayObjectOptions,
    InternalConfig,
    NO_DEVICE,
    NO_USER,
    PlayerStateData,
    REPORTED_PLAYER_STATUSES,
    ReportedPlayerStatus,
} from "../common/infrastructure/Atomic.js";
import { RecentlyPlayedOptions } from "./AbstractSource.js";
import { MemoryPositionalSource } from "./MemoryPositionalSource.js";
import { SonosSourceConfig } from "../common/infrastructure/config/source/sonos.js";
import { SonosDevice, SonosManager } from '@svrooij/sonos';
import { SonosState } from "@svrooij/sonos/lib/models/sonos-state.js";
import { GroupTransportState } from "@svrooij/sonos/lib/models/transport-state.js";
import { Track } from "@svrooij/sonos/lib/models/track.js";
import { parseDurationFromTimestamp } from "../utils/TimeUtils.js";
import { FixedSizeList } from "fixed-size-list";
import { buildStatePlayerPlayIdententifyingInfo, hashObject, parseArrayFromMaybeString } from "../utils/StringUtils.js";
import { isDebugMode, playObjDataMatch, sleep } from "../utils.js";
import dayjs, { Dayjs } from "dayjs";
import { baseFormatPlayObj } from "../utils/PlayTransformUtils.js";

export interface DeviceState {
    device: SonosDevice
    state: SonosState
}

export type SimpleDevice = Pick<SonosDevice, 'Name' | 'GroupName' | 'Uuid' | 'Host'>;

export interface SimpleDeviceState {
    device: SimpleDevice
    state: SonosState
}

GroupTransportState.GroupPlaying

const CLIENT_PLAYER_STATE: Record<string, ReportedPlayerStatus> = {
    'GROUP_PLAYING': REPORTED_PLAYER_STATUSES.playing,
    'PLAYING': REPORTED_PLAYER_STATUSES.playing,
    'TRANSITIONING': REPORTED_PLAYER_STATUSES.playing,
    'GROUP_STOPPED': REPORTED_PLAYER_STATUSES.stopped,
    'STOPPED': REPORTED_PLAYER_STATUSES.stopped,
    'PAUSED_PLAYBACK': REPORTED_PLAYER_STATUSES.paused,
}

export class SonosSource extends MemoryPositionalSource {
    declare config: SonosSourceConfig;

    manager: SonosManager;
    deviceHashSeen: FixedSizeList<string>;
    uniqueDropReasons: FixedSizeList<string>;
    logFilterFailure: false | 'debug' | 'warn';
    logEmptyPlayer: boolean

    devicesAllow: string[] = [];
    devicesBlock: string[] = [];
    groupsAllow: string[] = [];
    groupsBlock: string[] = [];

    protected badDeviceError: Record<string, {err: string, time?: Dayjs}> = {};

    constructor(name: any, config: SonosSourceConfig, internal: InternalConfig, emitter: EventEmitter) {
        const {
            data,
        } = config;
        const {
            interval = 5, // reduced polling interval because its likely we are on the same network
            ...rest
        } = data || {};
        super('sonos', name, { ...config, data: { ...rest, interval } }, internal, emitter);

        this.requiresAuth = false;
        this.canPoll = true;
        this.manager = new SonosManager();
        this.deviceHashSeen = new FixedSizeList<string>(100);
        this.uniqueDropReasons = new FixedSizeList<string>(100);
    }

    protected async doBuildInitData(): Promise<true | string | undefined> {
        const {
            options: {
                logFilterFailure = (isDebugMode() ? 'debug' : 'warn'),
                logEmptyPlayer = isDebugMode()
            } = {},
            data: {
                devicesAllow = [],
                devicesBlock = [],
                groupsAllow = [],
                groupsBlock = []
            } = {}
        } = this.config;
        if (logFilterFailure !== false && !['debug', 'warn'].includes(logFilterFailure)) {
            this.logger.warn(`logFilterFailure value of '${logFilterFailure.toString()}' is NOT VALID. Logging will not occur if filters fail. You should fix this.`);
        } else {
            this.logFilterFailure = logFilterFailure;
        }
        this.logEmptyPlayer = logEmptyPlayer;

        this.devicesAllow = parseArrayFromMaybeString(devicesAllow, {lower: true});
        this.devicesBlock = parseArrayFromMaybeString(devicesBlock, {lower: true});
        this.groupsAllow = parseArrayFromMaybeString(groupsAllow, {lower: true});
        this.groupsBlock = parseArrayFromMaybeString(groupsBlock, {lower: true});

        return true;
    }

    protected async doCheckConnection(): Promise<true | string | undefined> {
        try {
            await this.manager.InitializeFromDevice(this.config.data.host);
            const devicesSummary = [];
            // something about .map isn't iterating all devices?
            // see if this works instead
            // for good measure advanced to next tick
            await sleep(500);
            for (const x of this.manager.Devices) {
                devicesSummary.push(`Name: ${x.Name} | IP: ${x.Host} | Group: ${x.GroupName}`);
            }
            this.logger.debug(`Devices in Sonos network\n${devicesSummary.join('\n')}`);
            return `Sonos network is available with ${this.manager.Devices.length} devices`;
        } catch (e) {
            throw e;
        }
    }

    public isValidState = (data: DeviceState, play: PlayObject): string | undefined => {
        if(this.devicesAllow.length > 0 && !this.devicesAllow.some(x => data.device.Name.toLocaleLowerCase().includes(x))) {
            return `'devicesAllow does not include a phrase found in ${data.device.Name}`;
        }
        if(this.devicesBlock.length > 0 && this.devicesBlock.some(x => data.device.Name.toLocaleLowerCase().includes(x))) {
            return `'devicesBlock includes a phrase found in ${data.device.Name}`;
        }
        if(this.groupsAllow.length > 0 && !this.groupsAllow.some(x => data.device.GroupName.toLocaleLowerCase().includes(x))) {
            return `'groupsAllow does not include a phrase found in ${data.device.GroupName}`;
        }
        if(this.groupsBlock.length > 0 && this.groupsBlock.some(x => data.device.GroupName.toLocaleLowerCase().includes(x))) {
            return `'groupsBlock includes a phrase found in ${data.device.GroupName}`;
        }
        if (typeof data.state.positionInfo?.TrackMetaData === 'string') {
            // ???
            return;
        }
        if(data.state.positionInfo?.TrackMetaData?.UpnpClass === undefined) {
            return `UpnpClass does not exist, likely not a valid play`;
        }
        if (!data.state.positionInfo.TrackMetaData.UpnpClass.toLocaleLowerCase().includes('musictrack')) {
            return `UpnpClass does include 'musictrack', found '${data.state.positionInfo.TrackMetaData.UpnpClass}'`;
        }
        return;
    }

    getRecentlyPlayed = async (options: RecentlyPlayedOptions = {}) => {

        const playerStates: PlayerStateData[] = [];
        for (const d of this.manager.Devices) {
            let state: SonosState;
            try {
                state = await d.GetState();
            } catch (e) {
                if(e instanceof Error) {
                    let muted = false,
                    seen = false;
                    if(this.badDeviceError[d.Name] !== undefined) {
                        seen = this.badDeviceError[d.Name].err === e.message;
                        if(seen && this.badDeviceError[d.Name].time !== undefined && Math.abs(this.badDeviceError[d.Name].time.diff(dayjs(), 's')) < 60) {
                            muted = true;
                        }
                    }
                    if(muted) {
                        // already logged in the last minute
                        continue;
                    }
                    if(seen) {
                        // already logged full error, just log that its still happening
                        this.logger.debug(`Could not get Device '${d.Name}' state due to already seen error. Will mute for 1 minute => ${e.message}`);
                        this.badDeviceError[d.Name] = {err: e.message, time: dayjs()};
                        continue;
                    }
                    this.logger.warn(new Error(`Could not get Device '${d.Name}' state`, {cause: e}));
                    this.badDeviceError[d.Name] = {err: e.message};
                    continue;
                } else {
                    this.logger.error(new Error(`Uncaught exception of unknown type when getting Device '${d.Name}' state`, {cause: e}));
                    continue;
                }
            }
            // clear any state errors for this device
            if(this.badDeviceError[d.Name] !== undefined) {
                delete this.badDeviceError[d.Name];
            }
            const x = {
                state,
                device: d
            };

            const {
                Name,
                GroupName,
                Uuid,
                Host
            } = x.device

            const deviceId = Name === undefined ? NO_DEVICE : `${Name}-${GroupName ?? 'NoGroup'}`;

            try {
                let status = CLIENT_PLAYER_STATE[x.state.transportState] ?? REPORTED_PLAYER_STATUSES.unknown;

                // TODO if status is stopped then drop state if player is also stopped?

                let seen = true;

                const {
                    positionInfo: {
                        TrackURI: posTrackURI,
                        TrackMetaData
                    } = {}
                } = state;

                const invariantData = getInvariantDeviceData(x);

                const hash = hashObject(invariantData);
                if (!this.deviceHashSeen.data.includes(hash)) {
                    seen = false;
                    this.deviceHashSeen.add(hash);
                    if (this.config.options?.logPayload || isDebugMode()) {
                        this.logger.debug({...invariantData}, 'Sonos Data');
                    }
                }

                let play: PlayObject | undefined = status === REPORTED_PLAYER_STATUSES.stopped || posTrackURI === undefined ? undefined : formatPlayObj(x.state, { device: x.device });
                let playIsEmpty = false;

                if (play !== undefined && (play.data?.track === undefined && play.data?.artists === undefined)) {
                    // likely sonos is paused and reporting an empty play
                    playIsEmpty = true;
                }

                const position = play !== undefined ? play.meta.trackProgressPosition : undefined;

                const playerState: PlayerStateData = {
                    platformId: [deviceId, NO_USER],
                    status: playIsEmpty ? REPORTED_PLAYER_STATUSES.stopped : status,
                    play: playIsEmpty ? undefined : play,
                    position
                }

                if (!playIsEmpty && play !== undefined) {
                    let reason = this.isValidState(x, play);
                    if(reason === undefined) {
                        const dup = playerStates.find(x => x.play !== undefined && playObjDataMatch(x.play, play));
                        if(dup !== undefined) {
                            reason = 'Another player is playing the same track';
                        }
                    }
                    if(reason !== undefined) {
                        const dropReason = `Player State for  -> ${buildStatePlayerPlayIdententifyingInfo(playerState)} <-- is being dropped because ${reason}`;
                        if (!this.uniqueDropReasons.data.some(x => x === dropReason)) {
                            if(this.logFilterFailure !== false) {
                                this.logger[this.logFilterFailure](dropReason);
                            }
                            this.uniqueDropReasons.add(dropReason);
                        }
                        continue;
                    }
                } else  {
                    let allowOneNonProgress = false;

                    const playerId = this.genPlayerId(playerState);
                    if(this.hasPlayer(playerId) && this.players.get(playerId).isProgressing()) {
                        // update player state with a stopped/paused/unknown reported state so that player scrobbles any existing play
                        allowOneNonProgress = true;
                    }

                    if(!allowOneNonProgress) {
                        // if no player or status is not progressing then drop
                        // so sonos devices that aren't doing anything get stale/orphaned/pruned
                        if(this.logEmptyPlayer) {
                            this.logger.debug(`Player State for  -> ${deviceId} <-- is being dropped because it is empty`);
                        }
                        continue;
                    }
                }

                playerStates.push(playerState);
            } catch (e) {
                this.logger.error({ device: { Name, GroupName, Uuid, Host }, state: x.state }, 'Sonos Data');
                throw new Error('Failed to parse Sonos data', { cause: e });
            }
        }
        return await this.processRecentPlays(playerStates);
    }

}


export const formatPlayObj = (obj: SonosState, options: FormatPlayObjectOptions & { device?: SonosDevice } = {}): PlayObject => {

    const {
        Name,
        GroupName,
        Uuid
    } = options.device ?? {};

    const {
        mediaInfo: {
            CurrentURIMetaData
        } = {},
        positionInfo: {
            // 0:03:16
            TrackDuration,
            // 0:01:31
            RelTime,
            // 2147483647
            // always the same
            RelCount,
            TrackMetaData,
            // "x-sonos-vli:RINCON_48A6B8EF0F2E01400:2,spotify:9969e2e07a6c024b39964aa7e0378262"
            TrackURI
        } = {}
    } = obj;

    const metadatas: Track[] = [];

    if (typeof CurrentURIMetaData !== 'string') {
        metadatas.push(CurrentURIMetaData);
    }
    if (typeof TrackMetaData !== 'string') {
        metadatas.push(TrackMetaData);
    }

    let titleStr: string;

    if (metadatas.length === 0) {
        titleStr = TrackMetaData as string ?? CurrentURIMetaData as string;
    }

    const mergedMetadata: Track = Object.assign({}, ...metadatas);

    const {
        Album,
        AlbumArtUri,
        // only renders first artist
        Artist,
        // should be same as TrackDuration
        Duration,
        // CurrentURIMetadata => Spotify
        // TrackMetaData => (the actual title)
        Title = titleStr,
        // "x-sonos-vli:*:audio:*"
        ProtocolInfo,
        // "x-sonos-spotify:spotify:track:0yh5FKzDJfz3xkEOvnOfTm?sid=12&flags=0&sn=2"
        TrackUri, // may be able to parse track resource
        // TrackMetaData => object.item.audioItem.musicTrack (for spotify)
        // CurrentURIMetadata => object.item.audioItem.linein
        UpnpClass
    } = mergedMetadata;

    let dur: number;
    if (Duration !== undefined && Duration !== "NOT_IMPLEMENTED") {
        dur = parseDurationFromTimestamp(Duration).asSeconds();
    } else if (TrackDuration !== undefined && TrackDuration !== "NOT_IMPLEMENTED") {
        dur = parseDurationFromTimestamp(TrackDuration).asSeconds();
    }

    let progress: number;
    if (RelTime !== undefined && RelTime !== "NOT_IMPLEMENTED") {
        progress = parseDurationFromTimestamp(RelTime).asSeconds();
    }

    if (titleStr === undefined && Title !== undefined && Title !== 'Spotify') {
        titleStr = Title;
    }

    const play: PlayObjectLifecycleless = {
        data: {
            track: titleStr,
            album: Album,
            artists: Artist === undefined ? undefined : [Artist],
            duration: dur,
        },
        meta: {
            user: NO_USER,
            deviceId: Name === undefined ? NO_DEVICE : `${Name}-${GroupName ?? 'NoGroup'}`,
            sessionId: Uuid,
            trackProgressPosition: progress,
            art: {
                album: AlbumArtUri
            },
            source: 'Sonos'
        }
    }
    return baseFormatPlayObj({...obj, device: options.device}, play);
}

export const getInvariantDeviceData = (data: DeviceState): SimpleDeviceState => {

    const { device, state } = data;

    const {
        positionInfo: {
            RelTime,
            ...restPos
        } = {},
        ...restState
    } = state;

    return {
        device: {
            Name: device.Name,
            GroupName: device.GroupName,
            Host: device.Host,
            Uuid: device.Uuid
        },
        state: {
            ...restState,
            // @ts-expect-error
            positionInfo: {
                ...restPos,
                RelTime: '0',
            },
            volume: 0
        }
    }
}