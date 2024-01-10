import {CommonSourceConfig, CommonSourceData} from "./index";

export interface ChromecastData extends CommonSourceData {
    /**
     * DO NOT scrobble from any players that START WITH these values, case-insensitive
     *
     * @examples [["spotify","vlc"]]
     * */
    blacklistDevices?: string | string[]

    /**
     * ONLY from any players that START WITH these values, case-insensitive
     *
     * If whitelist is present then blacklist is ignored
     *
     * @examples [["spotify","vlc"]]
     * */
    whitelistDevices?: string | string[]
}

export interface ChromecastSourceConfig extends CommonSourceConfig {
    data: ChromecastData
}

export interface ChromecastSourceAIOConfig extends ChromecastSourceConfig {
    type: 'chromecast'
}
