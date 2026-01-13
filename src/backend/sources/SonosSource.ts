import { EventEmitter } from "events";
import { PlayObject } from "../../core/Atomic.js";
import {
    FormatPlayObjectOptions,
    InternalConfig,
    NO_DEVICE,
    NO_USER,
    PlayerStateData,
    REPORTED_PLAYER_STATUSES,
    ReportedPlayerStatus,
    SINGLE_USER_PLATFORM_ID,
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
import { buildStatePlayerPlayIdententifyingInfo, parseArrayFromMaybeString } from "../utils/StringUtils.js";
import { isDebugMode } from "../utils.js";

export interface UniquePlay {
    device: SonosDevice
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
    mediaIdsSeen: FixedSizeList<string>;
    uniqueDropReasons: FixedSizeList<string>;
    logFilterFailure: false | 'debug' | 'warn';

    devicesAllow: string[] = [];
    devicesBlock: string[] = [];
    groupsAllow: string[] = [];
    groupsBlock: string[] = [];

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
        this.mediaIdsSeen = new FixedSizeList<string>(100);
        this.uniqueDropReasons = new FixedSizeList<string>(100);
    }

    protected async doBuildInitData(): Promise<true | string | undefined> {
        const {
            options: {
                logFilterFailure = (isDebugMode() ? 'debug' : 'warn'),
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

        this.devicesAllow = parseArrayFromMaybeString(devicesAllow, {lower: true});
        this.devicesBlock = parseArrayFromMaybeString(devicesBlock, {lower: true});
        this.groupsAllow = parseArrayFromMaybeString(groupsAllow, {lower: true});
        this.groupsBlock = parseArrayFromMaybeString(groupsBlock, {lower: true});

        return true;
    }

    protected async doCheckConnection(): Promise<true | string | undefined> {
        try {
            await this.manager.InitializeFromDevice(this.config.data.host);
            return `Sonos network is available with ${this.manager.Devices.length} devices`;
        } catch (e) {
            throw e;
        }
    }

    public isValidState = (data: UniquePlay, play: PlayObject): string | undefined => {
        if (typeof data.state.positionInfo.TrackMetaData === 'string') {
            // ???
            return;
        }
        if (!data.state.positionInfo.TrackMetaData.UpnpClass.toLocaleLowerCase().includes('musictrack')) {
            return `UpnpClass does include 'musictrack', found '${data.state.positionInfo.TrackMetaData.UpnpClass}'`;
        }

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
        return;
    }

    getRecentlyPlayed = async (options: RecentlyPlayedOptions = {}) => {

        // only need to get one device per group
        const uniqueDevices: Record<string, SonosDevice> = {}
        for (const d of this.manager.Devices) {
            if (uniqueDevices[d.GroupName] === undefined) {
                uniqueDevices[d.GroupName] = d;
            }
        }
        const uniquePlayers: UniquePlay[] = [];
        for (const [k, v] of Object.entries(uniqueDevices)) {
            const state = await v.GetState();
            // unsure if devices in the same group can play different things if they are in different zones?
            // so double check some unique-ish data is not the same
            if (!uniquePlayers.some(x => x.state.mediaInfo.CurrentURI === state.mediaInfo.CurrentURI)) {
                uniquePlayers.push({ device: v, state });
            }
        }

        const playerStates: PlayerStateData[] = [];
        for (const x of uniquePlayers) {
            const {
                Name,
                GroupName,
                Uuid
            } = x.device

            try {
                let status = CLIENT_PLAYER_STATE[x.state.transportState];

                let seen = true;

                // TrackURI seems to correspond to 1) the device/group playing and 2) the service/source playing
                // but NOT the content actually playing -- 2) does not update when content playing changes on the same service
                const mediaId = `${x.state.positionInfo.TrackURI}--${typeof x.state.positionInfo.TrackMetaData !== 'string' ? x.state.positionInfo.TrackMetaData.TrackUri : x.state.positionInfo.TrackMetaData}`;
                if (!this.mediaIdsSeen.data.includes(mediaId)) {
                    seen = false;
                    this.mediaIdsSeen.add(mediaId);
                    if (this.config.options?.logPayload || isDebugMode()) {
                        this.logger.debug({ device: { Name, GroupName, Uuid }, state: x.state }, 'Sonos Data');
                    }
                }

                const deviceId = Name === undefined ? NO_DEVICE : `${Name}-${GroupName ?? 'NoGroup'}`;

                let play = status === REPORTED_PLAYER_STATUSES.stopped ? undefined : formatPlayObj(x.state, { device: x.device });

                if (play.data.track === undefined && play.data.artists === undefined) {
                    // likely sonos is paused and reporting an empty play
                    play = undefined;
                    status = REPORTED_PLAYER_STATUSES.stopped;
                }

                const position = play !== undefined ? play.meta.trackProgressPosition : undefined;

                const playerState: PlayerStateData = {
                    platformId: [deviceId, NO_USER],
                    status,
                    play,
                    position
                }

                if (play !== undefined) {
                    const reason = this.isValidState(x, play);
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
                }

                playerStates.push(playerState);
            } catch (e) {
                this.logger.debug({ device: { Name, GroupName, Uuid }, state: x.state }, 'Sonos Data');
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

    return {
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
            }
        }
    }
}