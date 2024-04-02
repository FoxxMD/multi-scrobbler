declare module 'lastfm-node-client' {
    /**
     * Must REMOVE (unset) any undefined/null properties from payload before sending or LastFM will return an error
     * */
    export interface TrackScrobblePayload {
        /**
         * join multiple artists with ', '
         * */
        artist: string

        /**
         * track title
         * */
        track: string

        /**
         * Unix timestamp of time track should be scrobbled at
         * */
        timestamp: number
        /**
         * length of track in seconds
         * */
        duration?: number

        album?: string

        albumArtist?: string

        /** MusicBrainz track ID */
        mbid?: string
    }

    export interface TrackScrobbleResponse {
        scrobbles: {
            '@attr': {
                accepted: number,
                ignored: number
                code: number
            },
            scrobble?: {
                track: {
                    '#text': string
                },
                timestamp: number,
                ignoredMessage: {
                    code: number
                    '#text': string
                }
            }
        }
    }

    export type NowPlayingPayload = Omit<TrackScrobblePayload, 'mbid' | 'timestamp'>

    export interface NowPlayingResponse {
        nowplaying: {
            ignoredMessage: {
                code: number
                '#text': string
            }
        }
    }

    export interface AuthGetSessionPayload {
        token: string
    }

    export interface AuthGetSessionResponse {
        session: {
            key: string
            name: string
        }
    }

    export interface UserGetInfoResponse {
        user: {
            name: string
        }
    }

    export interface UserGetRecentTracksPayload {
        user: string
        limit?: number
        extended?: boolean
    }

    export interface UserGetRecentTracksResponse {
        recenttracks: {
            track: TrackObject[]
        }
    }

    export interface TrackObject {
        artist: {
            '#text': string,
            name: string,
            mbid: string,
        },
        name: string,
        album: {
            '#text': string,
            mbid: string
        },
        duration: number,
        date?: {
            uts: number,
        },
        '@attr'?: {
            nowplaying: 'true' | 'false'
        }
        url: string,
        mbid: string,
    }

    export default class LastFM {
        constructor(apiKey: string, secret?: string, session?: string);

        trackUpdateNowPlaying(params: NowPlayingPayload): Promise<NowPlayingResponse>
        trackScrobble(params: TrackScrobblePayload): Promise<TrackScrobbleResponse>
        authGetSession(params: AuthGetSessionPayload): Promise<AuthGetSessionResponse>
        userGetInfo(): Promise<UserGetInfoResponse>
        userGetRecentTracks(params: UserGetRecentTracksPayload): Promise<UserGetRecentTracksResponse>
    }
}
