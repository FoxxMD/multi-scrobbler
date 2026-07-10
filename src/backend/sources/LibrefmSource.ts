import type {EventEmitter} from "events";
import type {InternalConfig} from "../common/infrastructure/Atomic.ts";
import type {LibrefmSourceConfig} from "../common/infrastructure/config/source/librefm.ts";
import LastfmSource from "./LastfmSource.ts";
import { LIBREFM_HOST, LIBREFM_PATH } from "../common/vendor/LastfmApiClient.ts";
import type {LastfmData} from "../common/infrastructure/config/client/lastfm.ts";
import type {LastfmSourceConfig} from "../common/infrastructure/config/source/lastfm.ts";


export default class LibrefmSource extends LastfmSource {

    // @ts-expect-error
    declare config: LibrefmSourceConfig;

    constructor(name: any, config: LibrefmSourceConfig, internal: InternalConfig, emitter: EventEmitter) {
        const {
            data: {
                urlBase = `https://${LIBREFM_HOST}${LIBREFM_PATH}`,
                apiKey = 'anything',
                secret = 'anything',
                ...rest
            } = {},
        } = config;
        config.data = {...(rest as LastfmData), urlBase, apiKey, secret};
        super(name, config as LastfmSourceConfig, internal, emitter, 'librefm');
        this.upstreamType = 'Libre.fm';
    }
}