import { PlayObject } from "../../../../core/Atomic.js";
import { isEmptyArrayOrUndefined, removeUndefinedKeys } from "../../../utils.js";
import { getScrobbleTsSOCDate } from "../../../utils/TimeUtils.js";
import { SubmitOptions } from "../ListenbrainzApiClient.js";
import { ListenPayload, MinimumTrack, SubmitListenAdditionalTrackInfo, SubmitPayload } from "./interfaces.js";
import {version as appVersion } from '../../../version.js';

export const playToListenPayload = (play: PlayObject, version?: string): ListenPayload => {
    const {
        data: {
            playDate, artists = [],
            // MB doesn't use this during submission AFAIK
            // instead it relies on (assumes??) you will submit album/release group/etc where album artist gets credit on an individual release
            albumArtists = [], album, track, isrc, duration, meta: {
                brainz = {}, spotify = {},
            } = {}
        }, meta: {
            mediaPlayerName, mediaPlayerVersion, musicService, source
        }
    } = play;
    // using submit-listens exmaple from openapi https://rain0r.github.io/listenbrainz-openapi/index.html#/lbCore/submitListens
    // which is documented in official docs https://listenbrainz.readthedocs.io/en/latest/users/api/index.html#openapi-specification
    // and based on this LZ developer comment https://github.com/lyarenei/jellyfin-plugin-listenbrainz/issues/10#issuecomment-1253867941
    const msAdditionalInfo = brainz.additionalInfo ?? {};

    let addInfo: SubmitListenAdditionalTrackInfo = {
        // primary artists
        artist_names: Array.from(new Set([...artists])),
        // primary artist
        release_artist_name: albumArtists.length === 1 ? albumArtists[0] : undefined,
        release_artist_names: albumArtists.length > 0 ? albumArtists : undefined,
        // use data from LZ response, if this Play was originally from LZ Source
        media_player: mediaPlayerName ?? msAdditionalInfo.media_player,
        media_player_version: mediaPlayerVersion ?? msAdditionalInfo.media_player_version,
        music_service: musicService !== undefined ? musicServiceToCononical(musicService) : msAdditionalInfo.music_service,
        music_service_name: musicService ?? source ?? msAdditionalInfo.music_service_name,
        spotify_id: msAdditionalInfo.spotify_id,
        spotify_album_id: msAdditionalInfo.spotify_album_id,
        spotify_artist_ids: msAdditionalInfo.spotify_artist_ids,
        origin_url: msAdditionalInfo.origin_url,
        isrc: isrc ?? msAdditionalInfo.isrc,
        tracknumber: brainz.trackNumber ?? msAdditionalInfo.tracknumber
    };

    if (Object.keys(spotify).length > 0) {
        if (spotify.track !== undefined) {
            const trackUrl = `https://open.spotify.com/track/${spotify.track}`;
            if (addInfo.origin_url === undefined) {
                addInfo.origin_url = trackUrl;
            }
            if (addInfo.spotify_id === undefined) {
                addInfo.spotify_id = trackUrl;
            }
        }
        if (isEmptyArrayOrUndefined(addInfo.spotify_artist_ids) && !isEmptyArrayOrUndefined(spotify.artist)) {
            addInfo.spotify_artist_ids = spotify.artist.map(x => `https://open.spotify.com/artist/${x}`);
        }
        if (isEmptyArrayOrUndefined(addInfo.spotify_album_artist_ids) && !isEmptyArrayOrUndefined(spotify.albumArtist)) {
            addInfo.spotify_album_artist_ids = spotify.albumArtist.map(x => `https://open.spotify.com/artist/${x}`);
        }
        if (addInfo.spotify_album_id === undefined && spotify.album !== undefined) {
            addInfo.spotify_album_id = `https://open.spotify.com/album/${spotify.album}`;
        }
    }

    addInfo = removeUndefinedKeys(addInfo);

    // possible lastfm provides an empty album field when no album data is found
    let al = album;
    if (al !== undefined && al !== null) {
        if (al.trim() === '') {
            al = undefined;
        }
    }

    const minTrackData = removeUndefinedKeys<MinimumTrack>({
        artist_name: Array.from(new Set([...artists])).join(', '),
        track_name: track,
        release_name: al,
    });

    return {
        listened_at: getScrobbleTsSOCDate(play).unix(),
        track_metadata: {
            ...minTrackData,
            additional_info: {
                duration: play.data.duration !== undefined ? Math.round(duration) : undefined,
                track_mbid: brainz.track,
                recording_mbid: brainz.recording,
                artist_mbids: brainz.artist,
                release_mbid: brainz.album,
                release_group_mbid: brainz.releaseGroup,
                submission_client: 'multi-scrobbler',
                submission_client_version: version ?? appVersion,
                ...addInfo
            }
        }
    };
};
export const musicServices = {
    spotify: 'spotify.com',
    bandcamp: 'bandcamp.com',
    ['youtube music']: 'music.youtube.com',
    youtube: 'youtube.com',
    deezer: 'deezer.com',
    tidal: 'tidal.com',
    apple: 'music.apple.com',
    archive: 'archive.org',
    soundcloud: 'soundcloud.com',
    jamendo: 'jamendo.com',
    play: 'play.google.com'
};
/**
 *  Converts MS musicService to LZ cononical Music Service Name, if one exists
 * @see https://listenbrainz.readthedocs.io/en/latest/users/json.html#payload-json-details
 * */


export const musicServiceToCononical = (str?: string): string | undefined => {
    if (str === undefined) {
        return undefined;
    }
    const lower = str.trim().toLocaleLowerCase();
    for (const [k, v] of Object.entries(musicServices)) {
        if (lower.includes(k)) {
            return v;
        }
    }
    return undefined;
};
/**
 *  Returns a known music service based on the given URL
 * @see https://listenbrainz.readthedocs.io/en/latest/users/json.html#payload-json-details
 * */


export const urlToMusicService = (url?: string): string | undefined => {
    if (url === undefined) {
        return undefined;
    }
    const lower = url.trim().toLocaleLowerCase();
    for (const [k, v] of Object.entries(musicServices)) {
        if (url.includes(v)) {
            return k;
        }
    }
    return undefined;
};
export const playToSubmitPayload = (play: PlayObject, options: SubmitOptions = {}): SubmitPayload => {
    const { listenType = 'single' } = options;
    const listenPayload: SubmitPayload = { listen_type: listenType, payload: [playToListenPayload(play)] };
    if (listenType === 'playing_now') {
        delete listenPayload.payload[0].listened_at;
    }
    return listenPayload;
};

