import {describe, it, after, before} from 'mocha';
import {assert} from 'chai';
import clone from 'clone';
import pEvent from 'p-event';
import { http, HttpResponse } from 'msw';

import withDuration from '../plays/withDuration.json';
import mixedDuration from '../plays/mixedDuration.json';

import {TestScrobbler} from "./TestScrobbler";
import {asPlays, generatePlay, normalizePlays} from "../utils/PlayTestUtils";
import dayjs from "dayjs";
import {sleep} from "../../utils";
import {MockNetworkError, withRequestInterception} from "../utils/networking";

const firstPlayDate = dayjs().subtract(1, 'hour');
const olderFirstPlayDate = dayjs().subtract(4, 'hour');

const withDurPlays = asPlays(withDuration);
const mixedDurPlays = asPlays(mixedDuration);
const normalizedWithDur = normalizePlays(withDurPlays, {initialDate: firstPlayDate});
const normalizedWithMixedDur = normalizePlays(mixedDurPlays, {initialDate: firstPlayDate});

const normalizedWithMixedDurOlder = normalizePlays(mixedDurPlays, {initialDate: olderFirstPlayDate});

const testScrobbler = new TestScrobbler();
testScrobbler.verboseOptions = {
    match: {
        onMatch: true,
        onNoMatch: true,
        confidenceBreakdown: true
    }
};
testScrobbler.lastScrobbleCheck = dayjs().subtract(60, 'seconds');

describe('Networking', function () {

    describe('Authentication', function () {
        it('Should set as authenticated if doAuthentication does not throw and returns true',
            withRequestInterception(
                [
                    http.get('http://example.com', () => {
                            // https://github.com/mswjs/msw/issues/1819#issuecomment-1789364174
                            // already using DOM though, not sure why it doesn't fix itself
                            // @ts-expect-error
                            return new HttpResponse(null, {status: 200});
                        }
                    )
                ],
                async function() {
                    await testScrobbler.testAuth();
                    assert.isTrue(testScrobbler.authed);
                }
            ));

        it('Should set as unauthenticated with possibility to retry if error is network related',
            withRequestInterception(
                [
                    http.get('http://example.com', () => {
                            throw new MockNetworkError('EAI_AGAIN');
                        }
                    )
                ],
                async function() {
                    await testScrobbler.testAuth();
                    assert.isFalse(testScrobbler.authed);
                    assert.isFalse(testScrobbler.authFailure);
                }
            ));

        it('Should set as unauthenticated with no possibility to retry if error is not network related',
            withRequestInterception(
                [
                    http.get('http://example.com', () => {
                            // @ts-expect-error
                            return HttpResponse.json({error: 'Invalid API Key'}, {status: 401});
                        }
                    )
                ],
                async function() {
                    await testScrobbler.testAuth();
                    assert.isFalse(testScrobbler.authed);
                    assert.isTrue(testScrobbler.authFailure);
                }
            ));
    });
});

describe('Detects duplicate and unique scrobbles from client recent history', function () {

    describe('When scrobble is unique', function () {

        it('It is not detected as duplicate when play date is newer than most recent', async function () {

            testScrobbler.recentScrobbles = normalizedWithMixedDur;

            const newScrobble = generatePlay({
                playDate: normalizedWithMixedDur[normalizedWithMixedDur.length - 1].data.playDate.add(70, 'seconds')
            });

            assert.isFalse(await testScrobbler.alreadyScrobbled(newScrobble));
            return;
        });

        it('It is not detected as duplicate when play date is close to an existing scrobble', async function () {

            testScrobbler.recentScrobbles = normalizedWithMixedDur;

            const newScrobble = generatePlay({
                playDate: normalizedWithMixedDur[normalizedWithMixedDur.length - 3].data.playDate.add(3, 'seconds')
            });

            assert.isFalse(await testScrobbler.alreadyScrobbled(newScrobble));
        });
    });

    describe('When scrobble track/artist/album matches existing but is a new scrobble', function () {

        it('Is not detected as duplicate when artist is same, time is similar, but track is different', async function () {

            testScrobbler.recentScrobbles = normalizedWithMixedDur;

            const diffPlay = clone(normalizedWithMixedDur[1]);
            diffPlay.data.playDate = diffPlay.data.playDate.add(9, 's');
            diffPlay.data.track = 'A Totally Different Track'

            assert.isFalse(await testScrobbler.alreadyScrobbled(diffPlay));
        });

        it('Is not detected as duplicate when track is same, time is similar, but artist is different', async function () {

            testScrobbler.recentScrobbles = normalizedWithMixedDur;

            const diffPlay = clone(normalizedWithMixedDur[1]);
            diffPlay.data.playDate = diffPlay.data.playDate.add(9, 's');
            diffPlay.data.artists = ['A Different Artist'];

            assert.isFalse(await testScrobbler.alreadyScrobbled(diffPlay));
        });


        it('Is not detected as duplicate when play date is different by more than 10 seconds (high granularity source)', async function () {

            testScrobbler.recentScrobbles = normalizedWithMixedDur;

            const timeOffPos = clone(normalizedWithMixedDur[normalizedWithMixedDur.length - 1]);
            timeOffPos.data.playDate = timeOffPos.data.playDate.add(11, 's');

            const timeOffNeg = clone(normalizedWithMixedDur[normalizedWithMixedDur.length - 1]);
            timeOffNeg.data.playDate = timeOffNeg.data.playDate.subtract(11, 's');

            assert.isFalse(await testScrobbler.alreadyScrobbled(timeOffPos));
            assert.isFalse(await testScrobbler.alreadyScrobbled(timeOffNeg));
        });

        it('Is not detected as duplicate when play date is different by more than 60 seconds (low granularity source)', async function () {

            testScrobbler.recentScrobbles = normalizePlays(mixedDurPlays, {
                initialDate: firstPlayDate,
                defaultMeta: {source: 'subsonic'}
            });

            const timeOffPos = clone(normalizedWithMixedDur[normalizedWithMixedDur.length - 1]);
            timeOffPos.data.playDate = timeOffPos.data.playDate.add(61, 's');

            const timeOffNeg = clone(normalizedWithMixedDur[normalizedWithMixedDur.length - 1]);
            timeOffNeg.data.playDate = timeOffNeg.data.playDate.subtract(61, 's');

            assert.isFalse(await testScrobbler.alreadyScrobbled(timeOffPos));
            assert.isFalse(await testScrobbler.alreadyScrobbled(timeOffNeg));
        });

        describe('When existing has duration', function () {
            it('A track with continuity to the previous track is not detected as a duplicate', async function () {

                testScrobbler.recentScrobbles = normalizedWithDur;

                const brickPt1 = normalizedWithDur.find(x => x.data.track.includes('Another Brick'));
                const brickPt2 = clone(brickPt1);
                brickPt2.data.track = 'Another Brick in the Wall, Pt. 2';
                brickPt2.data.playDate = brickPt1.data.playDate.add(brickPt1.data.duration + 1, 'seconds');
                assert.isFalse(await testScrobbler.alreadyScrobbled(brickPt2));

                const story1 = normalizedWithDur.find(x => x.data.track.includes('Da Art of'));
                const story2 = clone(story1);
                story2.data.track = `Da Art of Storytellin' (Pt. 2)`;
                story2.data.playDate = story2.data.playDate.add(story1.data.duration + 1, 'seconds');

                assert.isFalse(await testScrobbler.alreadyScrobbled(story2));

                const ballad1 = normalizedWithDur.find(x => x.data.track.includes('Ballade No. 1'));
                const ballad2 = clone(ballad1);
                ballad2.data.track = `Ballade No. 2 in G Minor, Op. 27`;
                ballad2.data.playDate = ballad2.data.playDate.add(ballad1.data.duration + 1, 'seconds');

                assert.isFalse(await testScrobbler.alreadyScrobbled(ballad2));
            });
        });

    });

    describe('When scrobble is a duplicate (title/artists/album)', function () {

        it('Is detected as duplicate when an exact match', async function () {
            testScrobbler.recentScrobbles = normalizedWithMixedDur;
            assert.isTrue(await testScrobbler.alreadyScrobbled(normalizedWithMixedDur[normalizedWithMixedDur.length - 1]));
        });

        it('Is detected as duplicate when artist/title differences are whitespace or case', async function () {
            testScrobbler.recentScrobbles = normalizedWithMixedDur;
            const ref = normalizedWithMixedDur[3];

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
            testScrobbler.recentScrobbles = normalizedWithMixedDur;
            const ref = normalizedWithMixedDur.find(x => x.data.track === 'Jimbó');

            const diffPlay = clone(ref);
            diffPlay.data.playDate = diffPlay.data.playDate.add(9, 's');
            diffPlay.data.track = 'Jimbo';
            assert.isTrue(await testScrobbler.alreadyScrobbled(diffPlay));
        });

        it('Is detected as duplicate when play date is off by 10 seconds or less (high granularity source)', async function () {

            testScrobbler.recentScrobbles = normalizedWithMixedDur;

            const timeOffPos = clone(normalizedWithMixedDur[normalizedWithMixedDur.length - 1]);
            timeOffPos.data.playDate = timeOffPos.data.playDate.add(10, 's');

            const timeOffNeg = clone(normalizedWithMixedDur[normalizedWithMixedDur.length - 1]);
            timeOffNeg.data.playDate = timeOffNeg.data.playDate.subtract(10, 's');

            assert.isTrue(await testScrobbler.alreadyScrobbled(timeOffPos));
            assert.isTrue(await testScrobbler.alreadyScrobbled(timeOffNeg));

            // 10 seconds fuzzy diff inclusive
            const son = normalizedWithMixedDurOlder.find(x => x.data.track === 'Sonora')
            son.data.playDate = dayjs().subtract(1, 'hour').set('minute', 26).set('second', 20);
            son.data.duration = 267;
            son.data.listenedFor = undefined;
            testScrobbler.recentScrobbles = normalizedWithMixedDurOlder.concat(son);

            const offSon = clone(son);
            offSon.data.playDate = dayjs().subtract(1, 'hour').set('minute', 30).set('second', 37);
            assert.isTrue(await testScrobbler.alreadyScrobbled(offSon));
        });

        it('Is detected as duplicate when play date is off by less than 60 seconds (low granularity source)', async function () {

            testScrobbler.recentScrobbles = normalizePlays(mixedDurPlays, {
                initialDate: firstPlayDate,
                defaultMeta: {source: 'subsonic'}
            });

            const timeOffPos = clone(normalizedWithMixedDur[normalizedWithMixedDur.length - 1]);
            timeOffPos.data.playDate = timeOffPos.data.playDate.add(59, 's');

            const timeOffNeg = clone(normalizedWithMixedDur[normalizedWithMixedDur.length - 1]);
            timeOffNeg.data.playDate = timeOffNeg.data.playDate.subtract(59, 's');

            assert.isTrue(await testScrobbler.alreadyScrobbled(timeOffPos));
            assert.isTrue(await testScrobbler.alreadyScrobbled(timeOffNeg));
        });

        it('Is detected as duplicate when title is exact, artist is similar, and time is similar', async function () {
            testScrobbler.recentScrobbles = normalizedWithMixedDur;
            const ref = normalizedWithMixedDur[3];

            const diffPlay = clone(ref);
            diffPlay.data.playDate = diffPlay.data.playDate.add(3, 's');
            diffPlay.data.artists = [diffPlay.data.artists[0]]
            assert.isTrue(await testScrobbler.alreadyScrobbled(diffPlay));

            diffPlay.data.artists = [ref.data.artists[1]]
            assert.isTrue(await testScrobbler.alreadyScrobbled(diffPlay));


            const son = normalizedWithMixedDur.find(x => x.data.track === 'Sonora')

            const sonDiffPlay = clone(son);
            sonDiffPlay.data.playDate = sonDiffPlay.data.playDate.subtract(son.data.duration + 1, 's');
            assert.isTrue(await testScrobbler.alreadyScrobbled(sonDiffPlay));
        });

        describe('When at least one play has duration', function () {

            it('Is detected as duplicate when play date is close to the end of an existing scrobble', async function () {

                testScrobbler.recentScrobbles = normalizedWithDur;

                const timeEnd = clone(normalizedWithDur[normalizedWithMixedDur.length - 1]);
                timeEnd.data.playDate = timeEnd.data.playDate.add(timeEnd.data.duration, 's');

                assert.isTrue(await testScrobbler.alreadyScrobbled(timeEnd));

                // only one has duration
                timeEnd.data.duration = undefined;

                assert.isTrue(await testScrobbler.alreadyScrobbled(timeEnd));

                // only one has duration
                timeEnd.data.duration = undefined;

                assert.isTrue(await testScrobbler.alreadyScrobbled(timeEnd));
            });

        });
    });
});

describe('Detects duplicate and unique scrobbles using actively tracked scrobbles', function() {

    before(function () {
        testScrobbler.recentScrobbles = normalizedWithMixedDur;
        testScrobbler.lastScrobbleCheck = dayjs().subtract(60, 'seconds');
    });

    it('Detects a unique play', async function() {
        const newScrobble = generatePlay({
            playDate: normalizedWithMixedDur[normalizedWithMixedDur.length - 3].data.playDate.add(3, 'seconds')
        });

        const [matchedPlay, matchedData] = testScrobbler.findExistingSubmittedPlayObj(newScrobble);

        assert.isUndefined(matchedPlay);
        assert.isEmpty(matchedData);
    });

    it('Detects an exact duplicate', async function() {
        const newScrobble = generatePlay({
            playDate: normalizedWithMixedDur[normalizedWithMixedDur.length - 3].data.playDate.add(3, 'seconds')
        });
        testScrobbler.addScrobbledTrack(newScrobble, newScrobble);

        const [matchedPlay, matchedData] = testScrobbler.findExistingSubmittedPlayObj(newScrobble);

        assert.isDefined(matchedPlay);
        assert.isNotEmpty(matchedData);
    });

    it('Detects a duplicate with close time', async function() {
        const newScrobble = generatePlay({
            playDate: normalizedWithMixedDur[normalizedWithMixedDur.length - 3].data.playDate.add(3, 'seconds')
        });
        testScrobbler.addScrobbledTrack(newScrobble, newScrobble);

        const dupScrobble = clone(newScrobble);
        dupScrobble.data.playDate = newScrobble.data.playDate.add(2, 'seconds');

        const [matchedPlay, matchedData] = testScrobbler.findExistingSubmittedPlayObj(dupScrobble);

        assert.isDefined(matchedPlay);
        assert.isNotEmpty(matchedData);
    });
});

describe('Manages scrobble queue', function() {

    before(function() {
        testScrobbler.recentScrobbles = normalizedWithMixedDur;
        testScrobbler.scrobbleSleep = 500;
        testScrobbler.scrobbleDelay = 0;
        testScrobbler.lastScrobbleCheck = dayjs().subtract(60, 'seconds');
        testScrobbler.initScrobbleMonitoring();
    });

    it('Scrobbles a uniquely queued play', async function() {
        const newScrobble = generatePlay({
            playDate: normalizedWithMixedDur[normalizedWithMixedDur.length - 3].data.playDate.add(3, 'seconds')
        });
        testScrobbler.queueScrobble(newScrobble, 'test');
        const res = await Promise.race([pEvent(testScrobbler.emitter, 'scrobble'), sleep(3000)]);

        assert.isDefined(res);
        assert.isDefined(res.data);
    });

    it('Does not Scrobble a duplicate play queued after original is scrobbled', async function() {
        this.timeout(3500);

        const newScrobble = generatePlay({
            playDate: normalizedWithMixedDur[normalizedWithMixedDur.length - 3].data.playDate.add(3, 'seconds')
        });
        const dupScrobble = clone(newScrobble);
        dupScrobble.data.playDate = newScrobble.data.playDate.add(2, 'seconds');

        testScrobbler.queueScrobble(newScrobble, 'test');
        const res = await Promise.race([pEvent(testScrobbler.emitter, 'scrobble'), sleep(1500)]);

        assert.isDefined(res);
        assert.isDefined(res.data);

        testScrobbler.queueScrobble(dupScrobble, 'test');
        const resDup = await Promise.race([pEvent(testScrobbler.emitter, 'scrobble'), sleep(1100)]);

        assert.isUndefined(resDup);
    });

    it('Does not Scrobble a duplicate play queued before original is scrobbled', async function() {
        this.timeout(3500);

        const newScrobble = generatePlay({
            playDate: normalizedWithMixedDur[normalizedWithMixedDur.length - 3].data.playDate.add(3, 'seconds')
        });
        const dupScrobble = clone(newScrobble);
        dupScrobble.data.playDate = newScrobble.data.playDate.add(2, 'seconds');

        testScrobbler.queueScrobble(newScrobble, 'test');
        testScrobbler.queueScrobble(dupScrobble, 'test');
        const res = await Promise.race([pEvent(testScrobbler.emitter, 'scrobble'), sleep(1500)]);

        assert.isDefined(res);
        assert.isDefined(res.data);

        const resDup = await Promise.race([pEvent(testScrobbler.emitter, 'scrobble'), sleep(1100)]);

        assert.isUndefined(resDup);
    });

    it('Delays scrobbles when many are queued', async function () {
        this.timeout(3500);

        const newScrobble1 = generatePlay({
            playDate: normalizedWithMixedDur[normalizedWithMixedDur.length - 3].data.playDate.add(3, 'seconds')
        });
        const newScrobble2 = generatePlay({
            playDate: normalizedWithMixedDur[normalizedWithMixedDur.length - 3].data.playDate.add(80, 'seconds')
        });
        const newScrobble3 = generatePlay({
            playDate: normalizedWithMixedDur[normalizedWithMixedDur.length - 3].data.playDate.add(160, 'seconds')
        });

        testScrobbler.scrobbleDelay = 600;

        testScrobbler.queueScrobble([newScrobble1, newScrobble2, newScrobble3], 'test');
        await pEvent(testScrobbler.emitter, 'scrobble');
        const initial = dayjs();
        await pEvent(testScrobbler.emitter, 'scrobble');
        await pEvent(testScrobbler.emitter, 'scrobble');

        const end = dayjs();

        // roughly...
        assert.closeTo(end.diff(initial, 'ms'), 1200, 200);
    });

    after(async function () {
       this.timeout(3500);
       await testScrobbler.tryStopScrobbling()
    });
});
