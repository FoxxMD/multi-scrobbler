import { loggerTest } from "@foxxmd/logging";
import { assert, expect } from 'chai';
import dayjs from "dayjs";
import { describe, it } from 'mocha';
import { http, HttpResponse } from "msw";
import { PlayObject } from "../../../core/Atomic.js";
import { UpstreamError } from "../../common/errors/UpstreamError.js";

import { ListenbrainzApiClient, playToListenPayload, listenResponseToPlay, listenPayloadToPlay } from "../../common/vendor/ListenbrainzApiClient.js";
import { ListenPayload, ListenResponse, SubmitPayload } from '../../common/vendor/listenbrainz/interfaces.js';
import { ExpectedResults } from "../utils/interfaces.js";
import { withRequestInterception } from "../utils/networking.js";
import artistWithProperJoiner from './correctlyMapped/artistProperHasJoinerInName.json' with { type: "json" };
// correct mappings
import multiArtistInArtistName from './correctlyMapped/multiArtistInArtistName.json' with { type: "json" };
import multiArtistsInTrackName from './correctlyMapped/multiArtistInTrackName.json' with { type: "json" };
import multiMappedArtistsWithSingleUserArtist from './correctlyMapped/multiArtistMappingWithSingleRecordedArtist.json' with { type: "json" };
import noArtistMapping from './correctlyMapped/noArtistMapping.json' with { type: "json" };
import normalizedValues from './correctlyMapped/normalizedName.json' with { type: "json" };
import slightlyDifferentNames from './correctlyMapped/trackNameSlightlyDifferent.json' with { type: "json" };

// incorrect mappings
import incorrectMultiArtistsTrackName from './incorrectlyMapped/multiArtistsInTrackName.json' with { type: "json" };
import veryWrong from './incorrectlyMapped/veryWrong.json' with { type: "json" };
import { generatePlay } from "../utils/PlayTestUtils.js";
import { defaultLifecycle } from "../../utils/PlayTransformUtils.js";

interface LZTestFixture {
    data: ListenResponse
    expected: ExpectedResults
}
describe('#PlayParse Listenbrainz Listen Parsing', function () {

    describe('When user-submitted artist/track do NOT match MB mappings', function() {
        it('Uses user submitted values when no artist mappings', async function () {
            for(const test of noArtistMapping as unknown as LZTestFixture[]) {
                const play = listenResponseToPlay(test.data);
                assert.equal(play.data.track, test.expected.track);
                assert.sameDeepMembers(play.data.artists, test.expected.artists);
            }
        });

        it('Uses user-submitted values when when either mapped track/artist do not match', async function () {
            for(const test of veryWrong as unknown as LZTestFixture[]) {
                const play = listenResponseToPlay(test.data);
                assert.equal(play.data.track, test.expected.track);
                assert.sameDeepMembers( play.data.artists, test.expected.artists);
            }
        });

        it('Should extract additional artists from track name', async function () {
            for(const test of incorrectMultiArtistsTrackName as unknown as LZTestFixture[]) {
                const play = listenResponseToPlay(test.data);
                assert.equal(play.data.track, test.expected.track);
                assert.sameDeepMembers(play.data.artists, test.expected.artists);
            }
        });
    })


    describe('#PlayParse When user-submitted artist/track matches a MB mapped value', function() {

        it('Detects slightly different track names as equal', async function () {
            for(const test of slightlyDifferentNames as unknown as LZTestFixture[]) {
                const play = listenResponseToPlay(test.data);
                assert.equal(play.data.track, test.expected.track);
                assert.sameDeepMembers(play.data.artists, test.expected.artists);
            }
        });

        it('Uses all mapped artists', async function () {
            for(const test of multiMappedArtistsWithSingleUserArtist as unknown as LZTestFixture[]) {
                const play = listenResponseToPlay(test.data);
                assert.equal(play.data.track, test.expected.track);
                assert.sameDeepMembers(play.data.artists, test.expected.artists);
            }
        });

        it('Respects artists with joiner symbols in proper names', async function () {
            for(const test of artistWithProperJoiner as unknown as LZTestFixture[]) {
                const play = listenResponseToPlay(test.data);
                assert.equal(play.data.track, test.expected.track);
                assert.sameDeepMembers( play.data.artists, test.expected.artists);
            }
        });

        it('Detects user-submitted artists have joiners', async function () {
            for(const test of multiArtistInArtistName as unknown as LZTestFixture[]) {
                const play = listenResponseToPlay(test.data);
                assert.equal(play.data.track, test.expected.track);
                assert.sameDeepMembers(play.data.artists, test.expected.artists);
            }
        });

        it('Detects artists in user-submitted track', async function () {
            for(const test of multiArtistsInTrackName as unknown as LZTestFixture[]) {
                const play = listenResponseToPlay(test.data);
                assert.equal(play.data.track, test.expected.track);
                assert.sameDeepMembers( play.data.artists, test.expected.artists);
            }
        });

        it('Detects and uses normalized artist/track names', async function () {
            for(const test of normalizedValues as unknown as LZTestFixture[]) {
                const play = listenResponseToPlay(test.data);
                assert.equal(play.data.track, test.expected.track);
                assert.sameDeepMembers( play.data.artists, test.expected.artists);
            }
        });
    });
});

describe('Listenbrainz Response Behavior', function() {

    const client = new ListenbrainzApiClient('test',
        {
            token: 'test',
            username: 'test'
        }, {logger: loggerTest});

    it('Should recognize bad requests as non-showstopping',withRequestInterception(
        [
            http.post('https://api.listenbrainz.org/1/submit-listens', () => {
                return HttpResponse.json({code: 400, error: 'artist_mbids MBID format invalid'}, {status: 400});
            })
        ],
        async function() {
            const play: PlayObject = {
                data: {
                    artists: ['Celldweller'],
                    album: 'The Complete Cellout, Volume 01',
                    track: 'Frozen',
                    duration: 299,
                    playDate: dayjs(),
                    meta: {
                        brainz: {
                            // @ts-expect-error wrong on purpose
                            artist: 'fad8967c-a327-4af5-a64a-d4de66ece652;100846a7-06f6-4129-97ce-4409b9a9a311',
                            album: '2eb6a8fb-14f6-436e-9bdf-2f9d0d8cbae0',
                            recording: '677862e0-3603-4120-8c44-ee9a70893647',
                            releaseGroup: 'bd3bb964-6da7-4d59-b0aa-f8bf639cd419'
                        }
                    }
                },
                meta: {
                    lifecycle: defaultLifecycle()
                }
            }
            try {
                await client.submitListen(play);
            } catch (e) {
                assert.isTrue(e instanceof UpstreamError);
                assert.isTrue(e.showStopper === false);
            }
        }
    ));
});

describe('Listenbrainz Endpoint Behavior', function() {

    it('Should combine artist and artist_names', function() {

        const play = generatePlay({artists: ['Artist A'], albumArtists: []});
        const submitPayload = playToListenPayload(play);

        const additionalArtists = [...submitPayload.track_metadata.additional_info.artist_names, 'Artist B'];

        submitPayload.track_metadata.additional_info.artist_names = additionalArtists;

        const playFromPayload = listenPayloadToPlay(submitPayload);

        expect(playFromPayload.data.artists).to.be.eql(additionalArtists)
        
    });

    it('Should combine artist and artist_names into a unique array', function() {

        const play = generatePlay({artists: ['Artist A'], albumArtists: []});
        const submitPayload = playToListenPayload(play);

        const additionalArtists = ['Artist A', 'Artist B'];

        submitPayload.track_metadata.additional_info.artist_names = additionalArtists;

        const playFromPayload = listenPayloadToPlay(submitPayload);

        expect(playFromPayload.data.artists).to.be.eql(['Artist A', 'Artist B'])
        
    });

    it('Should set music_service_name from source', function() {

        const play = generatePlay({artists: ['Artist A'], albumArtists: []}, {source: 'Plex'});
        const submitPayload = playToListenPayload(play);

        expect(submitPayload.track_metadata.additional_info.music_service_name).to.be.eql('Plex')
        
    });

    it('Should use artist_names if provided, rather than parse artist from string', function () {

        const playFromPayload = listenPayloadToPlay(submit);

        expect(playFromPayload.data.artists).to.be.eql(submit.track_metadata.additional_info.artist_names);

    });

});


const submit: ListenPayload = {
    track_metadata: {
        artist_name: "Télépopmusik feat. Mau",
        track_name: "15 Minutes",
        release_name: "Angel Milk",
        additional_info: {
            submission_client: "navidrome",
            submission_client_version: "0.58.5 (131c0c56)",
            tracknumber: 15,
            artist_names: [
                "Télépopmusik",
                "Mau",
            ],
            artist_mbids: [
                "265f242e-cf4e-4fbe-a3fe-43112387172f",
                "",
            ],
            recording_mbid: "69864bde-4958-484e-bbeb-f9d8f06eb932",
            release_mbid: "90e011e2-1a3b-483c-9684-355601689c0f",
            release_group_mbid: "d1456679-3901-30a6-929c-39d6d84f49a0",
            duration_ms: 939020,
        },
    },
};