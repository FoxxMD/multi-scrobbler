import type {LastfmData} from "../client/lastfm.ts";
import type {PollingOptions} from "../common.ts";
import type {CommonSourceConfig, CommonSourceData} from "./index.ts";

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
