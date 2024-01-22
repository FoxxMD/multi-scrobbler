import { MdnsDeviceInfo, REPORTED_PLAYER_STATUSES, ReportedPlayerStatus } from "../../infrastructure/Atomic.js";
import { PlatformApplication, PlatformType } from "./interfaces.js";
import {connect, createPlatform, Media, MediaController, PersistentClient, Result} from "@foxxmd/chromecast-client";
import {ErrorWithCause} from "pony-cause";
import {Client as CastClient} from 'castv2';
import objectHash from "object-hash";
import { PlayObject } from "../../../../core/Atomic.js";

export const chromePlayerStateToReported = (state: string): ReportedPlayerStatus => {
    switch (state) {
        case 'PLAYING':
            return REPORTED_PLAYER_STATUSES.playing;
        case 'PAUSED':
        case 'BUFFERING':
            return REPORTED_PLAYER_STATUSES.paused;
        case 'IDLE':
            return REPORTED_PLAYER_STATUSES.stopped;
        default:
            return REPORTED_PLAYER_STATUSES.unknown;
    }
}

export const getCurrentPlatformApplications = async (platform: PlatformType): Promise<PlatformApplication[]> => {

    //https://developers.google.com/cast/docs/reference/web_sender/chrome.cast.Session

    let statusRes: Result<{applications?: PlatformApplication[]}>;
    try {
        statusRes = await platform.getStatus()
    } catch (e) {
        throw new ErrorWithCause('Unable to fetch platform statuses', {cause: e});
    }

    let status: {applications?: PlatformApplication[]};

    try {
        status = statusRes.unwrapAndThrow();
        if(status.applications === undefined) {
            return [];
        }
        return status.applications;
    } catch (e) {
        throw new ErrorWithCause('Unable to fetch platform statuses', {cause: e});
    }
}

export const getMediaStatus = async (controller: MediaController.MediaController) => {
    let status: Media.MediaStatus;

    try {
        const statusRes = await controller.getStatus();
        status = statusRes.unwrapAndThrow();
        return status;
    } catch (e) {
        throw new ErrorWithCause('Unable to fetch media status', {cause: e});
    }
}

export const genDeviceId = (deviceName: string, appName: string) => {
    return `${deviceName.substring(0, 25)}-${appName.substring(0,25)}`;
}

export const genPlayHash = (play: PlayObject) => {
        const {
            data: {
                artists,
                track,
                album,
                albumArtists
            } = {},
            meta: {
                mediaType
            }
        } = play;

        return objectHash.sha1({artists, track, album, albumArtists, mediaType});
}
