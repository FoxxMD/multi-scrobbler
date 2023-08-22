import {describe, it} from 'mocha';
import {assert} from 'chai';
// correct mappings
import multiArtistInArtistName from './listenbrainz/correctlyMapped/multiArtistInArtistName.json';
import multiArtistsInTrackName from './listenbrainz/correctlyMapped/multiArtistInTrackName.json';
import noArtistMapping from './listenbrainz/correctlyMapped/noArtistMapping.json';
import multiMappedArtistsWithSingleUserArtist from './listenbrainz/correctlyMapped/multiArtistMappingWithSingleRecordedArtist.json';
import artistWithProperJoiner from './listenbrainz/correctlyMapped/artistProperHasJoinerInName.json';
import normalizedValues from './listenbrainz/correctlyMapped/normalizedName.json';
import slightlyDifferentNames from './listenbrainz/correctlyMapped/trackNameSlightlyDifferent.json';

// incorrect mappings
import incorrectMultiArtistsTrackName from './listenbrainz/incorrectlyMapped/multiArtistsInTrackName.json';
import veryWrong from './listenbrainz/incorrectlyMapped/veryWrong.json';

import {ListenbrainzApiClient, ListenResponse} from "../apis/ListenbrainzApiClient";

interface ExpectedResults {
    artists: string[]
    track: string
}
interface LZTestFixture {
    data: ListenResponse
    expected: ExpectedResults
}
describe('Listenbrainz Listen Parsing', function () {

    describe('When user-submitted artist/track do NOT match MB mappings', function() {
        it('Uses user submitted values when no artist mappings', async function () {
            for(const test of noArtistMapping as unknown as LZTestFixture[]) {
                const play = ListenbrainzApiClient.listenResponseToPlay(test.data);
                assert.equal(play.data.track, test.expected.track);
                assert.sameDeepMembers(play.data.artists, test.expected.artists);
            }
        });

        it('Uses user-submitted values when when either mapped track/artist do not match', async function () {
            for(const test of veryWrong as unknown as LZTestFixture[]) {
                const play = ListenbrainzApiClient.listenResponseToPlay(test.data);
                assert.equal(play.data.track, test.expected.track);
                assert.sameDeepMembers( play.data.artists, test.expected.artists);
            }
        });

        it('Should extract additional artists from track name', async function () {
            for(const test of incorrectMultiArtistsTrackName as unknown as LZTestFixture[]) {
                const play = ListenbrainzApiClient.listenResponseToPlay(test.data);
                assert.equal(play.data.track, test.expected.track);
                assert.sameDeepMembers(play.data.artists, test.expected.artists);
            }
        });
    })


    describe('When user-submitted artist/track matches a MB mapped value', function() {

        it('Detects slightly different track names as equal', async function () {
            for(const test of slightlyDifferentNames as unknown as LZTestFixture[]) {
                const play = ListenbrainzApiClient.listenResponseToPlay(test.data);
                assert.equal(play.data.track, test.expected.track);
                assert.sameDeepMembers(play.data.artists, test.expected.artists);
            }
        });

        it('Uses all mapped artists', async function () {
            for(const test of multiMappedArtistsWithSingleUserArtist as unknown as LZTestFixture[]) {
                const play = ListenbrainzApiClient.listenResponseToPlay(test.data);
                assert.equal(play.data.track, test.expected.track);
                assert.sameDeepMembers(play.data.artists, test.expected.artists);
            }
        });

        it('Respects artists with joiner symbols in proper names', async function () {
            for(const test of artistWithProperJoiner as unknown as LZTestFixture[]) {
                const play = ListenbrainzApiClient.listenResponseToPlay(test.data);
                assert.equal(play.data.track, test.expected.track);
                assert.sameDeepMembers( play.data.artists, test.expected.artists);
            }
        });

        it('Detects user-submitted artists have joiners', async function () {
            for(const test of multiArtistInArtistName as unknown as LZTestFixture[]) {
                const play = ListenbrainzApiClient.listenResponseToPlay(test.data);
                assert.equal(play.data.track, test.expected.track);
                assert.sameDeepMembers(play.data.artists, test.expected.artists);
            }
        });

        it('Detects artists in user-submitted track', async function () {
            for(const test of multiArtistsInTrackName as unknown as LZTestFixture[]) {
                const play = ListenbrainzApiClient.listenResponseToPlay(test.data);
                assert.equal(play.data.track, test.expected.track);
                assert.sameDeepMembers( play.data.artists, test.expected.artists);
            }
        });

        it('Detects and uses normalized artist/track names', async function () {
            for(const test of normalizedValues as unknown as LZTestFixture[]) {
                const play = ListenbrainzApiClient.listenResponseToPlay(test.data);
                assert.equal(play.data.track, test.expected.track);
                assert.sameDeepMembers( play.data.artists, test.expected.artists);
            }
        });
    });
});
