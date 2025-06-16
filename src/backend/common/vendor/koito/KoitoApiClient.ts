import dayjs from "dayjs";
import { PlayObject } from "../../../../core/Atomic.js";
import { AbstractApiOptions } from "../../infrastructure/Atomic.js";
import { ListenObjectResponse } from "../../infrastructure/config/client/koito.js";
import AbstractApiClient from "../AbstractApiClient.js";


export class KoitoApiClient extends AbstractApiClient {

        constructor(name: any, config: any, options: AbstractApiOptions) {
            super('Koito', name, config, options);
        }

}

export const listenObjectResponseToPlay = (obj: ListenObjectResponse, options: {newFromSource?: boolean} = {}): PlayObject => {
    const play: PlayObject = {
        data: {
            track: obj.track.title,
            artists: (obj.track.artists ?? []).map(x => x.name),
            duration: obj.track.duration,
            playDate: dayjs(obj.time)
        },
        meta: {
            source: 'Koito',
            newFromSource: options.newFromSource ?? false,
            trackId: obj.track.id.toString()
        }
    }
    if(obj.track.musicbrainz_id !== null) {
        play.data.meta = {
            brainz: {
                track: obj.track.musicbrainz_id
            }
        }
    }
    return play;
}