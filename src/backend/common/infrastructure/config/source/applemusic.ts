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
     * Origin header to include in every Apple Music API request.
     * Required when using a browser token (not a MusicKit key).
     *
     * @example "https://music.apple.com"
     */
    origin?: string
}

export interface AppleMusicSourceConfig extends CommonSourceConfig {
    data?: AppleMusicData
    options?: CommonSourceOptions & {
        logAuth?: boolean
        logDiff?: boolean
        /**
         * Fixes a quirk where Apple Music's history API hides duplicate plays.
         * If you listen to A → B → A, the API returns [A, B, X, Y ...] instead of [A, B, A, X, Y ...].
         * This can cause MS to skip the second A play.
         *
         * When enabled (default), MS detects this pattern, keeps the interim tracks (B),
         * and re-scrobbles A as a re-listen. Disable only if you notice false positives.
         *
         * @default true
         * @examples [true, false]
         */
        recoverUnchangedTopHistory?: boolean
    }
}

export interface AppleMusicSourceAIOConfig extends AppleMusicSourceConfig {
    type: 'applemusic'
}
