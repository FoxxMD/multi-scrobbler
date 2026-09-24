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
