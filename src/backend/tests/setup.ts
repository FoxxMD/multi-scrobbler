import { loggerTest } from '@foxxmd/logging';
import { getRoot } from "../ioc.js";
import { transientCache } from './utils/CacheTestUtils.js';

const root = getRoot({cache: transientCache, logger: loggerTest, staggerOptions: {initialInterval: 1, maxRandomStagger: 1}});
root.items.cache().init();