import { loggerTest } from '@foxxmd/logging';
import { getRoot } from "../ioc.js";
import { MSCache } from '../common/Cache.js';

const transientCache = () => new MSCache(loggerTest, {scrobble: {provider: 'memory'}});

const root = getRoot({cache: transientCache, logger: loggerTest});
root.items.cache().init();