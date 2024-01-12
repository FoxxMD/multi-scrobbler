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

    /**
     * Try to use Avahi and avahi-browse to resolve mDNS devices instead of native mDNS querying
     *
     * Useful for docker (alpine) container where mDNS resolution is not yet supported. Avahi socket must be exposed to the container and avahi-tools must be installed.
     *
     * @default false
     * */
    useAvahi?: boolean
}

export interface ChromecastSourceConfig extends CommonSourceConfig {
    data: ChromecastData
}

export interface ChromecastSourceAIOConfig extends ChromecastSourceConfig {
    type: 'chromecast'
}
