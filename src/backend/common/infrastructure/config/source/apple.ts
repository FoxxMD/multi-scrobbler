import {CommonSourceConfig, CommonSourceData} from "./index";
import {PollingOptions} from "../common";

// See issue for more documentation
// https://github.com/FoxxMD/multi-scrobbler/issues/9#issuecomment-946871774
export interface AppleMusicData extends CommonSourceData, PollingOptions {
    /**
     * Contents of MusicKit private key or a path to the key file
     *
     * https://help.apple.com/developer-account/#/devcdfbb56a3
     * */
    key: string

    /**
     * Team Id (tid) from Developer account
     * */
    teamId: string
    /**
     * Key identifier (kid) from Developer account
     * */
    keyId: string

    /**
     *  URL to another MS instance running the apple music source *server*
     * */
    endpoint: string
}

export interface AppleMusicSourceConfig extends CommonSourceConfig {
    data: AppleMusicData
}

export interface AppleMusicAIOSourceConfig extends AppleMusicSourceConfig {
    type: 'apple'
}
