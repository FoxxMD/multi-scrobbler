import dayjs from "dayjs";
import { isPlayObject, PlayObject } from "../../../../core/Atomic.js";
import { asPlayerStateData, SourceData } from "../../infrastructure/Atomic.js";
import { GatewayActivity } from "discord.js";
import { capitalize } from "../../../../core/StringUtils.js";
import { urlToMusicService } from "../ListenbrainzApiClient.js";
import { ActivityData } from "../../infrastructure/config/client/discord.js";
import { removeUndefinedKeys } from "../../../utils.js";

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
}