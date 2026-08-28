import * as z from "zod";

/*
 * https://musicbrainz.org/doc/MusicBrainz_Database/Schema#Overview
*/

export const releaseMbidSchema = z.string();
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
export type ReleaseMbid = z.infer<typeof releaseMbidSchema>;
export const releaseGroupMbidSchema = z.string();
/** The "abstract", non-unique album/single/EP the Recording belongs to
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
export type ReleaseGroupMbid = z.infer<typeof releaseGroupMbidSchema>;
export const recordingMbidSchema = z.string();
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
export type RecordingMbid = z.infer<typeof recordingMbidSchema>;

export const workMbidSchema = z.string();
/** The "abstract", non-unique Song produced by an Artist
 *
 * All Recordings "belong" to a single Work
 *
 * EX: Song "Into the Blue" by "Moby"
 *
 *  @see Song "Into the Blue" by "Moby"
 */
export type WorkMbid = z.infer<typeof workMbidSchema>;

export const artistMbidSchema = z.string();
/** A musician or group or musicians that release music
 *
 * @see https://musicbrainz.org/doc/Artist
 *
 * MB does not distinguish between Artist and Album Artists in API responses except for by release_artist_name in additional_info
 * All artists/album artists are included in mbid_mappings artists
 *
*/
export type ArtistMbid = z.infer<typeof artistMbidSchema>;
/** A unique, random identifier used for each scrobble. Not the same as recording_mbid */
export type RecordingMsid = string;
export const artistMBIDMappingSchema = z.object({
    artist_credit_name: z.string(),
    artist_mbid: artistMbidSchema,
    join_phrase: z.string(),
});
export type ArtistMBIDMapping = z.infer<typeof artistMBIDMappingSchema>;
export const minimumTrackSchema = z.object({
    artist_name: z.string(),
    track_name: z.string(),
    release_name: z.string().optional(),
});
export type MinimumTrack = z.infer<typeof minimumTrackSchema>;
export const additionalTrackInfoSchema = z.object({
    artist_mbids: z.array(artistMbidSchema).optional(),
    release_mbid: releaseMbidSchema.optional(),
    release_group_mbid: releaseGroupMbidSchema.optional(),
    recording_mbid: recordingMbidSchema.optional(),
    submission_client: z.string().optional(),
    submission_client_version: z.string().optional(),
    spotify_id: z.string().optional(),
    isrc: z.string().optional(),
    media_player: z.string().optional(),
    media_player_version: z.string().optional(),

    music_service: z.string().optional(),
    music_service_name: z.string().optional(),
    origin_url: z.string().optional(),
    tags: z.array(z.string()).optional(),
    duration: z.number().optional(),

    duration_ms: z.number().optional(),
    track_mbid: z.string().optional(),
    work_mbids: z.array(workMbidSchema).optional(),

    release_artist_name: z.string().optional(),
    release_artist_names: z.array(z.string()).optional(),
    spotify_album_id: z.string().optional(),
    spotify_album_artist_ids: z.array(z.string()).optional(),
    spotify_artist_ids: z.array(z.string()).optional(),
    artist_names: z.array(z.string()).optional(),
    albumartist: z.string().optional(),

    tracknumber: z.number().optional(),
});
export type AdditionalTrackInfo = z.infer<typeof additionalTrackInfoSchema>;
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

export const listenTypeSchema = z.enum(['single', 'playing_now']);
export type ListenType = z.infer<typeof listenTypeSchema>;
export const mbidMappingSchema = z.object({
    recording_name: z.string().optional(),
    artist_mbids: z.array(artistMbidSchema).optional(),
    artists: z.array(artistMBIDMappingSchema).optional(),
    caa_id: z.number().optional(),
    /** cover album archive mbid, not related to anything else I think */
    caa_release_mbid: z.string().optional(),
    recording_mbid: recordingMbidSchema.optional(),
    release_mbid: releaseMbidSchema.optional(),
});
export type MbidMapping = z.infer<typeof mbidMappingSchema>;

// using submit-listens example from openapi https://rain0r.github.io/listenbrainz-openapi/index.html#/lbCore/submitListens
// which is documented in official docs https://listenbrainz.readthedocs.io/en/latest/users/api/index.html#openapi-specification
// and based on this LZ developer comment https://github.com/lyarenei/jellyfin-plugin-listenbrainz/issues/10#issuecomment-1253867941

//
// data structures for submitting a listen
//
export const submitListenAdditionalTrackInfoSchema = additionalTrackInfoSchema;
export type SubmitListenAdditionalTrackInfo = z.infer<typeof submitListenAdditionalTrackInfoSchema>;
export const trackPayloadSchema = z.object({
    ...minimumTrackSchema.shape,
    additional_info: submitListenAdditionalTrackInfoSchema.optional(),
    mbid_mapping: mbidMappingSchema.optional(),
});
export type TrackPayload = z.infer<typeof trackPayloadSchema>;
export const listenPayloadSchema = z.object({
    listened_at: z.number().optional(),//z.union([z.date(), z.number()]).optional(),
    track_metadata: trackPayloadSchema,
});
export type ListenPayload = z.infer<typeof listenPayloadSchema>;

export interface PlayingNowPayload {
    playing_now: true
    track_metadata: TrackPayload;
}


// this is what is sent to submit-listens
export const submitPayloadSchema = z.object({
    listen_type: listenTypeSchema,
    payload: z.array(listenPayloadSchema),
});
export type SubmitPayload = z.infer<typeof submitPayloadSchema>;

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

