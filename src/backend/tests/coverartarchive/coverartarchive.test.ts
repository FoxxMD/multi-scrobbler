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
import { generatePlay, withBrainz } from '../../../core/tests/utils/PlayTestUtils.ts';
import { CoverArtApiClient } from '../../common/vendor/musicbrainz/CoverArtApiClient.ts';
import { type CoverArtApiConfig } from '../../common/vendor/musicbrainz/CoverArtApiTypes.ts';
import CoverArtArchiveTransformer from '../../common/transforms/coverartarchive/CoverArtArchiveTransformer.ts';
import { generateCoverReleaseImageResponse, generateCoverResponse } from './caaFixtures.ts';
import { faker } from '@faker-js/faker';

chai.use(asPromised);

const envPath = path.join(getPathFromCWD(), '.env');
dotenv.config({ path: envPath });

const memorycache = () => new Cacheable({ primary: initMemoryCache({ ttl: '1ms' }) });

const createTransformer = () => new CoverArtArchiveTransformer({
        name: 'test',
        type: 'coverartarchive',
    }, {
        logger: loggerTest,
        clientCache: memorycache(),
        cache: memorycache()
    })
const transformer = createTransformer();

describe('CoverArtArchive Transformer', function () {

    describe('Basic Operations', function () {

        it('responds', async function () {

            this.timeout(350000);

            const coverResponse = generateCoverResponse({images: [generateCoverReleaseImageResponse()]});
            const imageResponse = faker.internet.url();

            await withRequestInterception(
                [
                http.get(/coverartarchive\.org\/(release|release-group)\/.+/, () => HttpResponse.json(coverResponse, { status: 200 })),
                http.get(/.+/, () => new HttpResponse(null, { status: 302, headers: {location: imageResponse!} }))
                ], async function() {
                    await transformer.initialize();
                    const play = withBrainz(generatePlay(), {include: ['album']});
                    const res = await transformer.getTransformerData(play, {
                        type: 'coverartarchive'
                    });
                    expect(res.release).eq(coverResponse.release);
                }
            )();
        });

        it('tries both mbid types', async function () {

            this.timeout(350000);

            const coverResponse = generateCoverResponse({images: [generateCoverReleaseImageResponse()]});
            const imageResponse = faker.internet.url();

            await withRequestInterception(
                [
                http.get('https://coverartarchive.org/release-group/:mbid', () => HttpResponse.json(coverResponse, { status: 200 })),
                http.get('https://coverartarchive.org/release/:mbid', () => new HttpResponse(null, {status: 404})),
                http.get(/.+/, () => new HttpResponse(null, { status: 302, headers: {location: imageResponse!} }))
                ], async function() {
                    await transformer.initialize();
                    const play = withBrainz(generatePlay(), {include: ['album','releaseGroup']});
                    const res = await transformer.getTransformerData(play, {
                        type: 'coverartarchive'
                    });
                    expect(res.type).eq('releaseGroup');
                    expect(res.lifecycleInputs!.find(x => x.type.includes('album-prereqFailure')));
                }
            )();
        });

        it('should not return result if filtered out by requirement for type', async function () {

            this.timeout(350000);

            const coverResponse = generateCoverResponse({images: [generateCoverReleaseImageResponse({types: ['Back'], back: true, front: false})]});
            const imageResponse = faker.internet.url();

            await withRequestInterception(
                [
                http.get('https://coverartarchive.org/release/:mbid', () => HttpResponse.json(coverResponse, { status: 200 })),
                http.get(/.+/, () => new HttpResponse(null, { status: 302, headers: {location: imageResponse!} }))
                ], async function() {
                    await transformer.initialize();
                    const play = withBrainz(generatePlay(), {include: ['album']});
                    const res = await transformer.getTransformerData(play, {
                        type: 'coverartarchive',
                        allowedTypes: ['front']
                    });
                    expect(res.images).length(0)
                }
            )();
        });

        it('should not return result if filtered out by requirement for size', async function () {

            this.timeout(350000);

            const coverResponse = generateCoverResponse({images: [generateCoverReleaseImageResponse({thumbnails: {"250": faker.internet.url()}})]});
            const imageResponse = faker.internet.url();

            await withRequestInterception(
                [
                http.get('https://coverartarchive.org/release/:mbid', () => HttpResponse.json(coverResponse, { status: 200 })),
                http.get(/.+/, () => new HttpResponse(null, { status: 302, headers: {location: imageResponse!} }))
                ], async function() {
                    await transformer.initialize();
                    const play = withBrainz(generatePlay(), {include: ['album']});
                    const res = await transformer.getTransformerData(play, {
                        type: 'coverartarchive',
                        allowedSizes: ['500']
                    });
                    expect(res.images).length(0)
                }
            )();
        });

        it('should return preferred size for transform', async function () {

            const coverResponse = generateCoverResponse({images: [generateCoverReleaseImageResponse({
                thumbnails: {
                    "250": faker.internet.url(),
                    "500": faker.internet.url()
                },
                types: ['Front'],
                front: true
            })]});
            const imageResponse = coverResponse.images[0].thumbnails["500"];

            await withRequestInterception(
                [
                http.get('https://coverartarchive.org/release/:mbid', () => HttpResponse.json(coverResponse, { status: 200 })),
                http.get(/.+/, () => new HttpResponse(null, { status: 302, headers: {location: imageResponse!} }))
                ], async function() {
                    await transformer.initialize();
                    const play = withBrainz(generatePlay(), {include: ['album']});
                    const res = await transformer.getTransformerData(play, {
                        type: 'coverartarchive',
                        preferredSizes: ['1200','500']
                    });
                    const data = await transformer.handlePostFetch(play,
                        res,
                        {
                        type: 'coverartarchive',
                        preferredSizes: ['1200','500']
                    })
                    expect(data).to.exist;
                    expect(data.uri).eq(coverResponse.images[0].thumbnails["500"])
                }
            )();
        });

    });

});

const createCoverArtApi = (config: CoverArtApiConfig = {}) => new CoverArtApiClient('test', config, {logger: loggerTest})
const CA_MOCK_URL_STR = 'http://coverartarchive.org';
//const CA_MOCK_URL_REG = /coverartarchive\.org/;
const CA_MOCK_URL = CA_MOCK_URL_STR;
const RELEASE = '76df3287-6cda-33eb-8e9a-044b5e15ffdd';
const INVALID_RELEASE = '76df3287-6cda-33eb-8e9a-044b5e15ffde';
const RELEASE_GROUP = 'dc7bec45-b321-4dfc-be66-96eab5acb36e';

describe('#CoverArt CoverArtArchive API', function () {
    it('Should get url from response',
        withRequestInterception(
            [
                http.get(`${CA_MOCK_URL_STR}/release/${RELEASE}/front-250`, () => new HttpResponse(null, { status: 307, headers: {location: `${CA_MOCK_URL_STR}/download/1.jpg`} })
                ),
                http.get(`${CA_MOCK_URL_STR}/download/1.jpg`, () => new HttpResponse(null, { status: 302, headers: {location: `${CA_MOCK_URL_STR}/cdn/1.jpg`} }))
            ],
            async function () {
                const api = createCoverArtApi({url: CA_MOCK_URL});
                const resp = await api.getCoverThumb(RELEASE, 'release', {size: 250});
                expect(resp).is.not.undefined;
                expect(resp).eq(`${CA_MOCK_URL_STR}/cdn/1.jpg`)
            }
    ));

    it('Should return undefined if release not found',
        withRequestInterception(
            [
                http.get(`${CA_MOCK_URL_STR}/release/${INVALID_RELEASE}/front-250`, () => new HttpResponse(null, { status: 404})
                ),
            ],
            async function () {
                const api = createCoverArtApi({url: CA_MOCK_URL});
                const resp = await api.getCoverThumb(INVALID_RELEASE, 'release', {size: 250});
                expect(resp).is.undefined;
            }
    ));

    describe('#CoverArt Real API', function() {

        before(function () {
            if (process.env.CAA_TEST !== 'true') {
                this.skip();
            }
        });

        it('Returns a response for release', async function() {
                const api = createCoverArtApi();
                const resp = await api.getCoverThumb(RELEASE, 'release', {size: 250});
                expect(resp).is.not.undefined;
        });
        it('Returns a response for release-group', async function() {
            const api = createCoverArtApi();
            const resp = await api.getCoverThumb(RELEASE_GROUP, 'release-group', {size: 250});
            expect(resp).is.not.undefined;
        });
    });
});