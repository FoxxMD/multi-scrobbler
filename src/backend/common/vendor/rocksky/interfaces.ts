export interface RockskyScrobble extends RockskyScrobbleUris, RockSkyScrobbleUserData {
    id: string
    trackId: string
    title: string
    artist: string
    albumArtist: string
    albumArt: String
    album: string
    createdAt: string
}

export interface RockskyScrobbleUris {
    trackUri: string
    artistUri: string
    albumUri: string
    uri: string
}

export interface RockSkyScrobbleUserData {
    did: string
    handle: string
}