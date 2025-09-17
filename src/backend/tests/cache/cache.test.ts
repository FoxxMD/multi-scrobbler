import { loggerTest, loggerDebug } from "@foxxmd/logging";
import chai, { assert, expect } from 'chai';
import asPromised from 'chai-as-promised';
import { after, before, describe, it } from 'mocha';
import dayjs from "dayjs";
import withLocalTmpDir from 'with-local-tmp-dir';
import path from 'path';
import { initFileCache, initMemoryCache, initValkeyCache, MSCache } from "../../common/Cache.js";
import { generatePlay, generatePlayerStateData, generatePlays, normalizePlays } from "../utils/PlayTestUtils.js";
import { ListenProgressPositional, ListenProgressTS } from "../../sources/PlayerState/ListenProgress.js";
import { isPortReachableConnect } from "../../utils/NetworkUtils.js";
import { getRoot } from "../../ioc.js";
import { transientCache } from "../utils/CacheTestUtils.js";
import { TestScrobbler } from "../scrobbler/TestScrobbler.js";
import { sleep } from "../../utils.js";
import {promises} from 'node:fs';

chai.use(asPromised);

describe('#Caching', function () {

    describe('#MemoryCaching', function () {

        it('Memory cache preserves dayjs', async function () {

            const cache = initMemoryCache();

            const now = dayjs();

            await cache.set('foo', now);

            const time = await cache.get('foo');

            expect(time).to.not.be.undefined;
            expect(dayjs.isDayjs(time)).is.true;
            expect(now.toJSON()).eq((time as any).toJSON());
        });

        it('Memory cache preserves ListenProgress', async function () {

            const cache = initMemoryCache();

            const prog = new ListenProgressPositional({ timestamp: dayjs(), position: 35, positionPercent: 50 });

            await cache.set('foo', prog);

            const cachedProg = await cache.get('foo') as ListenProgressTS;

            expect(cachedProg).to.not.be.undefined;
            expect(cachedProg instanceof ListenProgressTS).is.true;
            expect(cachedProg.timestamp.toJSON()).eq(prog.timestamp.toJSON());
        });

    });

    describe('#FileCaching', function () {

        it('File cache serializes and deserializes dayjs', async function () {

            withLocalTmpDir(async () => {

                const [keyv, flat] = await initFileCache({ cacheDir: process.cwd() });

                const now = dayjs();

                await keyv.set('foo', now);
                flat.save();

                const [cleanKeyv, cleanFlat] = await initFileCache({ cacheDir: process.cwd() });

                const time = await cleanKeyv.get('foo');

                expect(time).to.not.be.undefined;
                expect(time instanceof dayjs).is.true;
                expect(now.toJSON()).eq((time as any).toJSON());
                flat.destroy();

            }, { unsafeCleanup: true });
        });

        it('File cache serializes and deserializes ListenProgress', async function () {

            withLocalTmpDir(async () => {

                const [keyv, flat] = await initFileCache({ cacheDir: process.cwd() });

                const prog = new ListenProgressPositional({ timestamp: dayjs(), position: 35, positionPercent: 50 });

                await keyv.set('foo', prog);
                await flat.save();

                const [cleanKeyv, cleanFlat] = await initFileCache({ cacheDir: process.cwd() });

                const cachedProg = await cleanKeyv.get('foo');

                expect(cachedProg).to.not.be.undefined;
                expect(cachedProg instanceof ListenProgressTS).is.true;
                expect(cachedProg.timestamp.toJSON()).eq(prog.timestamp.toJSON());
                flat.destroy();

            }, { unsafeCleanup: true });
        });
    });

    describe('#ValkeyCaching', function () {
        before(async function () {
            try {
                await isPortReachableConnect(6379, { host: 'valkey' });
            } catch (e) {
                // don't run valkey tests if valkey isn't present
                this.skip();
            }
        });

        it('Valkey cache serializes and deserializes dayjs', async function () {

            const keyv = await initValkeyCache('test', 'redis://valkey:6379');
            await keyv.clear();

            const now = dayjs();

            await keyv.set('foo', now);

            const time = await keyv.get('foo');

            expect(time).to.not.be.undefined;
            expect(time instanceof dayjs).is.true;
            expect(now.toJSON()).eq((time as any).toJSON());

        });

        it('Valkey cache serializes and deserializes ListenProgress', async function () {

            const keyv = await initValkeyCache('test', 'redis://valkey:6379');
            await keyv.clear();

            const prog = new ListenProgressPositional({ timestamp: dayjs(), position: 35, positionPercent: 50 });

            await keyv.set('foo', prog);

            const cachedProg = await keyv.get('foo');

            expect(cachedProg).to.not.be.undefined;
            expect(cachedProg instanceof ListenProgressTS).is.true;
            expect(cachedProg.timestamp.toJSON()).eq(prog.timestamp.toJSON());

        });
    });

    describe('#ScrobbleCache', function () {

        afterEach(function () {
            const root = getRoot();
            root.upsert({ cache: () => transientCache });
            root.items.cache().init();
        });

        it('Preserves scrobbles', async function () {


           await withLocalTmpDir(async () => {

                const root = getRoot();
                root.upsert({ cache: () => () => new MSCache(loggerTest, { scrobble: { provider: 'file', connection: process.cwd(), persistInterval: 100 } }) });

                const test = new TestScrobbler();
                await test.initialize();
                const plays = generatePlays(100);
                test.queueScrobble(plays, 'testSource');
                const queued = test.queuedScrobbles.map(x => x.play);
                await sleep(101);
                const dirContents = await promises.readdir('.');
                const hasCache = dirContents.some(x => x === 'ms-scrobble.cache');
                expect(hasCache).is.true;

                const newTest = new TestScrobbler();
                await newTest.initialize();
                expect(newTest.queuedScrobbles.length).to.eq(plays.length);
                expect(newTest.queuedScrobbles[0].play.data.track).to.eq(queued[0].data.track);

            }, { unsafeCleanup: true });

        });

    });

});
