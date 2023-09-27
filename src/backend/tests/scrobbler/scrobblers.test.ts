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
testScrobbler.verboseOptions = {
    match: {
        onMatch: true,
        onNoMatch: true,
        confidenceBreakdown: true
    }};
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

    it('Is not detected as duplicate when artist is same but track is different (similar time)', async function () {

        testScrobbler.recentScrobbles = normalizedWithDur;

        const diffPlay = clone(normalizedWithDur[1]);
        diffPlay.data.playDate = diffPlay.data.playDate.add(9, 's');
        diffPlay.data.track = 'A Totally Different Track'

        assert.isFalse(await testScrobbler.alreadyScrobbled(diffPlay));
    });

    it('Is not detected as duplicate when track is same but artist is different (similar time)', async function () {

        testScrobbler.recentScrobbles = normalizedWithDur;

        const diffPlay = clone(normalizedWithDur[1]);
        diffPlay.data.playDate = diffPlay.data.playDate.add(9, 's');
        diffPlay.data.artists = ['A Different Artist'];

        assert.isFalse(await testScrobbler.alreadyScrobbled(diffPlay));
    });


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

describe('When scrobble is a duplicate (title/artists/album)', function () {

    it('Is detected as duplicate when an exact match', async function () {
        testScrobbler.recentScrobbles = normalizedWithDur;
        assert.isTrue(await testScrobbler.alreadyScrobbled(normalizedWithDur[normalizedWithDur.length - 1]));
    });

    it('Is detected as duplicate when artist/title differences are whitespace or case', async function () {
        testScrobbler.recentScrobbles = normalizedWithDur;
        const ref = normalizedWithDur[3];

        const diffPlay = clone(ref);
        diffPlay.data.playDate = diffPlay.data.playDate.add(9, 's');


        diffPlay.data.track = ref.data.track.toUpperCase();
        assert.isTrue(await testScrobbler.alreadyScrobbled(diffPlay));

        diffPlay.data.track = `  ${ref.data.track} `;
        assert.isTrue(await testScrobbler.alreadyScrobbled(diffPlay));

        diffPlay.data.track = ref.data.track.replaceAll(' ', '   ');
        assert.isTrue(await testScrobbler.alreadyScrobbled(diffPlay));

        diffPlay.data.artists = ref.data.artists.map(x => x.toUpperCase());
        assert.isTrue(await testScrobbler.alreadyScrobbled(diffPlay));

        diffPlay.data.artists = ref.data.artists.map(x => x.replaceAll(' ', '   '));
        assert.isTrue(await testScrobbler.alreadyScrobbled(diffPlay));
    });

    it('Is detected as duplicate when artist/title differences are from unicode normalization', async function () {
        testScrobbler.recentScrobbles = normalizedWithDur;
        const ref = normalizedWithDur[1];

        const diffPlay = clone(ref);
        diffPlay.data.playDate = diffPlay.data.playDate.add(9, 's');
        diffPlay.data.track = 'Jimbo';
        assert.isTrue(await testScrobbler.alreadyScrobbled(diffPlay));
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

    describe('When existing has duration', function () {

        it('Is detected as duplicate when play date is close to the end of an existing scrobble', async function () {

            testScrobbler.recentScrobbles = normalizedWithDur;

            const timeEnd = clone(normalizedWithDur[normalizedWithDur.length - 1]);
            timeEnd.data.playDate = timeEnd.data.playDate.add(timeEnd.data.duration, 's');

            assert.isTrue(await testScrobbler.alreadyScrobbled(timeEnd));
        });

    });
});
