import { type LastfmData } from "../client/lastfm.js";
import { type PollingOptions } from "../common.js";
import { type CommonSourceConfig, type CommonSourceData } from "./index.js";

export interface LastFmSourceData extends CommonSourceData, PollingOptions, LastfmData{}

export interface LastfmSourceConfig extends CommonSourceConfig {
    /**
     * When used in `lastfm.config` this tells multi-scrobbler whether to use this data to configure a source or client.
     *
     * @default source
     * @examples ["source"]
     * */
    configureAs: 'source'
    data: LastFmSourceData
}

export interface LastFmSouceAIOConfig extends LastfmSourceConfig {
    type: 'lastfm'
}
