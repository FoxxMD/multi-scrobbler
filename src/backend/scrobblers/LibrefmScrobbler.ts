import type {EventEmitter} from "events";
import type {Logger} from "@foxxmd/logging";
import LastfmScrobbler from "./LastfmScrobbler.ts";
import type {LibrefmClientConfig} from "../common/infrastructure/config/client/librefm.ts";
import { formatPlayObj, LIBREFM_HOST, LIBREFM_PATH } from "../common/vendor/LastfmApiClient.ts";
import type {LastfmClientConfig, LastfmData} from "../common/infrastructure/config/client/lastfm.ts";
import type {FormatPlayObjectOptions, InternalConfigOptional} from "../common/infrastructure/Atomic.ts";

export default class LibrefmScrobbler extends LastfmScrobbler {

        // @ts-expect-error
        declare config: LibrefmClientConfig;

        constructor(name: any, config: LibrefmClientConfig, options: InternalConfigOptional & {[key: string]: any},  emitter: EventEmitter, logger: Logger) {
            const {
                data: {
                    urlBase = `https://${LIBREFM_HOST}${LIBREFM_PATH}`,
                    apiKey = 'anything',
                    secret = 'anything',
                    ...rest
                } = {},
            } = config;
            config.data = {...(rest as LastfmData), urlBase, apiKey, secret};
            super(name, config as LastfmClientConfig, {...options, type: 'librefm'}, emitter, logger, 'librefm');
            this.upstreamType = 'Libre.fm';
        }

        formatPlayObj = (obj: any, options: FormatPlayObjectOptions = {}) => formatPlayObj(obj, {...options, source: 'Librefm'});

}