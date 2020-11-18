import dayjs from "dayjs";
import {buildTrackString} from "../utils.js";

export default class PlexSource {

    name = 'Plex';

    logger;
    clients;

    discoveredTracks = 0;

    constructor(logger, clients) {
        this.logger = logger;
        this.clients = clients;
    }

    static formatPlayObj(obj) {
        const {
            event,
            Metadata: {
                type,
                title: track,
                parentTitle: album,
                grandparentTitle: artist,
            } = {}
        } = obj;
        return {
            data: {
                artist,
                album,
                track,
                playDate: dayjs(),
            },
            meta: {
                event,
                mediaType: type,
            }
        }
    }

    handle = async (payload) => {
        const playObj = PlexSource.formatPlayObj(payload);
        const {meta: {mediaType, title, event}} = playObj;
        if(event !== 'media.scrobble') {
            // return silently
            return;
        }
        if (mediaType !== 'track') {
            this.logger.warn(`Webhook posted a non-music media type (${mediaType}), not scrobbling this. Item: ${title}`, {label: this.name});
        } else {
            this.logger.info(`New Track => ${buildTrackString(playObj)}`, {label: this.name});
            try {
                await this.clients.scrobble(playObj);
                // only gets hit if we scrobbled ok
                this.discoveredTracks++;
            } catch (e) {
                this.logger.error('Encountered error while scrobbling', {label: this.name})
                this.logger.error(e, {label: this.name})
            }
        }
    }
}
