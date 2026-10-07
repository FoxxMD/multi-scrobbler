import { describe, it } from 'mocha';
import { expect } from 'chai';
import clone from 'clone';
import type { PlayObject } from '../../../core/Atomic.ts';
import { generateArtistCredits, generatePlay, withBrainz } from '../../../core/tests/utils/PlayTestUtils.ts';
import { dedupAlbumArtists, spotifyMeta, stripCredits, withImage, withMetadata } from '../../../core/MusicMetadata.ts';
import { albumSearchResultSchema, artistSearchResultSchema, trackSearchResultSchema } from '../../../core/Api.ts';
import { generateAlbumSearchResult, generateArtistSearchResult, generateTrackSearchResult } from '../../../core/tests/utils/apiFixtures.ts';
import { nameToCredit } from "../../../core/MusicMetadata.ts";
import {
    metaInvariantTransform,
    playContentBasicInvariantTransform,
    playContentCacheHash,
    playContentInvariantTransform,
    playDateInvariantTransform,
    type PlayTransformer
} from '../../utils/PlayComparisonUtils.ts';
import { hashObject } from '../../utils/StringUtils.ts';

const invariants: Record<string, PlayTransformer> = {
    metaInvariantTransform,
    playDateInvariantTransform,
    playContentInvariantTransform,
    playContentBasicInvariantTransform
};

/** The same play with and without service ids/images on its credits */
const playPair = (): [PlayObject, PlayObject] => {
    const plain = generatePlay({ artists: generateArtistCredits(2, 2, { mbidVal: false }), albumArtists: generateArtistCredits(1, 1, { mbidVal: false }) });
    const rich = withBrainz(clone(plain), { include: ['track', 'recording', 'album', 'releaseGroup', 'artist'] });
    rich.data.track = withMetadata(rich.data.track, spotifyMeta('abc', 'track'));
    rich.data.album = withImage(rich.data.album, 'https://example.com/album.jpg');
    rich.data.albumArtists = rich.data.albumArtists!.map(x => withImage(withMetadata(x, spotifyMeta('def', 'artist')), 'https://example.com/artist.jpg'));
    return [plain, rich];
}

describe('#Play Invariant Transforms', function () {

    for (const [name, transform] of Object.entries(invariants)) {

        describe(name, function () {

            it('is equal for plays that differ only by credit metadata', function () {
                const [plain, rich] = playPair();
                expect(hashObject(plain.data)).to.not.eq(hashObject(rich.data));
                expect(hashObject(transform(rich))).to.eq(hashObject(transform(plain)));
            });

            it('returns credits with only names', function () {
                const [, rich] = playPair();
                const { track, album, artists, albumArtists } = transform(rich).data;
                expect(hashObject({ track, album, artists, albumArtists })).to.eq(hashObject(stripCredits({
                    track: rich.data.track,
                    album: rich.data.album,
                    artists: rich.data.artists,
                    albumArtists: rich.data.albumArtists
                })));
                for (const credit of [track, album, ...artists!, ...albumArtists!]) {
                    expect(Object.keys(credit!)).to.eql(['name']);
                }
            });

            it('is not equal for plays with different names', function () {
                const [plain] = playPair();
                const other = clone(plain);
                other.data.track = nameToCredit(`${plain.data.track!.name} (Different)`);
                expect(hashObject(transform(other))).to.not.eq(hashObject(transform(plain)));

                const otherArtist = clone(plain);
                otherArtist.data.artists![0] = nameToCredit(`${plain.data.artists![0].name} (Different)`);
                expect(hashObject(transform(otherArtist))).to.not.eq(hashObject(transform(plain)));
            });

            it('does not modify the original play', function () {
                const [, rich] = playPair();
                const before = hashObject(rich.data);
                transform(rich);
                expect(hashObject(rich.data)).to.eq(before);
            });
        });
    }

    describe('playContentCacheHash', function () {

        it('differs for plays that differ only by credit metadata', function () {
            const [plain, rich] = playPair();
            expect(playContentCacheHash(rich)).to.not.eq(playContentCacheHash(plain));
        });

        it('is equal for plays that differ only by play date', function () {
            const [, rich] = playPair();
            const later = clone(rich);
            later.data.playDate = rich.data.playDate!.add(10, 'm');
            expect(playContentCacheHash(later)).to.eq(playContentCacheHash(rich));
        });
    });
});

describe('#Album Artists Dedup', function () {

    const artists = [nameToCredit('Artist A'), nameToCredit('Artist B')];

    it('removes album artists that are all track artists', function () {
        expect(dedupAlbumArtists({ artists, albumArtists: [nameToCredit(' artist a')] })).to.not.have.property('albumArtists');
        expect(dedupAlbumArtists({ artists, albumArtists: [...artists] })).to.not.have.property('albumArtists');
    });

    it('removes empty album artists', function () {
        expect(dedupAlbumArtists({ artists, albumArtists: [] })).to.not.have.property('albumArtists');
    });

    it('keeps album artists when any is not a track artist', function () {
        const albumArtists = [nameToCredit('Artist A'), nameToCredit('Various Artists')];
        expect(dedupAlbumArtists({ artists, albumArtists }).albumArtists).to.eql(albumArtists);
        expect(dedupAlbumArtists({ albumArtists }).albumArtists).to.eql(albumArtists);
    });
});

describe('#Metadata Search Results', function () {

    it('are Credit and TrackData shapes', function () {
        expect(() => trackSearchResultSchema.parse(generateTrackSearchResult())).to.not.throw();
        expect(() => albumSearchResultSchema.parse(generateAlbumSearchResult())).to.not.throw();
        expect(() => artistSearchResultSchema.parse(generateArtistSearchResult())).to.not.throw();
    });
});
