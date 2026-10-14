import { loggerTest } from "@foxxmd/logging";
import { assert, expect } from 'chai';
import dayjs from "dayjs";
import { describe, it } from 'mocha';
import { http, HttpResponse } from "msw";
import {NO_DEVICE, type PlayObject} from "../../../core/Atomic.ts";
import { UpstreamError } from "../../common/errors/UpstreamError.ts";

import { ListenbrainzApiClient, listenResponseToPlay, listenPayloadToPlay } from "../../common/vendor/ListenbrainzApiClient.ts";
import { playToListenPayload } from '../../common/vendor/listenbrainz/lzUtils.ts';
import type {ListenPayload, ListenResponse} from '../../../core/vendor/listenbrainz/interfaces.ts';
import type {ExpectedResults} from "../utils/interfaces.ts";
import { withRequestInterception } from "../utils/networking.ts";
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
import { generatePlay } from "../../../core/tests/utils/PlayTestUtils.ts";
import { nameToCredit, creditsToNames, namesToCredits } from "../../../core/MusicMetadata.ts";
import { playStateFromRequest } from "../../sources/EndpointListenbrainzSource.ts";

interface LZTestFixture {
    data: ListenResponse
    expected: ExpectedResults
}
describe('#PlayParse Listenbrainz Listen Parsing', function () {

    describe('When user-submitted artist/track do NOT match MB mappings', function() {
        it('Uses user submitted values when no artist mappings', async function () {
            for(const test of noArtistMapping as unknown as LZTestFixture[]) {
                const play = listenResponseToPlay(test.data);
                assert.equal(play.data.track?.name, test.expected.track);
                assert.sameDeepMembers(creditsToNames(play.data.artists!), test.expected.artists);
            }
        });

        it('Uses user-submitted values when when either mapped track/artist do not match', async function () {
            for(const test of veryWrong as unknown as LZTestFixture[]) {
                const play = listenResponseToPlay(test.data);
                assert.equal(play.data.track?.name, test.expected.track);
                assert.sameDeepMembers( creditsToNames(play.data.artists!), test.expected.artists);
            }
        });

        it('Should extract additional artists from track name', async function () {
            for(const test of incorrectMultiArtistsTrackName as unknown as LZTestFixture[]) {
                const play = listenResponseToPlay(test.data);
                assert.equal(play.data.track?.name, test.expected.track);
                assert.sameDeepMembers(creditsToNames(play.data.artists!), test.expected.artists);
            }
        });
    })


    describe('#PlayParse When user-submitted artist/track matches a MB mapped value', function() {

        it('Detects slightly different track names as equal', async function () {
            for(const test of slightlyDifferentNames as unknown as LZTestFixture[]) {
                const play = listenResponseToPlay(test.data);
                assert.equal(play.data.track?.name, test.expected.track);
                assert.sameDeepMembers(creditsToNames(play.data.artists!), test.expected.artists);
            }
        });

        it('Uses all mapped artists', async function () {
            for(const test of multiMappedArtistsWithSingleUserArtist as unknown as LZTestFixture[]) {
                const play = listenResponseToPlay(test.data);
                assert.equal(play.data.track?.name, test.expected.track);
                assert.sameDeepMembers(creditsToNames(play.data.artists!), test.expected.artists);
            }
        });

        it('Respects artists with joiner symbols in proper names', async function () {
            for(const test of artistWithProperJoiner as unknown as LZTestFixture[]) {
                const play = listenResponseToPlay(test.data);
                assert.equal(play.data.track?.name, test.expected.track);
                assert.sameDeepMembers( creditsToNames(play.data.artists!), test.expected.artists);
            }
        });

        it('Detects user-submitted artists have joiners', async function () {
            for(const test of multiArtistInArtistName as unknown as LZTestFixture[]) {
                const play = listenResponseToPlay(test.data);
                assert.equal(play.data.track?.name, test.expected.track);
                assert.sameDeepMembers(creditsToNames(play.data.artists!), test.expected.artists);
            }
        });

        it('Detects artists in user-submitted track', async function () {
            for(const test of multiArtistsInTrackName as unknown as LZTestFixture[]) {
                const play = listenResponseToPlay(test.data);
                assert.equal(play.data.track?.name, test.expected.track);
                assert.sameDeepMembers(creditsToNames(play.data.artists!), test.expected.artists);
            }
        });

        it('Detects and uses normalized artist/track names', async function () {
            for(const test of normalizedValues as unknown as LZTestFixture[]) {
                const play = listenResponseToPlay(test.data);
                assert.equal(play.data.track?.name, test.expected.track);
                assert.sameDeepMembers(creditsToNames(play.data.artists!), test.expected.artists);
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
                    artists: namesToCredits(['Celldweller']),
                    album: nameToCredit('The Complete Cellout, Volume 01'),
                    track: nameToCredit('Frozen'),
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
                }
            }
            try {
                await client.submitListen(play);
            } catch (e: any) {
                assert.isTrue(e instanceof UpstreamError);
                assert.isTrue(e.showStopper === false);
            }
        }
    ));

    it('Should retry non bad-requests',async function () {
        await withRequestInterception(
        [
            http.post('https://api.listenbrainz.org/1/submit-listens', function* () {
                let hit = false;

                while(!hit) {
                    hit = true;
                    yield HttpResponse.text('Gateway', {status: 503});
                }
                return HttpResponse.text('OK', {status: 200});
            })
        ],
        async function() {
            const play: PlayObject = {
                data: {
                    artists: namesToCredits(['Celldweller']),
                    album: nameToCredit('The Complete Cellout, Volume 01'),
                    track: nameToCredit('Frozen'),
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
                }
            }
            const res = await client.submitListen(play);
            expect(res.response).eq('OK');
        }
    )();
    })
});

describe('Listenbrainz Endpoint Behavior', function() {

    it('Should combine artist and artist_names', function() {

        const play = generatePlay({artists: namesToCredits(['Artist A']), albumArtists: []});
        const submitPayload = playToListenPayload(play);

        const additionalArtists = [...submitPayload.track_metadata.additional_info!.artist_names!, 'Artist B'];

        submitPayload.track_metadata.additional_info!.artist_names = additionalArtists;

        const playFromPayload = listenPayloadToPlay(submitPayload);

        expect(creditsToNames(playFromPayload.data.artists!)).to.be.eql(additionalArtists)
        
    });

    it('Should combine artist and artist_names into a unique array', function() {

        const play = generatePlay({artists: namesToCredits(['Artist A']), albumArtists: []});
        const submitPayload = playToListenPayload(play);

        const additionalArtists = ['Artist A', 'Artist B'];

        submitPayload.track_metadata.additional_info!.artist_names = additionalArtists;

        const playFromPayload = listenPayloadToPlay(submitPayload);

        expect(creditsToNames(playFromPayload.data.artists!)).to.be.eql(['Artist A', 'Artist B'])
        
    });

    it('Should set music_service_name from source', function() {

        const play = generatePlay({artists: namesToCredits(['Artist A']), albumArtists: []}, {source: 'Plex'});
        const submitPayload = playToListenPayload(play);

        expect(submitPayload.track_metadata.additional_info!.music_service_name).to.be.eql('Plex')
        
    });

    it('Should not include any device info as media_player by default', function() {

        const play = generatePlay({artists: namesToCredits(['Artist A']), albumArtists: []}, {deviceId: 'a1b2c3d4e5-iPhone'});
        const submitPayload = playToListenPayload(play);

        expect(submitPayload.track_metadata.additional_info!.media_player).to.be.undefined;

    });

    it('Should submit the allowlist KEY, never the raw device id, when the label is empty', function() {

        const play = generatePlay({artists: namesToCredits(['Artist A']), albumArtists: []}, {deviceId: 'a1b2c3d4e5-iPhone'});
        const submitPayload = playToListenPayload(play, {allowDeviceList: {'iphone': ''}});

        expect(submitPayload.track_metadata.additional_info!.media_player).to.be.eql('iphone');

    });

    it('Should submit the allowlist LABEL when the key has one', function() {

        const play = generatePlay({artists: namesToCredits(['Artist A']), albumArtists: []}, {deviceId: 'a1b2c3d4e5-iPhone'});
        const submitPayload = playToListenPayload(play, {allowDeviceList: {'a1b2c3d4e5': 'phone'}});

        expect(submitPayload.track_metadata.additional_info!.media_player).to.be.eql('phone');

    });

    it('Should prefer the most specific (longest) matching key regardless of order', function() {

        const play = generatePlay({artists: namesToCredits(['Artist A']), albumArtists: []}, {deviceId: 'a1b2c3d4e5-iPhone'});
        const submitPayload = playToListenPayload(play, {allowDeviceList: {'iphone': '', 'a1b2c3d4e5-iphone': 'kitchen ipad'}});

        expect(submitPayload.track_metadata.additional_info!.media_player).to.be.eql('kitchen ipad');

    });

    it('Should not report devices that are not enumerated in the allowlist', function() {

        const play = generatePlay({artists: namesToCredits(['Artist A']), albumArtists: []}, {deviceId: 'SmithsLivingRoom-Roku'});
        const submitPayload = playToListenPayload(play, {allowDeviceList: {'iphone': '', 'android-auto': ''}});

        expect(submitPayload.track_metadata.additional_info!.media_player).to.be.undefined;

    });

    it('Should not report a device when the device is not known', function() {

        const play = generatePlay({artists: namesToCredits(['Artist A']), albumArtists: []}, {deviceId: NO_DEVICE});
        const submitPayload = playToListenPayload(play, {allowDeviceList: {[NO_DEVICE.toLocaleLowerCase()]: ''}});

        expect(submitPayload.track_metadata.additional_info!.media_player).to.be.undefined;

    });

    it('Should prefer mediaPlayerName over the allowlist label for media_player', function() {

        const play = generatePlay({artists: namesToCredits(['Artist A']), albumArtists: []}, {deviceId: 'a1b2c3d4e5-iPhone', mediaPlayerName: 'Rhythmbox'});
        const submitPayload = playToListenPayload(play, {allowDeviceList: {'iphone': ''}});

        expect(submitPayload.track_metadata.additional_info!.media_player).to.be.eql('Rhythmbox');

    });

    it('Should not include any device info as media_player by default', function() {

        const play = generatePlay({artists: namesToCredits(['Artist A']), albumArtists: []}, {deviceId: 'a1b2c3d4e5-iPhone'});
        const submitPayload = playToListenPayload(play);

        expect(submitPayload.track_metadata.additional_info!.media_player).to.be.undefined;

    });

    it('Should submit the allowlist KEY, never the raw device id, when the label is empty', function() {

        const play = generatePlay({artists: namesToCredits(['Artist A']), albumArtists: []}, {deviceId: 'a1b2c3d4e5-iPhone'});
        const submitPayload = playToListenPayload(play, {allowDeviceList: {'iphone': ''}});

        expect(submitPayload.track_metadata.additional_info!.media_player).to.be.eql('iphone');

    });

    it('Should submit the allowlist LABEL when the key has one', function() {

        const play = generatePlay({artists: namesToCredits(['Artist A']), albumArtists: []}, {deviceId: 'a1b2c3d4e5-iPhone'});
        const submitPayload = playToListenPayload(play, {allowDeviceList: {'a1b2c3d4e5': 'phone'}});

        expect(submitPayload.track_metadata.additional_info!.media_player).to.be.eql('phone');

    });

    it('Should prefer the most specific (longest) matching key regardless of order', function() {

        const play = generatePlay({artists: namesToCredits(['Artist A']), albumArtists: []}, {deviceId: 'a1b2c3d4e5-iPhone'});
        const submitPayload = playToListenPayload(play, {allowDeviceList: {'iphone': '', 'a1b2c3d4e5-iphone': 'kitchen ipad'}});

        expect(submitPayload.track_metadata.additional_info!.media_player).to.be.eql('kitchen ipad');

    });

    it('Should not report devices that are not enumerated in the allowlist', function() {

        const play = generatePlay({artists: namesToCredits(['Artist A']), albumArtists: []}, {deviceId: 'SmithsLivingRoom-Roku'});
        const submitPayload = playToListenPayload(play, {allowDeviceList: {'iphone': '', 'android-auto': ''}});

        expect(submitPayload.track_metadata.additional_info!.media_player).to.be.undefined;

    });

    it('Should not report a device when the device is not known', function() {

        const play = generatePlay({artists: namesToCredits(['Artist A']), albumArtists: []}, {deviceId: NO_DEVICE});
        const submitPayload = playToListenPayload(play, {allowDeviceList: {[NO_DEVICE.toLocaleLowerCase()]: ''}});

        expect(submitPayload.track_metadata.additional_info!.media_player).to.be.undefined;

    });

    it('Should prefer mediaPlayerName over the allowlist label for media_player', function() {

        const play = generatePlay({artists: namesToCredits(['Artist A']), albumArtists: []}, {deviceId: 'a1b2c3d4e5-iPhone', mediaPlayerName: 'Rhythmbox'});
        const submitPayload = playToListenPayload(play, {allowDeviceList: {'iphone': ''}});

        expect(submitPayload.track_metadata.additional_info!.media_player).to.be.eql('Rhythmbox');

    });

    it('Should use artist_names if provided, rather than parse artist from string', function () {

        const playFromPayload = listenPayloadToPlay(submit);

        expect(creditsToNames(playFromPayload.data.artists!)).to.be.eql(submit.track_metadata.additional_info!.artist_names);

    });

    it('does not include artist_name if artists were extracted from string', function() {
        const payload = {
            "listened_at": 1791895981,
            "track_metadata": {
                "artist_name": "Alohaii feat. Rachie",
                "track_name": "Heart Of Glass",
                "release_name": "SUMMERTIDE",
                "additional_info": {
                    "artist_mbids": [
                        "a611433b-c2bb-4ba2-be28-775a079e93c6",
                        "745a0c93-a487-4650-ab05-07c4eb9234a2"
                    ],
                    "release_mbid": "560db4c2-5af5-4ef0-a9e0-b56fca3d8bea",
                    "release_group_mbid": "e5a74679-1883-45cb-b776-8b7aee879760",
                    "recording_mbid": "3d4a73ff-3956-4d6b-b423-b1c079775dcf",
                    "duration_ms": 217433,
                    "track_mbid": "c3fda34b-31e1-4e9a-af76-85e3dd08b09f",
                    "tracknumber": 4
                }
            }
        }
        const state = playStateFromRequest({listen_type: 'single', payload: [payload]});
        expect(state[0].play.data.artists?.some(x => x.name === 'Alohaii')).is.true;
        expect(state[0].play.data.artists?.some(x => x.name === 'Rachie')).is.true;
    })

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