import { CommonSourceConfig, CommonSourceData } from "./index.js";

export interface ListenbrainzEndpointData extends CommonSourceData {
    /**
     * The URL ending that should be used to identify scrobbles for this source
     *
     * If you are using multiple Listenbrainz endpoint sources (scrobbles for many users) you can use a slug to match Sources with individual users/origins
     *
     * Example:
     *
     * * slug: 'usera' => API URL: http://localhost:9078/api/listenbrainz/usera
     * * slug: 'originb' => API URL: http://localhost:9078/api/listenbrainz/originb
     *
     * If no slug is found from an extension's incoming webhook event the first Listenbrainz source without a slug will be used
     * */
    slug?: string | null

    /**
     * If an LZ submission request contains this token in the Authorization Header it will be used to match the submission with this Source
     *
     * See: https://listenbrainz.readthedocs.io/en/latest/users/api/index.html#add-the-user-token-to-your-requests
     * */
    token?: string | null
}

export interface ListenbrainzEndpointConfig extends CommonSourceConfig {
    data?: ListenbrainzEndpointData
}

export interface ListenbrainzEndpointSourceAIOConfig extends ListenbrainzEndpointConfig {
    type: 'endpointlz'
}
