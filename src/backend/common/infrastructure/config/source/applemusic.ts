import type {PollingOptions} from "../common.ts";
import type {CommonSourceConfig, CommonSourceData, CommonSourceOptions} from "./index.ts";

export interface AppleMusicKey {
    id: string
    teamId: string
    p8: string
}

export interface AppleMusicData extends CommonSourceData, PollingOptions {
    key?: AppleMusicKey
    token?: string
    mediaUserToken?: string
    storefront?: string
}

export interface AppleMusicSourceConfig extends CommonSourceConfig {
    data?: AppleMusicData
    options?: CommonSourceOptions & {
        logAuth?: boolean
        logDiff?: boolean
    }
}

export interface AppleMusicSourceAIOConfig extends AppleMusicSourceConfig {
    type: 'applemusic'
}
