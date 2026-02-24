import dayjs from "dayjs";
import { isPlayObject, PlayObject } from "../../../../core/Atomic.js";
import { asPlayerStateData, SourceData } from "../../infrastructure/Atomic.js";
import { GatewayActivity, GatewayOpcodes, PresenceUpdateStatus } from "discord.js";
import { capitalize } from "../../../../core/StringUtils.js";
import { urlToMusicService } from "../ListenbrainzApiClient.js";
import { ACTIVITY_TYPE, ActivityData, ActivityTypes, DiscordData, DiscordStrongData, ActivityTypeString as MSActivityType, StatusType } from "../../infrastructure/config/client/discord.js";
import { parseBool, removeUndefinedKeys } from "../../../utils.js";
import { parseArrayFromMaybeString, parseBoolOrArrayFromMaybeString } from "../../../utils/StringUtils.js";

export const playStateToActivityData = (data: SourceData, opts: { useArt?: boolean } = {}): { activity: ActivityData, artUrl?: string } => {
    // unix timestamps in milliseconds
    let startTime: number,
        endTime: number;

    let play: PlayObject;
    if (isPlayObject(data)) {
        play = data;
        if (data.meta.trackProgressPosition !== undefined && play.data.duration !== undefined) {
            startTime = dayjs().subtract(data.meta.trackProgressPosition, 's').unix() * 1000;
            endTime = dayjs().add(data.data.duration - data.meta.trackProgressPosition, 's').unix() * 1000;
        } else if (asPlayerStateData(data)) {
            play = data.play;
            if (data.position !== undefined && play.data.duration !== undefined) {
                startTime = dayjs().subtract(data.position, 's').unix() * 1000;
                endTime = dayjs().add(data.data.duration - data.position, 's').unix() * 1000;
            }
        }
    }

    let activityName = capitalize(play.meta?.musicService ?? play.meta?.mediaPlayerName ?? play.meta?.source ?? 'music')


    const activity: ActivityData = removeUndefinedKeys<ActivityData>({
        // https://docs.discord.com/developers/events/gateway-events#activity-object
        activityType: 2, // Listening
        // https://docs.discord.com/developers/events/gateway-events#activity-object
        statusDisplayType: 1, // state
        name: activityName,
        details: play.data.track,
        state: play.data.artists !== undefined && play.data.artists.length > 0 ? play.data.artists.join(' / ') : undefined,
        // https://docs.discord.com/developers/events/gateway-events#activity-object-activity-assets
        // https://docs.discord.com/developers/events/gateway-events#activity-object-activity-asset-image
        assets: {
            largeText: play.data.album
        },
        createdAt: dayjs().unix()
    });
    if (endTime !== undefined && startTime !== undefined) {
        activity.timestamps = {
            start: startTime,
            end: endTime
        }
    }
    
    //let buttons: GatewayActivityButton[] = [];

    const {
        meta: {
            url: {
                web,
                origin
            } = {},
        },
        data: {
            meta: {
                brainz: {
                    recording
                } = {}
            } = {}
        } = {}
    } = play;
    const url = origin ?? web;
    if(url !== undefined) {
        const knownService = urlToMusicService(url);
        if(knownService !== undefined) {
            activity.detailsUrl = url;

            // when including buttons discord accepts the presence update but does not actually use it
            // I think buttons may now be limited to official RPC or restricted to preset actions via things like secrets or registering commands
            // https://docs.discord.com/developers/developer-tools/game-sdk#activitysecrets-struct

            // buttons.push({
            //     label: `Listen on ${capitalize(knownService)}`,
            //     url: web
            // });
        }
    }
    if(recording !== undefined) {
        const mb = `https://musicbrainz.org/recording/${recording}`;
        if(activity.detailsUrl === undefined) {
            activity.detailsUrl = mb;
        } else {
            activity.stateUrl = mb;
        }
        // buttons.push({
        //     label: 'Open on Musicbrainz',
        //     url: `https://musicbrainz.org/recording/${recording}`
        // });
    }
    // if(buttons.length > 0) {
    //     activity.buttons = buttons;
    // }

    const artUrl = play.meta?.art?.album ?? play.meta?.art?.track ?? play.meta?.art?.artist;

    return { activity, artUrl };
};
export const configToStrong = (data: DiscordData): DiscordStrongData => {
    const {
        token, 
        applicationId, 
        artwork, 
        artworkDefaultUrl, 
        statusOverrideAllow = ['online', 'idle', 'dnd'], 
        listeningActivityAllow = [], 
        ipcLocations
    } = data;

    const strongConfig: DiscordStrongData = {
        token,
        applicationId,
        listeningActivityAllow: parseArrayFromMaybeString(listeningActivityAllow),
        artworkDefaultUrl,
    };

    if (typeof artwork === 'boolean' || Array.isArray(artwork)) {
        strongConfig.artwork = artwork;
    } else if (typeof artwork === 'string') {
        if (['true', 'false'].includes(artwork.toLocaleLowerCase())) {
            strongConfig.artwork = parseBool(artwork);
        } else {
            strongConfig.artwork = parseArrayFromMaybeString(artwork);
        }
    }

    const saRaw = parseArrayFromMaybeString(statusOverrideAllow);
    strongConfig.statusOverrideAllow = saRaw.map(statusStringToType);

    if (ipcLocations !== undefined) {
        if (typeof ipcLocations === 'string') {
            const ipcRaw = parseArrayFromMaybeString(ipcLocations);
            strongConfig.ipcLocations = ipcRaw;
        } else {
            strongConfig.ipcLocations = ipcLocations;
        }
    }

    return strongConfig;
};

export const activityIdToStr = (id: number): MSActivityType => {
    switch (id) {
        case ACTIVITY_TYPE.Playing:
            return 'playing';
        case ACTIVITY_TYPE.Streaming:
            return 'streaming';
        case ACTIVITY_TYPE.Listening:
            return 'listening';
        case ACTIVITY_TYPE.Watching:
            return 'watching';
        case ACTIVITY_TYPE.Custom:
            return 'custom';
        case ACTIVITY_TYPE.Competing:
            return 'competing';
        default:
            throw new Error(`Not a valid activity type. Must be one of: playing | streaming | listening | watching | custom | competing`);
    }
};

export const activityStringToType = (str: string): MSActivityType => {
    switch (str.trim().toLocaleLowerCase()) {
        case 'playing':
            return 'playing';
        case 'streaming':
            return 'streaming';
        case 'listening':
            return 'listening';
        case 'watching':
            return 'watching';
        case 'custom':
            return 'custom';
        case 'competing':
            return 'competing';
        default:
            throw new Error(`Not a valid activity type. Must be one of: playing | streaming | listening | watching | custom | competing`);
    }
};

export const statusStringToType = (str: string): StatusType => {
    switch (str.trim().toLocaleLowerCase()) {
        case 'online':
            return PresenceUpdateStatus.Online;
        case 'idle':
            return PresenceUpdateStatus.Idle;
        case 'dnd':
            return PresenceUpdateStatus.DoNotDisturb;
        case 'invisible':
            return PresenceUpdateStatus.Invisible;
        default:
            throw new Error(`Not a valid status type. Must be one of: online | idle | dnd | invisible`);
    }
};

export const opcodeToFriendly = (op: number) => {
    switch (op) {
        case GatewayOpcodes.Hello:
            return 'Hello';
        case GatewayOpcodes.HeartbeatAck:
            return 'HeartbeatAck';
        case GatewayOpcodes.Heartbeat:
            return 'Heartbeat';
        case GatewayOpcodes.Dispatch:
            return 'Dispatch';
        case GatewayOpcodes.InvalidSession:
            return 'InvalidSession';
        case GatewayOpcodes.Reconnect:
            return 'Reconnect';
        case GatewayOpcodes.Resume:
            return 'Resume';
        case GatewayOpcodes.Identify:
            return 'Identify';
        case GatewayOpcodes.PresenceUpdate:
            return 'PresenceUpdate';
        default:
            return op;
    }
};

