import { LastfmData } from "../client/lastfm";
import { CommonSourceConfig, CommonSourceData } from "./index";

export interface LastFmSourceData extends CommonSourceData, LastfmData{}

export interface LastfmSourceConfig extends CommonSourceConfig {
    /**
     * When used in `lastfm.config` this tells multi-scrobbler whether to use this data to configure a source or client.
     *
     * @default source
     * @examples ["source"]
     * */
    configureAs?: 'source'
    data: LastFmSourceData
}

export interface LastFmSouceAIOConfig extends LastfmSourceConfig {
    type: 'lastfm'
}
