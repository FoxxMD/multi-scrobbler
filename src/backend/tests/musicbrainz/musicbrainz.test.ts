import * as dotenv from 'dotenv';
import { loggerTest, loggerDebug, childLogger } from "@foxxmd/logging";
import chai, { assert, expect } from 'chai';
import asPromised from 'chai-as-promised';
import { after, before, describe, it } from 'mocha';
import { initMemoryCache } from "../../common/Cache.js";
import { Cacheable } from "cacheable";
import MusicbrainzTransformer, { MusicbrainzTransformerDataStage } from "../../common/transforms/MusicbrainzTransformer.js";
import { PlayObject } from "../../../core/Atomic.js";
import { projectDir } from '../../common/index.js';
import path from 'path';
import { MusicbrainzApiConfigData } from '../../common/infrastructure/Atomic.js';
import { MockNetworkError, withRequestInterception } from '../utils/networking.js';
import { http, HttpResponse, delay } from "msw";

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
        logger: loggerDebug,
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
                meta: {}
            }
            await mbTransformer.tryInitialize();

            const res = await mbTransformer.getTransformerData(play, {
                type: "musicbrainz",
                searchWhenMissing: ["artists", "album", "title"]
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
                }
            };
            await mbTransformer.tryInitialize();

            const res = await mbTransformer.getTransformerData(play, {
                type: "musicbrainz",
                searchWhenMissing: ["artists", "album", "title"]
            });
            expect(res.recordings).to.exist;
            expect(res.recordings).to.not.be.empty;
        });

        it('tries second query using only track and album', async function () {

            this.timeout(3500);

            const play: PlayObject = {
                data: {
                    track: "Roulette Road (CrossWorlds Remix)",
                    artists: ["Takahiro Kai, SEGA GAME MUSIC & SEGA SOUND TEAM"],
                    album: "Sonic Racing: CrossWorlds Original Soundtrack - Echoes of Dimensions"
                },
                meta: {}
            }
            await mbTransformer.tryInitialize();

            const res = await mbTransformer.getTransformerData(play, {
                type: "musicbrainz",
                searchWhenMissing: ["artists", "album", "title"]
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
                meta: {}
            }
            await mbTransformer.tryInitialize();

            const res = await mbTransformer.getTransformerData(play, {
                type: "musicbrainz",
                searchWhenMissing: ["artists", "album", "title"],
                fallbackArtistSearch: 'native'
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
                meta: {}
            }
            await mbTransformer.tryInitialize();

            const res = await mbTransformer.getTransformerData(play, {
                type: "musicbrainz",
                searchWhenMissing: ["artists", "album", "title"]
            });
            expect(res.recordings).to.exist;
            expect(res.recordings).to.not.be.empty;
        });

        it('psuedo-releases', async function () {

            this.timeout(3500);

            const play: PlayObject = {
                data: {
                    track: "HIBANA - Reloaded - (feat. 星乃一歌 & Hatsune Miku)",
                    artists: ["Leo/need"],
                    album: "Leo / need SEKAI ALBUM Vol.1"
                },
                meta: {}
            }
            await mbTransformer.tryInitialize();

            const stageConfig: MusicbrainzTransformerDataStage = {
                type: "musicbrainz",
                searchWhenMissing: ["artists", "album", "title"],
                fallbackArtistSearch: "native",
                fallbackFreeText: true
            };

            const res = await mbTransformer.getTransformerData(play, stageConfig);
            const postFetch = mbTransformer.handlePostFetch(play, res, stageConfig);
            expect(res.recordings).to.exist;
            expect(res.recordings).to.not.be.empty;
        });

    });

    describe('Multiple Endpoints', function () {
        it('should fallback to another endpoint if current one fails', withRequestInterception([
            http.get(/mbtest\.local\/?\/ws/, async () => {
                //
                await delay(5000);
                throw new MockNetworkError('EAI_AGAIN');
            })
        ],async function() {

            //this.timeout(3500);

            const multiMb = createMbTransformer([{contact: 'test@foxxmd.dev', url: 'https://mbtest.local'}, defaultApiConfig]);

            const play: PlayObject = {
                data: {
                    track: "Little Joe and Mary ii",
                    artists: ["Khruangbin"],
                    album: "The Universe Smiles Upon You ii"
                },
                meta: {}
            }
            await multiMb.tryInitialize();

            const res = await multiMb.getTransformerData(play, {
                type: "musicbrainz",
                searchWhenMissing: ["artists", "album", "title"]
            });
            expect(res.recordings).to.exist;
            expect(res.recordings).to.not.be.empty;

        }));
    });

});