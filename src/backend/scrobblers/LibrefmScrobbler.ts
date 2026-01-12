import EventEmitter from "events";
import { Logger } from "@foxxmd/logging";
import LastfmScrobbler from "./LastfmScrobbler.js";
import { Notifiers } from "../notifier/Notifiers.js";
import { LibrefmClientConfig } from "../common/infrastructure/config/client/librefm.js";
import { formatPlayObj, LIBREFM_HOST, LIBREFM_PATH } from "../common/vendor/LastfmApiClient.js";
import { LastfmData } from "../common/infrastructure/config/client/lastfm.js";
import { FormatPlayObjectOptions, InternalConfigOptional } from "../common/infrastructure/Atomic.js";

export default class LibrefmScrobbler extends LastfmScrobbler {

        declare config: LibrefmClientConfig;

        constructor(name: any, config: LibrefmClientConfig, options: InternalConfigOptional & {[key: string]: any}, notifier: Notifiers, emitter: EventEmitter, logger: Logger) {
            const {
                data: {
                    urlBase = `https://${LIBREFM_HOST}${LIBREFM_PATH}`,
                    ...rest
                } = {},
            } = config;
            config.data = {...(rest as LastfmData), urlBase};
            super(name, config, {...options, type: 'librefm'}, notifier, emitter, logger, 'librefm');
            this.upstreamType = 'Libre.fm';
        }

        formatPlayObj = (obj: any, options: FormatPlayObjectOptions = {}) => formatPlayObj(obj, {...options, source: 'Librefm'});

}