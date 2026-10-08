import { creditId, creditIsrc, creditMbid, isrcMeta, mbMeta, spotifyMeta, withImage } from "../../../core/MusicMetadata.ts";
import * as dotenv from 'dotenv';
import { loggerTest } from "@foxxmd/logging";
import chai, { expect, assert } from 'chai';
import asPromised from 'chai-as-promised';
import { before, describe, it } from 'mocha';
import { initMemoryCache } from "../../common/Cache.ts";
import { Cacheable } from "cacheable";
import MusicbrainzTransformer, { type MusicbrainzTransformerDataStage } from "../../common/transforms/MusicbrainzTransformer.ts";
import { DEFAULT_SEARCHTYPE_ORDER } from "../../common/transforms/musicbrainz/MusicbrainzTransformerUtil.ts";
import { DEFAULT_MISSING_TYPES, type PlayObject } from "../../../core/Atomic.ts";
import { getPathFromCWD } from '../../common/index.ts';
import path from 'path';
import type {MusicbrainzApiConfigData} from '../../common/infrastructure/Atomic.ts';
import { MockNetworkError, withRequestInterception } from '../utils/networking.ts';
import { http, HttpResponse, delay } from "msw";
import { generatePlay, withBrainz } from '../../../core/tests/utils/PlayTestUtils.ts';
import { intersect, missingMbidTypes, sleep } from '../../utils.ts';
import { CoverArtApiClient } from '../../common/vendor/musicbrainz/CoverArtApiClient.ts';
import { nameToCredit } from "../../../core/MusicMetadata.ts";
import { namesToCredits } from "../../../core/MusicMetadata.ts";
import dayjs from 'dayjs';
import { MusicbrainzApiWrapped } from '../../common/vendor/musicbrainz/MusicbrainzApi.ts';
import { AsyncLocalStorage } from 'async_hooks';
import type { CoverArtApiConfig } from '../../common/vendor/musicbrainz/CoverArtApiTypes.ts';

chai.use(asPromised);

const envPath = path.join(getPathFromCWD(), '.env');
dotenv.config({ path: envPath });

const memorycache = () => new Cacheable({ primary: initMemoryCache({ ttl: '1ms' }) });

const defaultApiConfig: MusicbrainzApiConfigData = {
    contact: 'contact@foxxmd.dev',
};

const createMbTransformer = (apis: MusicbrainzApiConfigData[] = [defaultApiConfig]) => {
    return new MusicbrainzTransformer({
        name: 'test',
        type: 'musicbrainz',
        data: {
            apis
        }
    }, {
        logger: loggerTest,
        clientCache: memorycache(),
        cache: memorycache()
    });
}
const mbTransformer = createMbTransformer();

const createCoverArtApi = (config: CoverArtApiConfig = {}) => {
    return new CoverArtApiClient('test', config, {logger: loggerTest});
}

describe('Musicbrainz API', function () {

    before(function () {
        if (process.env.MB_TEST !== 'true') {
            this.skip();
        }
    });

    describe('Basic Operations', function () {

        it('responds', async function () {

            this.timeout(3500);

            const play: PlayObject = {
                data: {
                    track: nameToCredit("Little Joe and Mary ii"),
                    artists: namesToCredits(["Khruangbin"]),
                    album: nameToCredit("The Universe Smiles Upon You ii")
                },
                meta: {
                    
                }
            }
            await mbTransformer.initialize();

            const res = await mbTransformer.getTransformerData(play, {
                type: "musicbrainz",
                searchWhenMissing: ["artists", "album", "title"],
                searchOrder: DEFAULT_SEARCHTYPE_ORDER
            });
            expect(res.recordings).to.exist;
            expect(res.recordings).to.not.be.empty;
        });

        it('escapes lucene special characters', async function () {

            this.timeout(3500);

            const play: PlayObject = {
                data: {
                    track: nameToCredit('Cyber Space (CrossWorlds Remix): Final Lap (No Chants)'),
                    album: nameToCredit("Sonic Racing: CrossWorlds Original Soundtrack - Echoes of Dimensions"),
                    artists: [
                        nameToCredit("Kanon Oguni")!
                    ]
                },
                meta: {
                    source: "Lastfm",
                    url: {
                        web: "https://www.last.fm/music/Kanon+Oguni/_/Cyber+Space+(CrossWorlds+Remix):+Final+Lap+-+No+Chants",
                    },
                    
                }
            };
            await mbTransformer.initialize();

            const res = await mbTransformer.getTransformerData(play, {
                type: "musicbrainz",
                searchWhenMissing: ["artists", "album", "title"],
                searchOrder: DEFAULT_SEARCHTYPE_ORDER
            });
            expect(res.recordings).to.exist;
            expect(res.recordings).to.not.be.empty;
        });


        it('tries pre-regular query using only recording MBID, if present', async function (){
            this.timeout(3500);

            const play: PlayObject = {
                data: {
                    track: nameToCredit("Fake", mbMeta('026fa041-3917-4c73-9079-ed16e36f20f8', 'recording')),
                    artists: namesToCredits(["Fake"]),
                    album: nameToCredit("Fake"),
                },
                meta: {
                    
                }
            }
            await mbTransformer.initialize();

            const res = await mbTransformer.getTransformerData(play, {
                type: "musicbrainz",
                searchWhenMissing: ["artists", "album", "title"],
                searchOrder: ['mbidrecording']
            });
            expect(res.recordings).to.exist;
            expect(res.recordings).to.not.be.empty;
            expect(res.recordings[0].isrcs).to.exist;
            expect(res.recordings[0].isrcs).to.not.be.empty;
            expect(res.recordings[0].isrcs).to.include('GBAHT1600302');
        })

        it('tries pre-regular query using only ISRC, if present', async function () {

            this.timeout(3500);

            const play: PlayObject = {
                data: {
                    track: nameToCredit("Fake", isrcMeta('GBAHT1600302')),
                    artists: namesToCredits(["Fake"]),
                    album: nameToCredit("Fake"),
                },
                meta: {
                    
                }
            }
            await mbTransformer.initialize();

            const res = await mbTransformer.getTransformerData(play, {
                type: "musicbrainz",
                searchWhenMissing: ["artists", "album", "title"],
                searchOrder: DEFAULT_SEARCHTYPE_ORDER
            });
            expect(res.recordings).to.exist;
            expect(res.recordings).to.not.be.empty;
            expect(res.recordings[0].id).to.eq('026fa041-3917-4c73-9079-ed16e36f20f8')
        });

        it('uses correct release if track mbid is explict', async function (){
            this.timeout(3500);

            const play: PlayObject = {
                data: {
                    track: nameToCredit("Berghain", mbMeta('47d5358a-d9eb-48db-babb-56284da8056b', 'track')),
                    artists: namesToCredits(["ROSALÍA", "Björk", "Yves Tumor"]),
                    albumArtists: namesToCredits(["ROSALÍA"]),
                    album: nameToCredit("LUX"),
                },
                meta: {
                    
                }
            }
            await mbTransformer.initialize();

            const stageConfig: MusicbrainzTransformerDataStage = {
                type: "musicbrainz",
                searchWhenMissing: ["artists", "album", "title"],
                searchOrder: ['basicorids']
            };

            const res = await mbTransformer.getTransformerData(play, stageConfig);
            expect(res.recordings).to.exist;
            expect(res.recordings).to.not.be.empty;
            const postFetch = await mbTransformer.handlePostFetch(play, res, stageConfig);
            expect(creditMbid(postFetch.data.album, 'release')).to.eq('e5913eac-3d74-47af-a3f2-7aa6618f140a');
        });

        it('uses correct release if release mbid is explict', async function (){
            this.timeout(3500);

            const play: PlayObject = {
                data: {
                    track: nameToCredit("Berghain"),
                    artists: namesToCredits(["ROSALÍA", "Björk", "Yves Tumor"]),
                    albumArtists: namesToCredits(["ROSALÍA"]),
                    album: nameToCredit("LUX", mbMeta('e5913eac-3d74-47af-a3f2-7aa6618f140a', 'release')),
                },
                meta: {
                    
                }
            }
            await mbTransformer.initialize();

            const stageConfig: MusicbrainzTransformerDataStage = {
                type: "musicbrainz",
                searchWhenMissing: ["artists", "album", "title"],
                searchOrder: ['basicorids']
            };

            const res = await mbTransformer.getTransformerData(play, stageConfig);
            expect(res.recordings).to.exist;
            expect(res.recordings).to.not.be.empty;
            const postFetch = await mbTransformer.handlePostFetch(play, res, stageConfig);
            expect(creditMbid(postFetch.data.album, 'release')).to.eq('e5913eac-3d74-47af-a3f2-7aa6618f140a');
        });

        it('tries second query using only track and album', async function () {

            this.timeout(3500);

            const play: PlayObject = {
                data: {
                    track: nameToCredit("Roulette Road (CrossWorlds Remix)"),
                    artists: namesToCredits(["Takahiro Kai, SEGA GAME MUSIC & SEGA SOUND TEAM"]),
                    album: nameToCredit("Sonic Racing: CrossWorlds Original Soundtrack - Echoes of Dimensions")
                },
                meta: {
                    
                }
            }
            await mbTransformer.initialize();

            const res = await mbTransformer.getTransformerData(play, {
                type: "musicbrainz",
                searchWhenMissing: ["artists", "album", "title"],
                searchOrder: ['basic','album']
            });
            expect(res.recordings).to.exist;
            expect(res.recordings).to.not.be.empty;
        });

        it('tries additional query using only track and native parsing', async function () {

            this.timeout(3500);

            const play: PlayObject = {
                data: {
                    track: nameToCredit("Undefeatable (feat. Kellin Quinn)"),
                    artists: namesToCredits(["SEGA Sound Team / Tomoya Ohtani"]),
                },
                meta: {
                    
                }
            }
            await mbTransformer.initialize();

            const res = await mbTransformer.getTransformerData(play, {
                type: "musicbrainz",
                searchWhenMissing: ["artists", "album", "title"],
                searchArtistMethod: "native",
                searchOrder: ['basic','artist']
            });
            expect(res.recordings).to.exist;
            expect(res.recordings).to.not.be.empty;
        });

        it('handles non-ascii', async function () {

            this.timeout(3500);

            const play: PlayObject = {
                data: {
                    track: nameToCredit("Bad Apple!! feat.SEKAI"),
                    artists: namesToCredits(["、ナイトコードで。"]),
                    album: nameToCredit("25時、ナイトコードで。 SEKAI ALBUM Vol.3")
                },
                meta: {
                    
                }
            }
            await mbTransformer.initialize();

            const res = await mbTransformer.getTransformerData(play, {
                type: "musicbrainz",
                searchWhenMissing: ["artists", "album", "title"],
                searchOrder: ['basic']
            });
            expect(res.recordings).to.exist;
            expect(res.recordings).to.not.be.empty;
        });

        it('psuedo-releases', async function () {

            this.timeout(5500);

            const play: PlayObject = {
                data: {
                    track: nameToCredit("HIBANA - Reloaded - (feat. 星乃一歌 & Hatsune Miku)"),
                    artists: namesToCredits(["Leo/need"]),
                    album: nameToCredit("Leo / need SEKAI ALBUM Vol.1")
                },
                meta: {
                    
                }
            }
            await mbTransformer.initialize();

            const stageConfig: MusicbrainzTransformerDataStage = {
                type: "musicbrainz",
                searchWhenMissing: ["artists", "album", "title"],
                searchArtistMethod: "native",
                searchOrder: ['artist', 'freetext'],
            };

            const res = await mbTransformer.getTransformerData(play, stageConfig);
            const postFetch = mbTransformer.handlePostFetch(play, res, stageConfig);
            expect(res.recordings).to.exist;
            expect(res.recordings).to.not.be.empty;
        });

        it('sorts by text weight', async function () {

            this.timeout(3500);

            const play: PlayObject = {
                data: {
                    track: nameToCredit("Price", isrcMeta('JPK651601515')),
                    artists: namesToCredits(["ATLUS Sound Team"]),
                    album: nameToCredit("PERSONA5 ORIGINAL SOUNDTRACK"),
                },
                meta: {
                    
                }
            }
            await mbTransformer.initialize();

            const res = await mbTransformer.getTransformerData(play, {
                type: "musicbrainz",
                searchWhenMissing: ["artists", "album", "title"],
                searchOrder: ["isrc"],
            });
            expect(res.recordings).to.exist;
            expect(res.recordings).to.not.be.empty;
            const chosenPlay = await mbTransformer.handlePostFetch(play,res, {
                type: "musicbrainz",
                searchWhenMissing: ["artists", "album", "title"],
                searchOrder: DEFAULT_SEARCHTYPE_ORDER,
                albumWeight: 0.4,
                titleWeight: 0.3,
                artistWeight: 0.3,
            });
            expect(creditMbid(chosenPlay.data.album, 'release')).to.eq("82de33b1-1cd6-4236-b116-561d0ecc8acf")
        });

        it('records prerequisite failures', async function () {

            this.timeout(3500);

            const play: PlayObject = {
                data: {
                    track: nameToCredit("Hopes And Dreams (10th Anniversary Arrangement)"),
                    artists: namesToCredits(["KrakenPower"]),
                    album: nameToCredit("Hopes And Dreams (10th Anniversary Arrangement) - Single"),
                    duration: 278
                },
                meta: {
                    musicService: "Apple Music",
                    trackId: "1840310777"
                }
            }
            await mbTransformer.initialize();

            const res = await mbTransformer.getTransformerData(play, {
                type: "musicbrainz",
                searchWhenMissing: ["artists", "album", "title"],
                "searchOrder": ["mbidrecording", "isrc"],
                "albumWeight": 0.4,
                "artistWeight": 0.3,
                "releaseStatusPriority": ["official"],
                "releaseGroupPrimaryTypePriority": ["album", "single", "ep"],
                "releaseCountryPriority": ["XW"],
            });
            expect(res.requestQueries).to.exist;
            expect(res.requestQueries).to.not.be.empty;


            await assert.isRejected(mbTransformer.handlePostFetch(play,res, {
                    type: "musicbrainz",
                    searchWhenMissing: ["artists", "album", "title"],
                    "searchOrder": ["mbidrecording", "isrc"],
                    "albumWeight": 0.4,
                    "artistWeight": 0.3,
                    "releaseStatusPriority": ["official"],
                    "releaseGroupPrimaryTypePriority": ["album", "single", "ep"],
                    "releaseCountryPriority": ["XW"],
                }), "All search prerequisites failed")
        });

        it('does not fail on media tracks', async function () {
            this.timeout(35000);

            await mbTransformer.initialize();

            const play: PlayObject = {
                "data": {
                    "artists": [nameToCredit("Au5", mbMeta("3569c2ed-2315-40d9-b041-3c48dae1be43", 'artist'))],
                    "albumArtists": [],
                    "album": nameToCredit("Inverse", mbMeta("cbc89dff-3555-498c-bb1e-2ff983b13e59", 'release')),
                    "track": withImage(nameToCredit("Scission", mbMeta("c63b7e96-928c-48dd-b558-a181cb245cb6", 'track')), "/api/source/art?name=PlexBox&type=plex&data=84389"),
                    "duration": 214.125,
                    "playDate": dayjs(),
                    "listenedFor": 209.601,
                    "listenRanges": [],
                    "repeat": false
                },
                "meta": {
                    "seenAt": dayjs(),
                    "trackId": "plex://track/6a5ee492569fa956516b9b1a",
                    "mediaType": "track",
                    "source": "Plex",
                    "library": "Music",
                    "deviceId": "sonos-0116-Plex for Sonos",
                    "sessionId": "106",
                    "trackProgressPosition": 214.125
                },
            };

            try {
                const res = await mbTransformer.getTransformerData(play, {
                    type: "musicbrainz",
                    searchWhenMissing: DEFAULT_MISSING_TYPES,
                    searchOrder: ["isrc", "mbidrecording", "basicorids", "basic"],
                });

                expect(res.recordings).to.exist;
                expect(res.recordings).to.not.be.empty;
                const chosenPlay = await mbTransformer.handlePostFetch(play, res, {
                    type: "musicbrainz",
                    searchWhenMissing: DEFAULT_MISSING_TYPES,
                    searchOrder: ["isrc", "mbidrecording", "basicorids", "basic"],
                });
                expect(chosenPlay).to.exist;
            } catch (e) {
                throw e;
            }

        });

    });

    describe('Multiple Endpoints', function () {

        it('should fallback to another endpoint if current one fails', async function () {
            this.timeout(5000);
            await withRequestInterception([
                http.get(/mbtest\.local\/?\/ws/, async () => {
                    throw new MockNetworkError('EAI_AGAIN');
                })
            ], async function () {

                const multiMb = createMbTransformer([{ contact: 'test@foxxmd.dev', url: 'https://mbtest.local' }, defaultApiConfig]);

                const play: PlayObject = {
                    data: {
                        track: nameToCredit("Little Joe and Mary ii"),
                        artists: namesToCredits(["Khruangbin"]),
                        album: nameToCredit("The Universe Smiles Upon You ii")
                    },
                    meta: {
                        
                    }
                }
                await multiMb.initialize();

                const res = await multiMb.getTransformerData(play, {
                    type: "musicbrainz",
                    searchWhenMissing: ["artists", "album", "title"],
                    searchOrder: ['basic']
                });
                expect(res.recordings).to.exist;
                expect(res.recordings).to.not.be.empty;

            })();
        });

        it('should fallback to another endpoint if current one takes too long to respond', async function () {
            this.timeout(10000);
            await withRequestInterception([
                http.get(/mbtest\.local\/?\/ws/, async () => {
                    await delay(3000);
                    throw new MockNetworkError('EAI_AGAIN');
                })
            ], async function () {

                const multiMb = createMbTransformer([{ contact: 'test@foxxmd.dev', url: 'https://mbtest.local' }, { ...defaultApiConfig, requestTimeout: 1000 }]);

                const play: PlayObject = {
                    data: {
                        track: nameToCredit("Little Joe and Mary ii"),
                        artists: namesToCredits(["Khruangbin"]),
                        album: nameToCredit("The Universe Smiles Upon You ii")
                    },
                    meta: {
                        
                    }
                }
                await multiMb.initialize();

                const res = await multiMb.getTransformerData(play, {
                    type: "musicbrainz",
                    searchWhenMissing: ["artists", "album", "title"],
                    searchOrder: ['basic']
                });
                expect(res.recordings).to.exist;
                expect(res.recordings).to.not.be.empty;

            })();
        });
    });

    it('rate limits to 1req per duration', async function () {
        await withRequestInterception([
            http.get(/mbtest\.local\/?\/ws/, async () => {
                return HttpResponse.json([], {status: 200});
            })
        ], async function () {

            const client = new MusicbrainzApiWrapped({
                baseUrl: 'https://mbtest.local',
                hostname: 'mbtest.local',
                asyncStore: new AsyncLocalStorage(),
                rate: {
                    duration: 0.01
                }
            });

            let called = 0;

            for(let i = 0; i < 5; i++) {
                client.callApi(async () => {called++;return;}).then(() => null)
            }
            await sleep(30);
            expect(called).to.eq(3);
        })();
    });

});

describe('#MB Stage Rules', function () {

    const play = generatePlay({
        track: nameToCredit('My Song', spotifyMeta('sp-track', 'track')),
        album: nameToCredit('My Album', spotifyMeta('sp-album', 'album')),
        artists: [nameToCredit('Beyonce', spotifyMeta('sp-b', 'artist')), nameToCredit('jay z', spotifyMeta('sp-j', 'artist'))],
    });
    // what the stage found
    const match = generatePlay({
        track: nameToCredit('My Song (Remastered)', mbMeta('mb-rec', 'recording'), isrcMeta('USRC17607839')),
        album: nameToCredit('My Album', mbMeta('mb-rel', 'release')),
        artists: [nameToCredit('Jay Z', mbMeta('mb-j', 'artist')), nameToCredit('Beyoncé', mbMeta('mb-b', 'artist'))],
        meta: { brainz: { trackNumber: 4 } },
    });

    const applyRules = async (rules: Partial<MusicbrainzTransformerDataStage>): Promise<PlayObject> => {
        const stage = mbTransformer.parseConfig({ type: 'musicbrainz', ...rules });
        // @ts-expect-error protected, testing application of already found stage data
        return await mbTransformer.doHandle(stage, play, match);
    }

    it('applies names and ids, keeping ids from other services, when all rules are used', async function () {
        const { data } = await applyRules({});
        expect(data.track?.name).eq('My Song (Remastered)');
        expect(creditMbid(data.track, 'recording')).eq('mb-rec');
        expect(creditId(data.track, 'spotify', 'track')).eq('sp-track');
        expect(creditMbid(data.album, 'release')).eq('mb-rel');
        expect(creditId(data.album, 'spotify', 'album')).eq('sp-album');
        expect(data.artists?.map(x => x.name)).eql(['Jay Z', 'Beyoncé']);
        expect(data.artists?.map(x => creditMbid(x, 'artist'))).eql(['mb-j', 'mb-b']);
        expect(data.meta?.brainz?.trackNumber).eq(4);
        expect(creditIsrc(data.track)).eq('USRC17607839');
    });

    it('only adds ids, matched to existing credits, when only meta is used', async function () {
        const { data } = await applyRules({ title: false, artists: false, albumArtists: false, album: false, duration: false });
        expect(data.track?.name).eq('My Song');
        expect(creditMbid(data.track, 'recording')).eq('mb-rec');
        expect(data.artists?.map(x => x.name)).eql(['Beyonce', 'jay z']);
        expect(data.artists?.map(x => creditMbid(x, 'artist'))).eql(['mb-b', 'mb-j']);
        expect(data.artists?.map(x => creditId(x, 'spotify', 'artist'))).eql(['sp-b', 'sp-j']);
        expect(data.duration).eq(play.data.duration);
        expect(data.meta?.brainz?.trackNumber).eq(4);
    });

    it('does not add ids, and drops ids of renamed credits, when meta is not used', async function () {
        const { data } = await applyRules({ meta: false });
        expect(data.track).eql({ name: 'My Song (Remastered)' });
        // name did not change
        expect(data.album).eql(play.data.album);
        expect(data.artists).eql([{ name: 'Jay Z' }, { name: 'Beyoncé' }]);
        expect(data.meta?.brainz).to.be.undefined;
        expect(creditIsrc(data.track)).to.be.undefined;
    });

    it('applies ids to credits that are not renamed when meta and only some names are used', async function () {
        const { data } = await applyRules({ artists: false, album: false });
        expect(data.track?.name).eq('My Song (Remastered)');
        expect(creditMbid(data.track, 'recording')).eq('mb-rec');
        expect(data.artists?.map(x => x.name)).eql(['Beyonce', 'jay z']);
        expect(data.artists?.map(x => creditMbid(x, 'artist'))).eql(['mb-b', 'mb-j']);
    });

    it('does not use a rule when its when condition is not met', async function () {
        const { data } = await applyRules({ title: { when: [{ title: 'Something Else' }] } });
        expect(data.track?.name).eq('My Song');
        expect(creditMbid(data.track, 'recording')).eq('mb-rec');
    });
});

describe('#MB Missing Types', function() {

    it('Finds none missing when all mbids are defined', function() {

        const play = withBrainz(generatePlay(), {include: ['album', 'artist', 'recording']});
        const missing = missingMbidTypes(play);
        expect(missing.length).eq(0);
    });

    it('Finds all brainz missing when no brainz are defined', function() {

        const play = generatePlay();
        const missing = missingMbidTypes(play);
        expect(missing).to.have.members(['title','album','artists']);
    });

    it('Finds duration missing', function() {

        const play = withBrainz(generatePlay(), {include: ['album', 'artist', 'recording']});
        delete play.data.duration;
        const missing = missingMbidTypes(play);
        expect(missing.length).eq(1);
        expect(missing[0]).eq('duration');
    });

    it('Finds brainz missing when credits have no mbids', function() {

        const play = generatePlay();
        play.data.track = {...play.data.track!, metadata: []};
        const missing = missingMbidTypes(play);
        expect(missing).to.have.members(['title','album','artists']);
    });

    it('intersect is not empty when missing any desired types', function() {

        const play = withBrainz(generatePlay(), {include: ['album', 'recording']});
        const missing = missingMbidTypes(play);
        expect(missing).to.have.members(['artists']);
        expect(intersect(DEFAULT_MISSING_TYPES, missing)).length.is.greaterThan(0);
    });

});