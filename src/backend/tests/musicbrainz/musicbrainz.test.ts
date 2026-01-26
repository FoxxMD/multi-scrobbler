import * as dotenv from 'dotenv';
import { loggerTest, loggerDebug, childLogger } from "@foxxmd/logging";
import chai, { assert, expect } from 'chai';
import asPromised from 'chai-as-promised';
import { after, before, describe, it } from 'mocha';
import { initMemoryCache } from "../../common/Cache.js";
import { Cacheable } from "cacheable";
import MusicbrainzTransformer, { DEFAULT_SEARCHTYPE_ORDER, MusicbrainzTransformerDataStage } from "../../common/transforms/MusicbrainzTransformer.js";
import { DEFAULT_MISSING_TYPES, PlayObject } from "../../../core/Atomic.js";
import { projectDir } from '../../common/index.js';
import path from 'path';
import { MusicbrainzApiConfigData } from '../../common/infrastructure/Atomic.js';
import { MockNetworkError, withRequestInterception } from '../utils/networking.js';
import { http, HttpResponse, delay } from "msw";
import { generatePlay, withBrainz } from '../utils/PlayTestUtils.js';
import { intersect, missingMbidTypes } from '../../utils.js';
import { defaultLifecycle } from '../../utils/PlayTransformUtils.js';

const envPath = path.join(projectDir, '.env');
dotenv.config({ path: envPath });

const memorycache = () => new Cacheable({ primary: initMemoryCache({ ttl: '1ms' }) });

const defaultApiConfig: MusicbrainzApiConfigData = {
    contact: 'contact@foxxmd.dev',
    ttl: '1ms'
};

const createMbTransformer = (apis: MusicbrainzApiConfigData[] = [defaultApiConfig]) => {
    return new MusicbrainzTransformer({
        name: 'test',
        type: 'musicbrainz',
        data: {
            apis
        },
        options: {
            ttl: '1ms'
        }
    }, {
        logger: loggerTest,
        clientCache: memorycache(),
        cache: memorycache()
    });
}
const mbTransformer = createMbTransformer();

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
                    track: "Little Joe and Mary ii",
                    artists: ["Khruangbin"],
                    album: "The Universe Smiles Upon You ii"
                },
                meta: {
                    lifecycle: defaultLifecycle()
                }
            }
            await mbTransformer.tryInitialize();

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
                    track: 'Cyber Space (CrossWorlds Remix): Final Lap (No Chants)',
                    album: "Sonic Racing: CrossWorlds Original Soundtrack - Echoes of Dimensions",
                    artists: [
                        "Kanon Oguni"
                    ]
                },
                meta: {
                    source: "Lastfm",
                    url: {
                        web: "https://www.last.fm/music/Kanon+Oguni/_/Cyber+Space+(CrossWorlds+Remix):+Final+Lap+-+No+Chants",
                    },
                    lifecycle: defaultLifecycle()
                }
            };
            await mbTransformer.tryInitialize();

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
                    track: "Fake",
                    artists: ["Fake"],
                    album: "Fake",
                    meta: {
                        brainz: {
                            recording: '026fa041-3917-4c73-9079-ed16e36f20f8'
                        }
                    }
                },
                meta: {
                    lifecycle: defaultLifecycle()
                }
            }
            await mbTransformer.tryInitialize();

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
                    track: "Fake",
                    artists: ["Fake"],
                    album: "Fake",
                    isrc: 'GBAHT1600302'
                },
                meta: {
                    lifecycle: defaultLifecycle()
                }
            }
            await mbTransformer.tryInitialize();

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
                    track: "Berghain",
                    artists: ["ROSALÍA", "Björk", "Yves Tumor"],
                    albumArtists: ["ROSALÍA"],
                    album: "LUX",
                    meta: {
                        brainz: {
                            track: '47d5358a-d9eb-48db-babb-56284da8056b'
                        }
                    }
                },
                meta: {
                    lifecycle: defaultLifecycle()
                }
            }
            await mbTransformer.tryInitialize();

            const stageConfig: MusicbrainzTransformerDataStage = {
                type: "musicbrainz",
                searchWhenMissing: ["artists", "album", "title"],
                searchOrder: ['basicorids']
            };

            const res = await mbTransformer.getTransformerData(play, stageConfig);
            expect(res.recordings).to.exist;
            expect(res.recordings).to.not.be.empty;
            const postFetch = await mbTransformer.handlePostFetch(play, res, stageConfig);
            expect(postFetch.data.meta.brainz.album).to.eq('e5913eac-3d74-47af-a3f2-7aa6618f140a');
        });

        it('uses correct release if release mbid is explict', async function (){
            this.timeout(3500);

            const play: PlayObject = {
                data: {
                    track: "Berghain",
                    artists: ["ROSALÍA", "Björk", "Yves Tumor"],
                    albumArtists: ["ROSALÍA"],
                    album: "LUX",
                    meta: {
                        brainz: {
                            album: 'e5913eac-3d74-47af-a3f2-7aa6618f140a'
                        }
                    }
                },
                meta: {
                    lifecycle: defaultLifecycle()
                }
            }
            await mbTransformer.tryInitialize();

            const stageConfig: MusicbrainzTransformerDataStage = {
                type: "musicbrainz",
                searchWhenMissing: ["artists", "album", "title"],
                searchOrder: ['basicorids']
            };

            const res = await mbTransformer.getTransformerData(play, stageConfig);
            expect(res.recordings).to.exist;
            expect(res.recordings).to.not.be.empty;
            const postFetch = await mbTransformer.handlePostFetch(play, res, stageConfig);
            expect(postFetch.data.meta.brainz.album).to.eq('e5913eac-3d74-47af-a3f2-7aa6618f140a');
        });

        it('tries second query using only track and album', async function () {

            this.timeout(3500);

            const play: PlayObject = {
                data: {
                    track: "Roulette Road (CrossWorlds Remix)",
                    artists: ["Takahiro Kai, SEGA GAME MUSIC & SEGA SOUND TEAM"],
                    album: "Sonic Racing: CrossWorlds Original Soundtrack - Echoes of Dimensions"
                },
                meta: {
                    lifecycle: defaultLifecycle()
                }
            }
            await mbTransformer.tryInitialize();

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
                    track: "Undefeatable (feat. Kellin Quinn)",
                    artists: ["SEGA Sound Team / Tomoya Ohtani"],
                },
                meta: {
                    lifecycle: defaultLifecycle()
                }
            }
            await mbTransformer.tryInitialize();

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
                    track: "Bad Apple!! feat.SEKAI",
                    artists: ["、ナイトコードで。"],
                    album: "25時、ナイトコードで。 SEKAI ALBUM Vol.3"
                },
                meta: {
                    lifecycle: defaultLifecycle()
                }
            }
            await mbTransformer.tryInitialize();

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
                    track: "HIBANA - Reloaded - (feat. 星乃一歌 & Hatsune Miku)",
                    artists: ["Leo/need"],
                    album: "Leo / need SEKAI ALBUM Vol.1"
                },
                meta: {
                    lifecycle: defaultLifecycle()
                }
            }
            await mbTransformer.tryInitialize();

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
                    track: "Price",
                    artists: ["ATLUS Sound Team"],
                    album: "PERSONA5 ORIGINAL SOUNDTRACK",
                    isrc: 'JPK651601515'
                },
                meta: {
                    lifecycle: defaultLifecycle()
                }
            }
            await mbTransformer.tryInitialize();

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
            expect(chosenPlay.data.meta.brainz.album).to.eq("82de33b1-1cd6-4236-b116-561d0ecc8acf")
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
                        track: "Little Joe and Mary ii",
                        artists: ["Khruangbin"],
                        album: "The Universe Smiles Upon You ii"
                    },
                    meta: {
                        lifecycle: defaultLifecycle()
                    }
                }
                await multiMb.tryInitialize();

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
                        track: "Little Joe and Mary ii",
                        artists: ["Khruangbin"],
                        album: "The Universe Smiles Upon You ii"
                    },
                    meta: {
                        lifecycle: defaultLifecycle()
                    }
                }
                await multiMb.tryInitialize();

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

});

describe('#MB Missing Types', function() {

    it('Finds none missing when all mbids are defined', function() {

        const play = withBrainz(generatePlay(), ['album', 'artist', 'track']);
        const missing = missingMbidTypes(play);
        expect(missing.length).eq(0);
    });

    it('Finds all brainz missing when no brainz are defined', function() {

        const play = generatePlay();
        const missing = missingMbidTypes(play);
        expect(missing).to.have.members(['title','album','artists']);
    });

    it('Finds duration missing', function() {

        const play = withBrainz(generatePlay(), ['album', 'artist', 'track']);
        delete play.data.duration;
        const missing = missingMbidTypes(play);
        expect(missing.length).eq(1);
        expect(missing[0]).eq('duration');
    });

    it('Finds brainz missing when fields are undefined', function() {

        const play = generatePlay();
        play.data.meta = {brainz: {}};
        const missing = missingMbidTypes(play);
        expect(missing).to.have.members(['title','album','artists']);
    });

    it('intersect is not empty when missing any desired types', function() {

        const play = withBrainz(generatePlay(), ['album', 'track']);
        const missing = missingMbidTypes(play);
        expect(missing).to.have.members(['artists']);
        expect(intersect(DEFAULT_MISSING_TYPES, missing)).length.is.greaterThan(0);
    });

});