import { CommonSourceConfig, CommonSourceData } from "./index.ts";

export interface ChromecastData extends CommonSourceData {
    /**
     * DO NOT scrobble from any cast devices that START WITH these values, case-insensitive
     *
     * Useful when used with auto discovery
     *
     * @examples [["home-mini","family-tv"]]
     * */
    blacklistDevices?: string | string[]

    /**
     * ONLY scrobble from any cast device that START WITH these values, case-insensitive
     *
     * If whitelist is present then blacklist is ignored
     *
     * Useful when used with auto discovery
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

    /**
     * Use mDNS to discovery Google Cast devices on your next automatically?
     *
     * If not explicitly set then it is TRUE if `devices` is not set
     * */
    useAutoDiscovery?: boolean | undefined

    /**
     * A list of Google Cast devices to monitor
     *
     * If this is used then `useAutoDiscovery` is set to FALSE, if not explicitly set
     * */
    devices?: ChromecastDeviceInfo[]

    /**
     * Chromecast Apps report a "media type" in the status info returned for whatever is currently playing
     *
     * * If set to TRUE then Music AND Generic/Unknown media will be tracked for ALL APPS
     * * If set to FALSE then only media explicitly typed as Music will be tracked for ALL APPS
     * * If set to a list then only Apps whose name contain one of these values, case-insensitive, will have Music AND Generic/Unknown tracked
     *
     * See https://developers.google.com/cast/docs/media/messages#MediaInformation "metadata" property
     *
     * @default false
     * */
    allowUnknownMedia?: boolean | string[]

    /**
     * Media provided by any App whose name is listed here will ALWAYS be tracked, regardless of the "media type" reported
     *
     * Apps will be recognized if they CONTAIN any of these values, case-insensitive
     * */
    forceMediaRecognitionOn?: string[]
}

export interface ChromecastDeviceInfo {
    /**
     * A friendly name to identify this device
     *
     * @examples ["MySmartTV"]
     * */
    name: string
    /**
     * The IP address of the device
     *
     * @examples ["192.168.0.115"]
     * */
    address: string
}

export interface ChromecastSourceConfig extends CommonSourceConfig {
    data: ChromecastData
}

export interface ChromecastSourceAIOConfig extends ChromecastSourceConfig {
    type: 'chromecast'
}
