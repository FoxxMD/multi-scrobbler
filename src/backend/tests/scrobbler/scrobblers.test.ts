import {describe, it} from 'mocha';
import {assert} from 'chai';
import clone from 'clone';

import withDuration from '../plays/withDuration.json';
import mixedDuration from '../plays/mixedDuration.json';

import {TestScrobbler} from "./TestScrobbler";
import {asPlays, generatePlay, normalizePlays} from "../utils/PlayTestUtils";
import dayjs from "dayjs";

const firstPlayDate = dayjs().subtract(1, 'hour');

const withDurPlays = asPlays(withDuration);
const mixedDurPlays = asPlays(mixedDuration);
const normalizedWithDur = normalizePlays(withDurPlays, {initialDate: firstPlayDate});
const normalizedWithMixedDur = normalizePlays(mixedDurPlays, {initialDate: firstPlayDate});

const testScrobbler = new TestScrobbler();
testScrobbler.lastScrobbleCheck = dayjs().subtract(60, 'seconds');

describe('When scrobble is unique', function () {

    it('It is not detected as duplicate when play date is newer than most recent', async function () {

        testScrobbler.recentScrobbles = normalizedWithDur;

        const newScrobble = generatePlay({
            playDate: normalizedWithDur[normalizedWithDur.length - 1].data.playDate.add(70, 'seconds')
        });

        assert.isFalse(await testScrobbler.alreadyScrobbled(newScrobble));
    });

    it('It is not detected as duplicate when play date is close to an existing scrobble', async function () {

        testScrobbler.recentScrobbles = normalizedWithDur;

        const newScrobble = generatePlay({
            playDate: normalizedWithDur[normalizedWithDur.length - 2].data.playDate.add(3, 'seconds')
        });

        assert.isFalse(await testScrobbler.alreadyScrobbled(newScrobble));
    });
});

describe('When scrobble track/artist/album matches existing but is a new scrobble', function () {


    it('Is not detected as duplicate when play date is different by more than 10 seconds (high granularity source)', async function () {

        testScrobbler.recentScrobbles = normalizedWithDur;

        const timeOffPos = clone(normalizedWithDur[normalizedWithDur.length - 1]);
        timeOffPos.data.playDate = timeOffPos.data.playDate.add(11, 's');

        const timeOffNeg = clone(normalizedWithDur[normalizedWithDur.length - 1]);
        timeOffNeg.data.playDate = timeOffNeg.data.playDate.subtract(11, 's');

        assert.isFalse(await testScrobbler.alreadyScrobbled(timeOffPos));
        assert.isFalse(await testScrobbler.alreadyScrobbled(timeOffNeg));
    });

    it('Is not detected as duplicate when play date is different by more than 60 seconds (low granularity source)', async function () {

        testScrobbler.recentScrobbles = normalizePlays(withDurPlays, {initialDate: firstPlayDate, defaultMeta: {source: 'subsonic'}});

        const timeOffPos = clone(normalizedWithDur[normalizedWithDur.length - 1]);
        timeOffPos.data.playDate = timeOffPos.data.playDate.add(61, 's');

        const timeOffNeg = clone(normalizedWithDur[normalizedWithDur.length - 1]);
        timeOffNeg.data.playDate = timeOffNeg.data.playDate.subtract(61, 's');

        assert.isFalse(await testScrobbler.alreadyScrobbled(timeOffPos));
        assert.isFalse(await testScrobbler.alreadyScrobbled(timeOffNeg));
    });
});

describe('When scrobble is a duplicate', function () {

    it('Is detected as duplicate when an exact match', async function () {
        testScrobbler.recentScrobbles = normalizedWithDur;
        assert.isTrue(await testScrobbler.alreadyScrobbled(normalizedWithDur[normalizedWithDur.length - 1]));
    });

    it('Is detected as duplicate when play date is off by less than 10 seconds (high granularity source)', async function () {

        testScrobbler.recentScrobbles = normalizedWithDur;

        const timeOffPos = clone(normalizedWithDur[normalizedWithDur.length - 1]);
        timeOffPos.data.playDate = timeOffPos.data.playDate.add(10, 's');

        const timeOffNeg = clone(normalizedWithDur[normalizedWithDur.length - 1]);
        timeOffNeg.data.playDate = timeOffNeg.data.playDate.subtract(10, 's');

        assert.isTrue(await testScrobbler.alreadyScrobbled(timeOffPos));
        assert.isTrue(await testScrobbler.alreadyScrobbled(timeOffNeg));
    });

    it('Is detected as duplicate when play date is off by less than 60 seconds (low granularity source)', async function () {

        testScrobbler.recentScrobbles = normalizePlays(withDurPlays, {initialDate: firstPlayDate, defaultMeta: {source: 'subsonic'}});

        const timeOffPos = clone(normalizedWithDur[normalizedWithDur.length - 1]);
        timeOffPos.data.playDate = timeOffPos.data.playDate.add(59, 's');

        const timeOffNeg = clone(normalizedWithDur[normalizedWithDur.length - 1]);
        timeOffNeg.data.playDate = timeOffNeg.data.playDate.subtract(59, 's');

        assert.isTrue(await testScrobbler.alreadyScrobbled(timeOffPos));
        assert.isTrue(await testScrobbler.alreadyScrobbled(timeOffNeg));
    });
});
