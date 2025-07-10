import { KoitoData } from "../client/koito.js";
import { ListenBrainzData } from "../client/listenbrainz.js";
import { PollingOptions } from "../common.js";
import { CommonSourceConfig, CommonSourceData } from "./index.js";

export interface KoitoSourceData extends KoitoData, CommonSourceData, PollingOptions {
}

export interface KoitoSourceConfig extends CommonSourceConfig {
    /**
     * When used in `koito.config` this tells multi-scrobbler whether to use this data to configure a source or client.
     *
     * @default source
     * @examples ["source"]
     * */
    configureAs?: 'source'
    data: KoitoSourceData
}

export interface KoitoSourceAIOConfig extends KoitoSourceConfig {
    type: 'koito'
}
