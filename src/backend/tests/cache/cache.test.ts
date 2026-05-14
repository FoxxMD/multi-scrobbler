import { loggerTest, loggerDebug } from "@foxxmd/logging";
import chai, { assert, expect } from 'chai';
import asPromised from 'chai-as-promised';
import { after, before, describe, it } from 'mocha';
import dayjs from "dayjs";
import withLocalTmpDir from 'with-local-tmp-dir';
import { initFileCache, initMemoryCache, initValkeyCache } from "../../common/Cache.js";
import { ListenProgressPositional, ListenProgressTS } from "../../sources/PlayerState/ListenProgress.js";
import { isPortReachableConnect } from "../../utils/NetworkUtils.js";
import { sleep } from "../../utils.js";

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

            await withLocalTmpDir(async () => {
                // for some reason this *recreates* an empty cache after the test has finished (when running the full suite)
                // i think its because of long persist interval compared to test time?
                // 
                // so:
                // make intervals very small
                // call destroy on both cache instances (shouldn't be necessary)
                // sleep for longer than persist interal so tmp dir callback can (hopefully) properly delete any files

                const [keyv, flat] = await initFileCache({ cacheDir: process.cwd(), persistInterval: 5, expirationInterval: 4 });

                const now = dayjs();

                await keyv.set('foo', now);
                flat.save(true);
                keyv.disconnect();

                const [cleanKeyv, cleanFlat] = await initFileCache({ cacheDir: process.cwd(), persistInterval: 5, expirationInterval: 4 });

                const time = await cleanKeyv.get('foo');

                expect(time).to.not.be.undefined;
                expect(time instanceof dayjs).is.true;
                expect(now.toJSON()).eq((time as any).toJSON());
                flat.destroy();
                cleanFlat.destroy();
                await sleep(10);
            }, { unsafeCleanup: true, postfix: 'fileCacheDajys' });
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
    });
});
