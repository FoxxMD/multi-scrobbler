import {CommonSourceConfig, CommonSourceData} from "./index";

export interface ChromecastData extends CommonSourceData {
    /**
     * DO NOT scrobble from any cast devices that START WITH these values, case-insensitive
     *
     * @examples [["home-mini","family-tv"]]
     * */
    blacklistDevices?: string | string[]

    /**
     * ONLY scrobble from any cast device that START WITH these values, case-insensitive
     *
     * If whitelist is present then blacklist is ignored
     *
     * @examples [["home-mini","family-tv"]]
     * */
    whitelistDevices?: string | string[]

    /**
     * DO NOT scrobble from any application that START WITH these values, case-insensitive
     *
     * @examples [["spotify","pandora"]]
     * */
    blacklistApps?: string | string[]

    /**
     * ONLY scrobble from any application that START WITH these values, case-insensitive
     *
     * If whitelist is present then blacklist is ignored
     *
     * @examples [["spotify","pandora"]]
     * */
    whitelistApps?: string | string[]
}

export interface ChromecastSourceConfig extends CommonSourceConfig {
    data: ChromecastData
}

export interface ChromecastSourceAIOConfig extends ChromecastSourceConfig {
    type: 'chromecast'
}
