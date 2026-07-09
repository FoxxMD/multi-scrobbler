import { loggerTest } from '@foxxmd/logging';
import { getRoot } from "../ioc.ts";
import { transientCache, transientDb } from './utils/TransientTestUtils.ts';

const root = getRoot({cache: transientCache, logger: loggerTest, db: transientDb});
root.items.cache().init();