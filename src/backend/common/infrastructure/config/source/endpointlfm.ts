import { CommonSourceConfig, CommonSourceData } from "./index.ts";

export interface LastFMEndpointData extends CommonSourceData {
    /**
     * The URL ending that should be used to identify scrobbles for this source
     *
     * If you are using multiple Last.fm endpoint sources (scrobbles for many users) you can use a slug to match Sources with individual users/origins
     *
     * Example:
     *
     * * slug: 'usera' => API URL: http://localhost:9078/api/lastfm/usera
     * * slug: 'originb' => API URL: http://localhost:9078/api/lastfm/originb
     *
     * If no slug is found from an extension's incoming webhook event the first Last.fm source without a slug will be used
     * */
    slug?: string | null
}

export interface LastFMEndpointSourceConfig extends CommonSourceConfig {
    data?: LastFMEndpointData
}

export interface LastFMEndpointSourceAIOConfig extends LastFMEndpointSourceConfig {
    type: 'endpointlfm'
}
