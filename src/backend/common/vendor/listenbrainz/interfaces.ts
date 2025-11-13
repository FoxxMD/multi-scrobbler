
/*
 * https://musicbrainz.org/doc/MusicBrainz_Database/Schema#Overview
*/

/** A unique product a Recording is issued on.
 *
 * This is like an album (release group) but is specific to the type, year, catalog, etc... for this release
 *
 * EX: 1984 US release of "The Wall" by "Pink Floyd", release on label "Columbia Records" with catalog number "C2K 36183"
 *
 * @see https://musicbrainz.org/doc/Release
 *
 * Referred to in MB api response as release_mbid
 *
*/
export type ReleaseMbid = string;/** The "abstract", non-unique album/single/EP the Recording belongs to
 *
 * This is what people normally think of as an album (release group)
 *
 * EX: "The Wall" by "Pink Floyd"
 *
 * @see https://musicbrainz.org/doc/Release
 *
 * Referred to in MB api response as release_group -> mbid
 *
*/
export type ReleaseGroupMbid = string;
/** A unique mix/edit/master of a Work
 *
 * This is like a song but is unique to the master/edit of the song
 *
 *
 * * Album version of the track "Into the Blue" by "Moby"
 * * Remix "Into the Blue (Buzz Boys Main Room Mayhem mix)" by "Moby"
 *
 * @see https://musicbrainz.org/doc/Recording
 *
 * Referred to in MB api response as recording_mbid
 */
export type RecordingMbid = string;
/** The "abstract", non-unique Song produced by an Artist
 *
 * All Recordings "belong" to a single Work
 *
 * EX: Song "Into the Blue" by "Moby"
 *
 *  @see Song "Into the Blue" by "Moby"
 */
export type WorkMbid = string;
/** A musician or group or musicians that release music
 *
 * @see https://musicbrainz.org/doc/Artist
 *
 * MB does not distinguish between Artist and Album Artists in API responses except for by release_artist_name in additional_info
 * All artists/album artists are included in mbid_mappings artists
 *
*/
export type ArtistMbid = string;
/** A unique, random identifier used for each scrobble. Not the same as recording_mbid */
export type RecordingMsid = string;
export interface ArtistMBIDMapping {
    artist_credit_name: string;
    artist_mbid: ArtistMbid;
    join_phrase: string;
}
export interface MinimumTrack {
    artist_name: string;
    track_name: string;
    release_name?: string;
}
export interface AdditionalTrackInfo {
    artist_mbids?: ArtistMbid[];
    release_mbid?: ReleaseMbid;
    release_group_mbid?: ReleaseGroupMbid;
    recording_mbid?: RecordingMbid;
    submission_client?: string;
    submission_client_version?: string;
    spotify_id?: string;
    media_player?: string;
    media_player_version?: string;

    music_service?: string;
    music_service_name?: string;
    origin_url?: string;
    tags?: string[];
    duration?: number;

    duration_ms?: number;
    track_mbid?: string;
    work_mbids?: WorkMbid[];

    release_artist_name?: string;
    release_artist_names?: string[];
    spotify_album_id?: string;
    spotify_album_artist_ids?: string[];
    spotify_artist_ids?: string[];
    artist_names?: string[];
    albumartist?: string;

    tracknumber?: number
}
export interface Track {
    artist_name: string;
    track_name: string;
    release_name?: string;
    artist_mbids?: ArtistMbid[];
    artist_msid?: ArtistMbid;
    recording_mbid?: string;
    release_mbid?: ReleaseMbid;
    release_msid?: string;
    tags?: string[];

    duration?: number;
}

export type ListenType = 'single' | 'playing_now';
export interface MbidMapping {
    recording_name?: string;
    artist_mbids?: ArtistMbid[];
    artists?: ArtistMBIDMapping[];
    caa_id?: number;
    /** cover album archive mbid, not related to anything else I think */
    caa_release_mbid?: string;
    recording_mbid?: RecordingMbid;
    release_mbid?: ReleaseMbid;
}

// using submit-listens example from openapi https://rain0r.github.io/listenbrainz-openapi/index.html#/lbCore/submitListens
// which is documented in official docs https://listenbrainz.readthedocs.io/en/latest/users/api/index.html#openapi-specification
// and based on this LZ developer comment https://github.com/lyarenei/jellyfin-plugin-listenbrainz/issues/10#issuecomment-1253867941

//
// data structures for submitting a listen
//
export interface SubmitListenAdditionalTrackInfo extends AdditionalTrackInfo {

}
export interface TrackPayload extends MinimumTrack {
    additional_info?: SubmitListenAdditionalTrackInfo;
    mbid_mapping?: MbidMapping
}
export interface ListenPayload {
    listened_at?: Date | number;
    track_metadata: TrackPayload;
}

// this is what is sent to submit-listens
export interface SubmitPayload {
    listen_type: ListenType;
    payload: [ListenPayload];
}

//
// data structures returned from listens
//

export interface AdditionalTrackInfoResponse extends SubmitListenAdditionalTrackInfo {
    recording_msid?: RecordingMsid;
}

export interface TrackResponse extends TrackPayload {
    additional_info: AdditionalTrackInfoResponse;
}

// this is what is received from listens endpoint
export interface ListenResponse {

    inserted_at?: number;
    listened_at: number;
    recording_msid?: RecordingMsid;
    track_metadata: TrackResponse;
}

