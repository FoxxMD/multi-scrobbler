import type {EventEmitter} from "events";
import type {Logger} from "@foxxmd/logging";
import LastfmScrobbler from "./LastfmScrobbler.ts";
import type {LibrefmClientConfig} from "../common/infrastructure/config/client/librefm.ts";
import LastfmApiClient, { formatPlayObj, LIBREFM_HOST, LIBREFM_PATH } from "../common/vendor/LastfmApiClient.ts";
import type {LastfmClientConfig, LastfmData} from "../common/infrastructure/config/client/lastfm.ts";
import type {AbstractApiOptions, FormatPlayObjectOptions, InternalConfigOptional} from "../common/infrastructure/Atomic.ts";
import { createGetScrobblesForTimeRangeFunc } from "../utils/ListenFetchUtils.ts";

export default class LibrefmScrobbler extends LastfmScrobbler {

        // @ts-expect-error its fine
        declare config: LibrefmClientConfig;

        constructor(name: any, config: LibrefmClientConfig, options: InternalConfigOptional & AbstractApiOptions,  emitter: EventEmitter, logger: Logger) {
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

        protected async doBuildInitData(): Promise<true | string | undefined> {
            this.api = new LastfmApiClient(this.name, {...this.config.data, rateLimit: {points: 1, duration: 1.5}}, {...this.internalOptions, logger: this.logger});
            this.getScrobblesForTimeRange = createGetScrobblesForTimeRangeFunc(this.api, this.api.logger);
            await this.api.initialize();
            return true;
        }

        formatPlayObj = (obj: any, options: FormatPlayObjectOptions = {}) => formatPlayObj(obj, {...options, source: 'Librefm'});

}