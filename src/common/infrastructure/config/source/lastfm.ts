import {LastfmData} from "../client/lastfm";
import {CommonSourceConfig, CommonSourceData} from "./index";

export interface LastfmSourceConfig extends CommonSourceConfig {
    configureAs?: 'source'
    data: CommonSourceData & LastfmData
}

export interface LastFmSouceAIOConfig extends LastfmSourceConfig {
    type: 'lastfm'
}
