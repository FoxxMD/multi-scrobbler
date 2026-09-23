import { loggerTest } from '@foxxmd/logging';
import { Cacheable } from 'cacheable';
import chai, { expect } from 'chai';
import asPromised from 'chai-as-promised';
import { before, describe, it } from 'mocha';
import dayjs from 'dayjs';
import type { PlayObject } from '../../../core/Atomic.ts';
import { initMemoryCache } from '../../common/Cache.ts';
import SpotifyTransformer, {
    COMPILATION_PENALTY,
    missingSpotifyTypes,
    parseStageConfig,
    rankTracksBySimilarity,
    type SpotifyTransformerDataStage,
} from '../../common/transforms/SpotifyTransformer.ts';
import type { SpotifyTransformerConfig } from '../../common/transforms/spotify/SpotifyTransformerUtil.ts';
import { isCompilation, trackToPlay } from '../../common/vendor/spotify/SpotifyApiClient.ts';

chai.use(asPromised);

const basePlay = (data: Partial<PlayObject['data']> = {}, meta: Partial<PlayObject['meta']> = {}): PlayObject => ({
    data: {
        track: 'My Track',
        artists: [{ name: 'My Artist' }],
        album: 'My Album',
        duration: 180,
        ...data,
    },
    meta: {
        seenAt: dayjs(),
        ...meta,
    },
});

const artist = (id: string, name: string): SpotifyApi.ArtistObjectSimplified => ({ id, name } as SpotifyApi.ArtistObjectSimplified);

const fakeTrack = (opts: {
    id?: string,
    name?: string,
    artists?: SpotifyApi.ArtistObjectSimplified[],
    albumName?: string,
    albumId?: string,
    albumArtists?: SpotifyApi.ArtistObjectSimplified[],
    albumType?: string,
    isrc?: string,
    durationMs?: number,
} = {}): SpotifyApi.TrackObjectFull => {
    const {
        id = 'track1',
        name = 'My Track',
        artists = [artist('artist1', 'My Artist')],
        albumName = 'My Album',
        albumId = 'album1',
        albumArtists = artists,
        albumType = 'album',
        isrc = 'USRC17607839',
        durationMs = 180000,
    } = opts;

    return {
        id,
        name,
        artists,
        duration_ms: durationMs,
        external_ids: { isrc },
        album: {
            id: albumId,
            name: albumName,
            artists: albumArtists,
            album_type: albumType,
        },
    } as unknown as SpotifyApi.TrackObjectFull;
};

const memorycache = () => new Cacheable({ primary: initMemoryCache({ ttl: '1ms' }) });

const createSpotifyTransformer = (config: Partial<SpotifyTransformerConfig> = {}) => {
    const transformer = new SpotifyTransformer({
        name: 'test',
        type: 'spotify',
        data: {
            clientId: 'test-client-id',
            clientSecret: 'test-client-secret',
        },
        ...config,
    } as SpotifyTransformerConfig, {
        logger: loggerTest,
        cache: memorycache(),
        clientCache: memorycache(),
    });
    return transformer;
}

describe('Spotify Transformer', function () {

    describe('parseStageConfig', function () {

        it('applies defaults when no data is given', function () {
            const config = parseStageConfig();
            expect(config.score).to.equal(0.6);
            expect(config.searchWhenMissing).to.deep.equal(['artists', 'title', 'album', 'duration']);
        });

        it('converts weight shorthand (true) to library default weight constants', function () {
            const config = parseStageConfig({ titleWeight: true, artistWeight: true, albumWeight: true });
            expect(config.titleWeight).to.be.a('number').and.to.be.greaterThan(0);
            expect(config.artistWeight).to.be.a('number').and.to.be.greaterThan(0);
            expect(config.albumWeight).to.equal(0.3);
        });

        it('parses searchOrder', function () {
            const config = parseStageConfig({ searchOrder: ['ISRC', 'basic' as any] });
            expect(config.searchOrder).to.deep.equal(['isrc', 'basic']);
        });

        it('throws on an invalid searchOrder value', function () {
            expect(() => parseStageConfig({ searchOrder: ['bogus' as any] })).to.throw();
        });
    });

    describe('missingSpotifyTypes', function () {

        it('returns all types when no spotify meta or duration exists', function () {
            const play = basePlay({ duration: undefined });
            const missing = missingSpotifyTypes(play);
            expect(missing).to.include.members(['duration', 'artists', 'title', 'album']);
        });

        it('returns empty when all spotify ids and duration are present', function () {
            const play = basePlay({}, {});
            play.data.meta = { spotify: { track: 't1', album: 'a1', artist: ['ar1'] } };
            const missing = missingSpotifyTypes(play);
            expect(missing).to.be.empty;
        });

        it('flags artists as missing when spotify artist id count does not match play artist count', function () {
            const play = basePlay({ artists: [{ name: 'One' }, { name: 'Two' }] });
            play.data.meta = { spotify: { track: 't1', album: 'a1', artist: ['ar1'] } };
            const missing = missingSpotifyTypes(play);
            expect(missing).to.include('artists');
        });
    });

    describe('trackToPlay', function () {

        it('maps core fields and does not duplicate album artists that match track artists', function () {
            const track = fakeTrack();
            const play = trackToPlay(track);
            expect(play.data.track).to.equal('My Track');
            expect(play.data.album).to.equal('My Album');
            expect(play.data.isrc).to.equal('USRC17607839');
            expect(play.data.duration).to.equal(180);
            expect(play.data.artists).to.deep.equal([{ name: 'My Artist' }]);
            expect(play.data.albumArtists).to.deep.equal([]);
            expect(play.data.meta.spotify.track).to.equal('track1');
            expect(play.data.meta.spotify.album).to.equal('album1');
        });

        it('includes album artists when they differ from track artists', function () {
            const track = fakeTrack({
                artists: [artist('artist1', 'Featured Artist')],
                albumArtists: [artist('artist2', 'Various Artists')],
            });
            const play = trackToPlay(track);
            expect(play.data.albumArtists).to.deep.equal([{ name: 'Various Artists' }]);
        });
    });

    describe('isCompilation', function () {
        it('detects a compilation album', function () {
            expect(isCompilation(fakeTrack({ albumType: 'compilation' }))).to.be.true;
            expect(isCompilation(fakeTrack({ albumType: 'album' }))).to.be.false;
        });
    });

    describe('rankTracksBySimilarity', function () {

        const stageConfig = { type: 'spotify' } as SpotifyTransformerDataStage;

        it('ranks the candidate closest to the original scrobble highest', function () {
            const play = basePlay({ track: 'Little Joe and Mary', artists: [{ name: 'Khruangbin' }], album: 'The Universe Smiles Upon You' });

            const goodMatch = fakeTrack({
                id: 'good',
                name: 'Little Joe and Mary',
                artists: [artist('a1', 'Khruangbin')],
                albumName: 'The Universe Smiles Upon You',
            });
            const badMatch = fakeTrack({
                id: 'bad',
                name: 'Some Other Song',
                artists: [artist('a2', 'Some Other Artist')],
                albumName: 'Some Other Album',
            });

            const ranked = rankTracksBySimilarity([badMatch, goodMatch], play, stageConfig);
            expect(ranked[0].track.id).to.equal('good');
            expect(ranked[0].matchScore).to.be.greaterThan(ranked[1].matchScore);
        });

        it('deprioritizes compilation matches when configured', function () {
            const play = basePlay({ track: 'Little Joe and Mary', artists: [{ name: 'Khruangbin' }], album: 'The Universe Smiles Upon You' });

            // identical text match on both candidates -- only the compilation flag differs
            const compilationMatch = fakeTrack({ id: 'comp', albumType: 'compilation' });
            const studioMatch = fakeTrack({ id: 'studio', albumType: 'album' });

            const withoutDeprioritize = rankTracksBySimilarity([compilationMatch, studioMatch], play, stageConfig);
            expect(withoutDeprioritize[0].matchScore).to.equal(withoutDeprioritize[1].matchScore);

            const withDeprioritize = rankTracksBySimilarity([compilationMatch, studioMatch], play, { ...stageConfig, deprioritizeCompilations: true });
            const ranked = new Map(withDeprioritize.map(x => [x.track.id, x.matchScore]));
            expect(ranked.get('studio')).to.be.greaterThan(ranked.get('comp'));
            expect(ranked.get('studio') - ranked.get('comp')).to.be.closeTo(COMPILATION_PENALTY, 0.0001);
        });
    });

    describe('handlePostFetch', function () {

        const stageConfig = { type: 'spotify' } as SpotifyTransformerDataStage;

        let transformer: SpotifyTransformer;

        before(async function () {
            transformer = createSpotifyTransformer();
            await transformer.initialize();
        });

        it('uses an ISRC match even when its title/artist text scores below the minimum threshold', async function () {
            // scrobble source title is drastically different from the Spotify catalog title (localized/theatrical
            // edition naming) but the ISRC identifies it as the same recording
            const play = basePlay({ track: 'KAISEI:Movie Edition from Project SEKAI', artists: [{ name: 'Project SEKAI' }], isrc: 'JPPO02201234' });
            const track = fakeTrack({ name: '快晴「劇場版プロジェクトセカイ」ver.', artists: [artist('a1', 'Project SEKAI')], isrc: 'JPPO02201234' });

            const result = await transformer.handlePostFetch(play, { tracks: [track], requestQueries: [], searchType: 'isrc' }, stageConfig);
            expect(result.data.track).to.equal('快晴「劇場版プロジェクトセカイ」ver.');
        });

        it('still filters a basic-search match by the minimum score threshold', async function () {
            const play = basePlay({ track: 'KAISEI:Movie Edition from Project SEKAI', artists: [{ name: 'Project SEKAI' }], album: 'Original Soundtrack' });
            const track = fakeTrack({ name: '快晴「劇場版プロジェクトセカイ」ver.', artists: [artist('a1', 'Project SEKAI')], albumName: 'Theatrical Edition Single' });

            await expect(transformer.handlePostFetch(play, { tracks: [track], requestQueries: [], searchType: 'basic' }, stageConfig)).to.be.rejected;
        });

        it('picks the best-matching candidate by fuzzy score when an ISRC returns more than one album', async function () {
            const play = basePlay({ track: 'My Track', artists: [{ name: 'My Artist' }], album: 'The Real Album', isrc: 'USRC17607839' });
            const wrongAlbum = fakeTrack({ id: 'wrong', albumName: 'Some Compilation', isrc: 'USRC17607839' });
            const rightAlbum = fakeTrack({ id: 'right', albumName: 'The Real Album', isrc: 'USRC17607839' });

            const result = await transformer.handlePostFetch(play, { tracks: [wrongAlbum, rightAlbum], requestQueries: [], searchType: 'isrc' }, stageConfig);
            expect(result.data.meta.spotify.track).to.equal('right');
        });
    });
});
