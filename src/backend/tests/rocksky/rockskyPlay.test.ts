import { expect } from 'chai';
import { describe, it } from 'mocha';
import dayjs from 'dayjs';
import type { PlayObject } from '../../../core/PlaySchema.ts';
import { creditId, creditIds, creditMbid, creditsToNames, mbMeta, nameToCredit, playImage, spotifyMeta, withImage } from '../../../core/MusicMetadata.ts';
import { playToRockskyAgentRecord, playToRockskyClientRecord, publicAlbumArt, rockskyScrobbleToPlay, songViewToPlay, type RockskyScrobble } from '../../common/vendor/RockSkyApiClient.ts';

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

describe('Play to Rocksky', function () {

    const play = (image: string) => ({
        data: {
            track: nameToCredit('Song', spotifyMeta('abc123', 'track')),
            artists: [nameToCredit('A', mbMeta('a-mbid', 'artist')), nameToCredit('B')],
            album: withImage(nameToCredit('Album'), image),
            duration: 180,
            playDate: dayjs(),
        },
        meta: {}
    }) as PlayObject;

    it('sends artists with mbids, spotify link and public album art', function () {
        const rec = playToRockskyAgentRecord(play('https://i.scdn.co/image/x'));
        expect(rec.artists).eql([{name: 'A', mbid: 'a-mbid'}, {name: 'B'}]);
        expect(rec.spotifyLink).eq('https://open.spotify.com/track/abc123');
        expect(rec.albumArtUrl).eq('https://i.scdn.co/image/x');
        expect(playToRockskyClientRecord(play('https://i.scdn.co/image/x')).albumArt).eq('https://i.scdn.co/image/x');
    });

    it('does not send album art from a local server', function () {
        expect(publicAlbumArt(play('/api/components/1/art?ratingKey=1'))).eq(undefined);
        expect(publicAlbumArt(play('http://192.168.1.10:8096/Items/1/Images/Primary'))).eq(undefined);
        expect(publicAlbumArt(play('http://192.168.1.10/proxy?u=scdn.co'))).eq(undefined);
    });
});
