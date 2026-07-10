import type {MalojaData} from "../client/maloja.ts";
import type {PollingOptions} from "../common.ts";
import type {CommonSourceConfig, CommonSourceData} from "./index.ts";

export interface MalojaSourceData extends MalojaData, CommonSourceData, PollingOptions {
}

export interface MalojaSourceConfig extends CommonSourceConfig {
    /**
     * When used in `maloja.config` this tells multi-scrobbler whether to use this data to configure a source or client.
     *
     * @default source
     * @examples ["source"]
     * */
    configureAs: 'source'
    data: MalojaSourceData
}

export interface MalojaSourceAIOConfig extends MalojaSourceConfig {
    type: 'maloja'
}
