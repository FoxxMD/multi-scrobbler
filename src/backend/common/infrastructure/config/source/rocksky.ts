import { RockSkyData, RockSkyOptions } from "../client/rocksky.js";
import { PollingOptions } from "../common.js";
import { CommonSourceConfig, CommonSourceData, CommonSourceOptions } from "./index.js";

export interface RockskySourceData extends RockSkyData, CommonSourceData, PollingOptions {
}

export interface RockskySourceOptions extends RockSkyOptions, CommonSourceOptions {

}

export interface RockskySourceConfig extends CommonSourceConfig {
    /**
     * When used in `rocksky.config` this tells multi-scrobbler whether to use this data to configure a source or client.
     *
     * @default source
     * @examples ["source"]
     * */
    configureAs?: 'source'
    data: RockskySourceData
    options?: RockskySourceOptions
}

export interface RockskySourceAIOConfig extends RockskySourceConfig {
    type: 'rocksky'
}
