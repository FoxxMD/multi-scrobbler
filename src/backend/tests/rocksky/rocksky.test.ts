import * as dotenv from 'dotenv';
import { loggerTest } from "@foxxmd/logging";
import chai, { expect } from 'chai';
import asPromised from 'chai-as-promised';
import { before, describe, it } from 'mocha';
import { initMemoryCache } from "../../common/Cache.ts";
import { Cacheable } from "cacheable";
import { DEFAULT_ROCKSKY_MISSING_TYPES, type PlayObject } from "../../../core/Atomic.ts";
import { getPathFromCWD } from '../../common/index.ts';
import path from 'path';
import { nameToCredit } from "../../../core/MusicMetadata.ts";
import { namesToCredits } from "../../../core/MusicMetadata.ts";
import type { RockskyApiClientConfig } from '../../common/vendor/rocksky/interfaces.ts';
import type { MarkRequired } from 'ts-essentials';
import type { AlbumSearchResult, ArtistSearchResult, TrackSearchResult } from '../../../core/Api.ts';
import RockskyTransformer, { DEFAULT_SEARCHTYPE_ORDER } from '../../common/transforms/rocksky/RockskyTransformer.ts';

chai.use(asPromised);

const envPath = path.join(getPathFromCWD(), '.env');
dotenv.config({ path: envPath });

const memorycache = () => new Cacheable({ primary: initMemoryCache({ ttl: '1ms' }) });

const createRsTransformer = (data: MarkRequired<RockskyApiClientConfig, 'apis'> = {apis: [{enable: true}]}) => new RockskyTransformer({
        name: 'test',
        type: 'musicbrainz',
        data
    }, {
        logger: loggerTest,
        clientCache: memorycache(),
        cache: memorycache()
    })
const rsTransformer = createRsTransformer();

describe('Rocksky API', function () {

    before(function () {
        if (process.env.RS_TEST !== 'true') {
            this.skip();
        }
    });

    describe('Basic Operations', function () {

        it('responds', async function () {

            this.timeout(350000);

            const play: PlayObject = {
                data: {
                    track: nameToCredit("Little Joe and Mary ii"),
                    artists: namesToCredits(["Khruangbin"]),
                    album: nameToCredit("The Universe Smiles Upon You ii")
                },
                meta: {
                    
                }
            }
            await rsTransformer.initialize();

            const res = await rsTransformer.getTransformerData(play, {
                type: "musicbrainz",
                searchWhenMissing: DEFAULT_ROCKSKY_MISSING_TYPES,
                searchOrder: DEFAULT_SEARCHTYPE_ORDER
            });
            expect(res).to.exist;
        });

        // it('handles search with partial failures', async function () {

        //     this.timeout(350000);

        //     const play: PlayObject = {
        //         data: {
        //             track: "Come Together",
        //             artists: namesToCredits(["The Beatles"]),
        //             album: "Abbey Road",
        //             isrc: 'GBAHT1600302' // won't work
        //         },
        //         meta: {
                    
        //         }
        //     }
        //     await rsTransformer.initialize();

        //     const res = await rsTransformer.getTransformerData(play, {
        //         type: "musicbrainz",
        //         searchWhenMissing: DEFAULT_ROCKSKY_MISSING_TYPES,
        //         searchOrder: ['basicorids', 'basic']
        //     });
        //     expect(res).to.exist;
        // });

        it('handles bad data', async function () {

            this.timeout(350000);

            const play: PlayObject = {
                data: {
                    track: nameToCredit("JUST A TEST IT WON'T WORK"),
                    artists: namesToCredits(["ASDNVLKUFDOSF"]),
                    album: nameToCredit("FSDFDFDFDD")
                },
                meta: {
                    
                }
            }
            await rsTransformer.initialize();

            const res = await rsTransformer.getTransformerData(play, {
                type: "musicbrainz",
                searchWhenMissing: DEFAULT_ROCKSKY_MISSING_TYPES,
                searchOrder: DEFAULT_SEARCHTYPE_ORDER
            });
            expect(res).to.exist;
            expect(res.matches).to.not.exist;
        });

    });

    describe('Metadata Results', function () {

        it('returns track, artist, and album results', async function () {

            this.timeout(350000);

            await rsTransformer.initialize();

            const tracks = await rsTransformer.getTrackResults({track: nameToCredit('One More Time')}) as TrackSearchResult[];
            expect(tracks).to.be.an('array').that.is.not.empty;
            expect(tracks[0].track?.name).to.eq('One More Time');
            expect(tracks[0].artists).to.not.be.empty;

            const artists = await rsTransformer.getArtistResults({artists: [nameToCredit('Daft Punk')]}) as ArtistSearchResult[];
            expect(artists).to.be.an('array').that.is.not.empty;
            expect(artists[0].name).to.eq('Daft Punk');

            const albums = await rsTransformer.getAlbumResults({album: nameToCredit('Discovery')}) as AlbumSearchResult[];
            expect(albums).to.be.an('array').that.is.not.empty;
            expect(albums[0].name).to.eq('Discovery');

            expect(await rsTransformer.getTrackResults({track: nameToCredit('zzqqxxjjkkww')})).to.be.empty;
        });

        it('returns no results for service ids it cannot look up', async function () {
            await rsTransformer.initialize();

            expect(await rsTransformer.getTrackResults({name: 'musicbrainz', id: 'abc', idType: 'release'})).to.be.empty;
            expect(await rsTransformer.getArtistResults({name: 'spotify', id: 'abc'})).to.be.empty;
            expect(await rsTransformer.getAlbumResults({name: 'musicbrainz', id: 'abc', idType: 'release'})).to.be.empty;
        });

    });

});