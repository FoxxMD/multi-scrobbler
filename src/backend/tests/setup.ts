import { loggerTest } from '@foxxmd/logging';
import chai from 'chai';
import asPromised from 'chai-as-promised';
import { getRoot } from "../ioc.ts";
import { transientCache, transientDb } from './utils/TransientTestUtils.ts';
import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration.js';
import isBetween from 'dayjs/plugin/isBetween.js';
import relativeTime from 'dayjs/plugin/relativeTime.js';
import isToday from 'dayjs/plugin/isToday.js';
import timezone from 'dayjs/plugin/timezone.js';
import week from 'dayjs/plugin/weekOfYear.js';
import utc from 'dayjs/plugin/utc.js';
import { retryTiming } from '../common/infrastructure/Atomic.ts';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// tests that load .env would otherwise write data files (rsindex dirs, ...) into the real data dir (DATA_DIR=./config)
// dotenv does not override an env var that is already set
const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ms-test-data-'));
process.env.DATA_DIR = testDataDir;
process.on('exit', () => fs.rmSync(testDataDir, {recursive: true, force: true}));

// register globally so every test file has chai-as-promised assertions,
// even when run alone or in a parallel worker before any file that registers it itself
chai.use(asPromised);

dayjs.extend(utc)
dayjs.extend(isBetween);
dayjs.extend(relativeTime);
dayjs.extend(duration);
dayjs.extend(timezone);
dayjs.extend(isToday);
dayjs.extend(week);

const root = getRoot({cache: transientCache, logger: loggerTest, db: transientDb});
root.items.cache().init();

// request retries wait 1ms instead of 300-1000ms+ (retry behavior is still tested, just not real backoff time)
retryTiming.scale = 0.001;
