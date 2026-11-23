import { expect } from 'chai';
import { describe, it } from 'mocha';
import { creditId, creditIds, creditMbid, creditsToNames, playImage } from '../../../core/MusicMetadata.ts';
import { rockskyScrobbleToPlay, songViewToPlay, type RockskyScrobble } from '../../common/vendor/RockSkyApiClient.ts';

describe('Rocksky to Play', function () {

    it('reads ids, artists and duration from a repository scrobble record', function () {
        const record = {
            title: 'Song',
            artist: 'A, B',
            albumArtist: 'A',
            album: 'Album',
            duration: 180000,
            createdAt: '2026-01-01T00:00:00.000Z',
            mbid: 'rec-mbid',
            isrc: 'USAAA0000001',
            spotifyLink: 'https://open.spotify.com/track/abc123?si=x',
            artists: [{name: 'A', mbid: 'a-mbid'}, {name: 'B'}, {mbid: 'no-name'}],
            albumArt: {$type: 'blob', ref: {$link: 'x'}, mimeType: 'image/jpeg', size: 1},
            albumArtUrl: 'https://img/art.jpg',
        } as unknown as RockskyScrobble;
        const {data} = rockskyScrobbleToPlay(record);
        expect(creditMbid(data.track, 'recording')).eq('rec-mbid');
        expect(creditId(data.track, 'isrc')).eq('USAAA0000001');
        expect(creditId(data.track, 'spotify', 'track')).eq('abc123');
        expect(creditsToNames(data.artists)).eql(['A', 'B']);
        expect(creditIds(data.artists, 'musicbrainz', 'artist')).eql(['a-mbid']);
        expect(data.duration).eq(180);
        expect(playImage(data)).eq('https://img/art.jpg');
    });

    it('falls back to the artist string without an artists list', function () {
        const {data} = rockskyScrobbleToPlay({title: 'Song', artist: 'A, B', album: 'Album', albumArt: 'https://img/a.jpg', createdAt: '2026-01-01T00:00:00.000Z'});
        expect(creditsToNames(data.artists)).eql(['A, B']);
        expect(data.duration).eq(undefined);
        expect(playImage(data)).eq('https://img/a.jpg');
    });

    it('reads release and spotify ids from a song view', function () {
        const {data} = songViewToPlay({requestQuery: '', title: 'Song', artist: 'A', album: 'Album', mbId: 'rec-mbid', mbReleaseId: 'rel-mbid', spotifyLink: 'https://open.spotify.com/intl-de/track/abc123'});
        expect(creditMbid(data.track, 'recording')).eq('rec-mbid');
        expect(creditMbid(data.album, 'release')).eq('rel-mbid');
        expect(creditId(data.track, 'spotify', 'track')).eq('abc123');
    });
});
