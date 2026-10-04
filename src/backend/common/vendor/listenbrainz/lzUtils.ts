import {NO_DEVICE, type PlayObject} from "../../../../core/Atomic.ts";
import { isEmptyArrayOrUndefined } from "../../../utils.ts";
import { removeUndefinedKeys } from '../../../../core/DataUtils.ts';
import { getScrobbleTsSOCDate } from "../../../utils/TimeUtils.ts";
import type {SubmitOptions} from "../ListenbrainzApiClient.ts";
import type {ListenPayload, MinimumTrack, SubmitListenAdditionalTrackInfo, SubmitPayload} from "../../../../core/vendor/listenbrainz/interfaces.ts";
import {version as appVersion } from '../../../version.ts';
import { creditsToNames } from "../../../../core/StringUtils.ts";
import { creditId, creditIds, creditMbid } from "../../../../core/MusicMetadata.ts";

export type AllowDeviceList = Record<string, string>;
/**
 * Match a device id against an explicitly enumerated allowlist and return the label to submit, or undefined if not allowed.
 *
 * Keys match as case-insensitive substrings of the device id, longest match wins. Returns the key's value, or the key itself
 * when the value is empty
 * 
 * EX
 * allowList: 
 * {
 *   'iphone': '',
 *   '3ec9a-iphone': 'kitchen ipad'
 * };
 * 
 * deviceId => 3ec9a-iphone => picks 'kitchen ipad'
 * deviceId => momSmith-iphone => picks 'iphone'
 */
export const matchDeviceLabel = (deviceId: string | undefined, allowList: AllowDeviceList | undefined): string | undefined => {
    if (deviceId === undefined || deviceId === NO_DEVICE || allowList === undefined) {
        return undefined;
    }
    const haystack = deviceId.toLocaleLowerCase();
    let best: [string, string] | undefined;
    for (const [match, label] of Object.entries(allowList)) {
        if (match !== '' && haystack.includes(match.toLocaleLowerCase())
            && (best === undefined || match.length > best[0].length)) {
            best = [match, label];
        }
    }
    if (best === undefined) {
        return undefined;
    }
    return best[1] === '' ? best[0] : best[1];
};

export interface PlayToListenPayloadOptions {
    version?: string
    /** See matchDeviceLabel */
    allowDeviceList?: AllowDeviceList
    includePlayPosition?: boolean
}

export const playToListenPayload = (play: PlayObject, options: PlayToListenPayloadOptions = {}): ListenPayload => {
    const { version, allowDeviceList, includePlayPosition = false } = options;
    const {
        data: {
            playDate,
            artists = [],
            // MB doesn't use this during submission AFAIK
            // instead it relies on (assumes??) you will submit album/release group/etc where album artist gets credit on an individual release
            albumArtists = [],
            album, 
            track, 
            isrc, 
            duration, 
            meta: {
                brainz = {}, 
            } = {}
        }, meta: {
            mediaPlayerName, mediaPlayerVersion, musicService, source, deviceId
        }
    } = play;
    // using submit-listens exmaple from openapi https://rain0r.github.io/listenbrainz-openapi/index.html#/lbCore/submitListens
    // which is documented in official docs https://listenbrainz.readthedocs.io/en/latest/users/api/index.html#openapi-specification
    // and based on this LZ developer comment https://github.com/lyarenei/jellyfin-plugin-listenbrainz/issues/10#issuecomment-1253867941
    const msAdditionalInfo = brainz.additionalInfo ?? {};

    let addInfo: SubmitListenAdditionalTrackInfo = {
        // primary artists
        artist_names: Array.from(new Set(creditsToNames(artists))),
        // primary artist
        release_artist_name: albumArtists.length === 1 ? albumArtists[0].name : undefined,
        release_artist_names: albumArtists.length > 0 ? creditsToNames(albumArtists) : undefined,
        // use data from LZ response, if this Play was originally from LZ Source
        media_player: mediaPlayerName ?? msAdditionalInfo.media_player ?? matchDeviceLabel(deviceId, allowDeviceList),
        media_player_version: mediaPlayerVersion ?? msAdditionalInfo.media_player_version,
        music_service: musicService !== undefined ? musicServiceToCononical(musicService) : msAdditionalInfo.music_service,
        music_service_name: musicService ?? source ?? msAdditionalInfo.music_service_name,
        spotify_id: msAdditionalInfo.spotify_id,
        spotify_album_id: msAdditionalInfo.spotify_album_id,
        spotify_artist_ids: msAdditionalInfo.spotify_artist_ids,
        origin_url: msAdditionalInfo.origin_url,
        isrc: isrc ?? msAdditionalInfo.isrc,
        tracknumber: brainz.trackNumber ?? msAdditionalInfo.tracknumber,
        duration_played: play.data.listenedFor !== undefined ? Math.floor(play.data.listenedFor) : undefined
    };
    if(includePlayPosition && play.meta.trackProgressPosition !== undefined) {
        addInfo.position_ms = play.meta.trackProgressPosition * 1000;
    }

    const spotifyUrl = (type: 'track' | 'album' | 'artist', id: string) => `https://open.spotify.com/${type}/${id}`;
    const spotifyTrack = creditId(track, 'spotify', 'track'),
        spotifyAlbum = creditId(album, 'spotify', 'album'),
        spotifyArtists = creditIds(artists, 'spotify', 'artist'),
        spotifyAlbumArtists = creditIds(albumArtists, 'spotify', 'artist');

    if (spotifyTrack !== undefined) {
        const trackUrl = spotifyUrl('track', spotifyTrack);
        if (addInfo.origin_url === undefined) {
            addInfo.origin_url = trackUrl;
        }
        if (addInfo.spotify_id === undefined) {
            addInfo.spotify_id = trackUrl;
        }
    }
    if (isEmptyArrayOrUndefined(addInfo.spotify_artist_ids) && spotifyArtists.length > 0) {
        addInfo.spotify_artist_ids = spotifyArtists.map(x => spotifyUrl('artist', x));
    }
    if (isEmptyArrayOrUndefined(addInfo.spotify_album_artist_ids) && spotifyAlbumArtists.length > 0) {
        addInfo.spotify_album_artist_ids = spotifyAlbumArtists.map(x => spotifyUrl('artist', x));
    }
    if (addInfo.spotify_album_id === undefined && spotifyAlbum !== undefined) {
        addInfo.spotify_album_id = spotifyUrl('album', spotifyAlbum);
    }

    addInfo = removeUndefinedKeys(addInfo, false);

    // possible lastfm provides an empty album field when no album data is found
    let al = album?.name;
    if (al !== undefined && al !== null) {
        if (al.trim() === '') {
            al = undefined;
        }
    }
    // only mbids we know belong to an artist are attached to credits, fall back to the mbids LZ originally gave us (if any)
    const artistMbids = creditIds(artists, 'musicbrainz', 'artist');

    const minTrackData = removeUndefinedKeys<MinimumTrack>({
        artist_name: Array.from(new Set(creditsToNames(artists))).join(', '),
        // track name is required by LZ, an empty value will be rejected upstream
        // but we don't throw here since this is also used to build payloads for logging failed scrobbles
        track_name: track?.name ?? '',
        release_name: al,
    }, false);

    return {
        listened_at: getScrobbleTsSOCDate(play).unix(),
        track_metadata: {
            ...minTrackData,
            additional_info: {
                duration: duration !== undefined ? Math.round(duration) : undefined,
                track_mbid: creditMbid(track, 'track'),
                recording_mbid: creditMbid(track, 'recording'),
                artist_mbids: artistMbids.length > 0 ? artistMbids : msAdditionalInfo.artist_mbids,
                release_mbid: creditMbid(album, 'release'),
                release_group_mbid: creditMbid(album, 'release-group'),
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
    const { listenType = 'single', allowDeviceList, includePlayPosition } = options;
    const listenPayload: SubmitPayload = { listen_type: listenType, payload: [playToListenPayload(play, {allowDeviceList, includePlayPosition})] };
    if (listenType === 'playing_now') {
        delete listenPayload.payload[0].listened_at;
    }
    return listenPayload;
};

