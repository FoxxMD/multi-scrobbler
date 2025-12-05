import * as dotenv from 'dotenv';
import { loggerTest, loggerDebug, childLogger } from "@foxxmd/logging";
import chai, { assert, expect } from 'chai';
import asPromised from 'chai-as-promised';
import { after, before, describe, it } from 'mocha';
import { initMemoryCache } from "../../common/Cache.js";
import { Cacheable } from "cacheable";
import MusicbrainzTransformer from "../../common/transforms/MusicbrainzTransformer.js";
import { PlayObject } from "../../../core/Atomic.js";
import { projectDir } from '../../common/index.js';
import path from 'path';

const envPath = path.join(projectDir, '.env');
dotenv.config({path: envPath});

const memorycache = () => new Cacheable({ primary: initMemoryCache({ ttl: '1ms' }) });

const mbTransformer = new MusicbrainzTransformer({
    name: 'test',
    type: 'musicbrainz',
    data: {
        apis: [
            {
                contact: 'contact@foxxmd.dev',
                ttl: '1ms'
            }
        ]
    },
    options: {
        ttl: '1ms'
    }
}, {
    logger: loggerDebug,
    clientCache: memorycache(),
    cache: memorycache()
})

describe('Musicbrainz API', function () {

    before(function () {
        if(process.env.MB_TEST !== 'true') {
            this.skip();
        }
    });

    it('escapes lucene special characters', async function () {

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

    it('tries additional query using only track and naively split artist', async function () {

        const play: PlayObject = {
            data: {
                track: "Endless Possibility (feat. Wheatus)",
                artists: ["Bowling For Soup & Punk Rock Factory"],
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

    it('handles non-ascii', async function () {
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

});