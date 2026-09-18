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
import { artistNamesToCredits } from '../../../core/StringUtils.ts';
import type { RockskyApiClientConfig } from '../../common/vendor/rocksky/interfaces.ts';
import type { MarkRequired } from 'ts-essentials';
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
                    track: "Little Joe and Mary ii",
                    artists: artistNamesToCredits(["Khruangbin"]),
                    album: "The Universe Smiles Upon You ii"
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
        //             artists: artistNamesToCredits(["The Beatles"]),
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
                    track: "JUST A TEST IT WON'T WORK",
                    artists: artistNamesToCredits(["ASDNVLKUFDOSF"]),
                    album: "FSDFDFDFDD"
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

});