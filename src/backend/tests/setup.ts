import { loggerTest } from '@foxxmd/logging';
import { getRoot } from "../ioc.js";
import { transientCache, transientDb } from './utils/TransientTestUtils.js';

const root = getRoot({cache: transientCache, logger: loggerTest, db: transientDb});
root.items.cache().init();