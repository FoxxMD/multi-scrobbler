import { MalojaData } from "../client/maloja.js";
import { PollingOptions } from "../common.js";
import { CommonSourceConfig, CommonSourceData } from "./index.js";

export interface MalojaSourceData extends MalojaData, CommonSourceData, PollingOptions {
}

export interface MalojaSourceConfig extends CommonSourceConfig {
    /**
     * When used in `maloja.config` this tells multi-scrobbler whether to use this data to configure a source or client.
     *
     * @default source
     * @examples ["source"]
     * */
    configureAs?: 'source'
    data: MalojaSourceData
}

export interface MalojaSourceAIOConfig extends MalojaSourceConfig {
    type: 'maloja'
}
