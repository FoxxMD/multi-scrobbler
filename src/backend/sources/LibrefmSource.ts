import { EventEmitter } from "stream";
import { InternalConfig } from "../common/infrastructure/Atomic.js";
import { LibrefmSourceConfig } from "../common/infrastructure/config/source/librefm.js";
import LastfmSource from "./LastfmSource.js";
import { LIBREFM_HOST, LIBREFM_PATH } from "../common/vendor/LastfmApiClient.js";
import { LastfmData } from "../common/infrastructure/config/client/lastfm.js";


export default class LibrefmSource extends LastfmSource {

    declare config: LibrefmSourceConfig;

    constructor(name: any, config: LibrefmSourceConfig, internal: InternalConfig, emitter: EventEmitter) {
        const {
            data: {
                urlBase = `https://${LIBREFM_HOST}${LIBREFM_PATH}`,
                ...rest
            } = {},
        } = config;
        config.data = {...(rest as LastfmData), urlBase};
        super(name, config, internal, emitter, 'librefm');
        this.upstreamType = 'Libre.fm';
    }
}