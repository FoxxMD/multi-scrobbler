import {LastfmData} from "../client/lastfm.js";
import {CommonSourceConfig, CommonSourceData} from "./index.js";

export interface LastfmSourceConfig extends CommonSourceConfig {
    configureAs?: 'source'
    data: CommonSourceData & LastfmData
}

export interface LastFmSouceAIOConfig extends LastfmSourceConfig {
    type: 'lastfm'
}
