import { EventEmitter } from "stream";
import { InternalConfig } from "../common/infrastructure/Atomic.js";
import { LibrefmSourceConfig } from "../common/infrastructure/config/source/librefm.js";
import LastfmSource from "./LastfmSource.js";
import { LIBREFM_HOST, LIBREFM_PATH } from "../common/vendor/LastfmApiClient.js";
import { LastfmData } from "../common/infrastructure/config/client/lastfm.js";
import { LastfmSourceConfig } from "../common/infrastructure/config/source/lastfm.js";


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