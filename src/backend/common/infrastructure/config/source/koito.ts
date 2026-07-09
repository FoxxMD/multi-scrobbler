import { type KoitoData } from "../client/koito.ts";
import { type ListenBrainzData } from "../client/listenbrainz.ts";
import { type PollingOptions } from "../common.ts";
import { type CommonSourceConfig, type CommonSourceData } from "./index.ts";

export interface KoitoSourceData extends KoitoData, CommonSourceData, PollingOptions {
}

export interface KoitoSourceConfig extends CommonSourceConfig {
    /**
     * When used in `koito.config` this tells multi-scrobbler whether to use this data to configure a source or client.
     *
     * @default source
     * @examples ["source"]
     * */
    configureAs: 'source'
    data: KoitoSourceData
}

export interface KoitoSourceAIOConfig extends KoitoSourceConfig {
    type: 'koito'
}
