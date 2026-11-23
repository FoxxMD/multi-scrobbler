import { createHash } from "node:crypto";
import { formatPlayObj, type LastFMTrackObject } from "../../common/vendor/LastfmApiClient.ts";
import type { ImportRecord } from "../ImportProvider.ts";

/** Track shape shared by the Last.fm API and every supported export file, before normalization */
export type LastfmTrackLike = Omit<LastFMTrackObject, 'artist' | 'album'> & {
    artist: { '#text'?: string, name?: string, mbid?: string }
    album?: { '#text'?: string, mbid?: string }
};

export const trackUts = (track: LastfmTrackLike): number | undefined => {
    const uts = track.date?.uts;
    if (uts === undefined || uts === null || `${uts}`.trim() === '') {
        return undefined;
    }
    const n = Number.parseInt(`${uts}`, 10);
    return Number.isNaN(n) ? undefined : n;
}

const norm = (val: string | undefined) => (val ?? '').trim().toLocaleLowerCase();

/**
 * Dedupe key built from raw upstream fields so it doesn't change when MS normalization changes,
 * and is the same whether the scrobble came from the API (extended: artist.name) or an export file (artist['#text']).
 * */
export const lastfmRawKey = (track: LastfmTrackLike, uts: number): string => {
    const artist = track.artist?.['#text'] ?? track.artist?.name;
    const hash = createHash('sha1').update(`${norm(artist)}\u0000${norm(track.name)}`).digest('hex').slice(0, 16);
    return `${uts}:${hash}`;
}

/** undefined for records without a timestamp (now playing) */
export const lastfmTrackToRecord = (track: LastfmTrackLike): ImportRecord | undefined => {
    const uts = trackUts(track);
    if (uts === undefined || track['@attr']?.nowplaying === 'true') {
        return undefined;
    }
    const play = formatPlayObj({
        ...track,
        artist: {...track.artist, '#text': track.artist['#text'] as string},
        album: {mbid: track.album?.mbid, '#text': track.album?.['#text'] as string},
    });
    return {play, key: lastfmRawKey(track, uts)};
}
