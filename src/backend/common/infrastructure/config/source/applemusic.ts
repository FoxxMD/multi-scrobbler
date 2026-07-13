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
    /**
     * Custom headers to include in every Apple Music API request.
     * Useful for setting Origin header, etc.
     *
     * @examples [{"Origin": "https://music.apple.com"}]
     */
    headers?: Record<string, string>
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
