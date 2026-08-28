import { loggerTest } from '@foxxmd/logging';
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

dayjs.extend(utc)
dayjs.extend(isBetween);
dayjs.extend(relativeTime);
dayjs.extend(duration);
dayjs.extend(timezone);
dayjs.extend(isToday);
dayjs.extend(week);

const root = getRoot({cache: transientCache, logger: loggerTest, db: transientDb});
root.items.cache().init();