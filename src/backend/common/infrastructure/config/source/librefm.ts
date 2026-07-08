import { type LibrefmData } from "../client/librefm.js";
import { type PollingOptions } from "../common.js";
import { type CommonSourceConfig, type CommonSourceData } from "./index.js";

export interface librefmSourceData extends CommonSourceData, PollingOptions, LibrefmData{}

export interface LibrefmSourceConfig extends CommonSourceConfig {
    /**
     * When used in `librefm.config` this tells multi-scrobbler whether to use this data to configure a source or client.
     *
     * @default source
     * @examples ["source"]
     * */
    configureAs?: 'source'
    data: LibrefmData
}

export interface LibrefmSouceAIOConfig extends LibrefmSourceConfig {
    type: 'librefm'
}
