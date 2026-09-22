export interface SpotifyTransformerApiConfigData {
    /**
     * Spotify application client id, used to authenticate with the Client Credentials flow for catalog search/lookup.
     *
     * Can also be set using the SPOTIFY_CLIENT_ID ENV (shared with the Spotify Source, if configured).
     */
    clientId: string
    /**
     * Spotify application client secret, used to authenticate with the Client Credentials flow for catalog search/lookup.
     *
     * Can also be set using the SPOTIFY_CLIENT_SECRET ENV (shared with the Spotify Source, if configured).
     */
    clientSecret: string
    /**
     * An ISO 3166-1 alpha-2 country code. Limits/biases search results to what is available in this market.
     */
    market?: string
    /**
     * A locale in ISO-639-1_ISO-3166-1 format (EX en_US, ja_JP) used to bias which translation of a localized
     * catalog name (artist/album/track) the Spotify API returns. Support for this is not officially documented
     * by Spotify and results may be inconsistent, but it can be used alongside (or instead of) `market` to try
     * to force names into a specific language.
     */
    locale?: string
    rate?: {
        /** max number of requests allowed during perTime unit of time
         *
         * @default 10
         */
        requests?: number
        /** A span of time (in seconds) during which requests made me made, resets after perTime
         *
         * @default 1
         */
        perTime?: number
    }
}
