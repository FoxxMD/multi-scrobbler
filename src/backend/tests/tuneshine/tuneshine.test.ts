import * as dotenv from 'dotenv';
import { loggerTest } from "@foxxmd/logging";
import chai, { expect } from 'chai';
import asPromised from 'chai-as-promised';
import { before, describe, it } from 'mocha';
import { initMemoryCache } from "../../common/Cache.ts";
import { Cacheable } from "cacheable";
import { getPathFromCWD } from '../../common/index.ts';
import path from 'path';
import { withRequestInterception } from '../utils/networking.ts';
import { http, HttpResponse } from "msw";
import { generatePlay } from '../../../core/tests/utils/PlayTestUtils.ts';
import { faker } from '@faker-js/faker';
import { TuneshineApiClient } from '../../common/vendor/tuneshine/TuneshineApiClient.ts';
import fs from 'node:fs/promises';

chai.use(asPromised);

const envPath = path.join(getPathFromCWD(), '.env');
dotenv.config({ path: envPath });

const memorycache = () => new Cacheable({ primary: initMemoryCache({ ttl: '1ms' }) });

describe('Tuneshine API', function () {

    describe('Basic Operations', function () {

        it('responds', async function () {

            this.timeout(350000);

            const client = new TuneshineApiClient('test', {data: {host: 'https://test.local'}}, {cache: memorycache(), logger: loggerTest});
            await client.buildData();

            const play = generatePlay(undefined, {art: {album: 'https://test.image/01.png'}});

            await withRequestInterception(
                [
                http.post('https://test.local/image', (req) => HttpResponse.json({status: "ok"}, { status: 200 })),
                http.get('https://test.image/01.png', async() => {
                    const imagePath = path.resolve(import.meta.dirname, './icon.png');
                    const fileContents = await fs.readFile(imagePath);
                      return HttpResponse.arrayBuffer(fileContents.buffer, {
                        headers: {
                        'content-type': 'image/png',
                        },
                    });
                })
                ], async function() {
                    await client.sendNowPlaying(play);
                    const f = 1;
                }
            )();
        });

    });

});