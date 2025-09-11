import { loggerTest } from '@foxxmd/logging';
import { getRoot } from "../ioc.js";
import { transientCache } from './utils/CacheTestUtils.js';

const root = getRoot({cache: transientCache, logger: loggerTest});
root.items.cache().init();