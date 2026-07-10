import type {PollingOptions} from "../common.ts";
import type {CommonSourceConfig, CommonSourceData} from "./index.ts";

export interface YandexMusicBridgeData extends CommonSourceData, PollingOptions {
    /** URL of the local Python bridge, for example http://yandex-music-bridge:9980 */
    url: string
    /** Optional API key sent as X-API-Key to the bridge */
    apiKey?: string
}

export interface YandexMusicBridgeSourceConfig extends CommonSourceConfig {
    data?: YandexMusicBridgeData
}

export interface YandexMusicBridgeSourceAIOConfig extends YandexMusicBridgeSourceConfig {
    type: 'ymbridge'
}
