import chai, { assert, expect } from 'chai';
import {spy} from 'sinon';
import asPromised from 'chai-as-promised';
import clone from 'clone';
import dayjs from "dayjs";
import { after, before, describe, it } from 'mocha';
import { http, HttpResponse } from 'msw';
import pEvent from 'p-event';
import { PlayObject } from "../../../core/Atomic.js";
import { genGroupIdStr, sleep, sortByOldestPlayDate } from "../../utils.js";
import mixedDuration from '../plays/mixedDuration.json' with { type: 'json' };
import withDuration from '../plays/withDuration.json' with { type: 'json' };
import { MockNetworkError, withRequestInterception } from "../utils/networking.js";
import { asPlays, generatePlay, generatePlayPlatformId, generatePlays, generateSourcePlayerObj, normalizePlays } from "../utils/PlayTestUtils.js";
import MockDate from 'mockdate';

import { NowPlayingScrobbler, TestAuthScrobbler, TestScrobbler } from "./TestScrobbler.js";
import { PaginatedTimeRangeOptions, PlayPlatformId, REFRESH_STALE_DEFAULT } from '../../common/infrastructure/Atomic.js';
import { defaultLifecycle } from '../../utils/PlayTransformUtils.js';
import { shuffleArray } from '../../utils/DataUtils.js';
import { DEFAULT_GROUP_DURATION, groupPlaysToTimeRanges } from '../../utils/ListenFetchUtils.js';

chai.use(asPromised);

const firstPlayDate = dayjs().subtract(1, 'hour');
const olderFirstPlayDate = dayjs().subtract(4, 'hour');

const withDurPlays = asPlays(withDuration);
const mixedDurPlays = asPlays(mixedDuration);
const normalizedWithDur = normalizePlays(withDurPlays, {initialDate: firstPlayDate});
const normalizedWithMixedDur = normalizePlays(mixedDurPlays, {initialDate: firstPlayDate});

const normalizedWithMixedDurOlder = normalizePlays(mixedDurPlays, {initialDate: olderFirstPlayDate});

const generateTestScrobbler = () => {
    const testScrobbler = new TestScrobbler();
    testScrobbler.verboseOptions = {
        match: {
            onMatch: true,
            onNoMatch: true,
            confidenceBreakdown: true
        }
    };
    return testScrobbler;
}

let testScrobbler: TestScrobbler = generateTestScrobbler()

describe('Networking', function () {

    describe('Authentication', function () {
        it('Should set as authenticated if doAuthentication does not throw and returns true',
            withRequestInterception(
                [
                    http.get('http://example.com', () => {
                            // https://github.com/mswjs/msw/issues/1819#issuecomment-1789364174
                            // already using DOM though, not sure why it doesn't fix itself
                            return new HttpResponse(null, {status: 200});
                        }
                    )
                ],
                async function() {
                    const authScrobbler = new TestAuthScrobbler();
                    await authScrobbler.testAuth();
                    assert.isFalse(authScrobbler.authGated());
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
                    const authScrobbler = new TestAuthScrobbler();
                    try {
                        await authScrobbler.testAuth();
                    } catch (e) {

                    }
                    assert.isTrue(authScrobbler.authGated());
                    assert.isFalse(authScrobbler.authFailure);
                }
            ));

        it('Should set as unauthenticated with no possibility to retry if error is not network related',
            withRequestInterception(
                [
                    http.get('http://example.com', () => {
                            return HttpResponse.json({error: 'Invalid API Key'}, {status: 401});
                        }
                    )
                ],
                async function() {
                    const authScrobbler = new TestAuthScrobbler();
                    try {
                        await authScrobbler.testAuth();
                    } catch (e) {

                    }
                    assert.isTrue(authScrobbler.authGated());
                    assert.isTrue(authScrobbler.authFailure);
                }
            ));
    });
});

describe('Detects duplicate and unique scrobbles from client recent history', function () {

    describe('When scrobble is unique', function () {

        beforeEach(function() {
            testScrobbler = generateTestScrobbler();
        });

        it('It is not detected as duplicate when play date is newer than most recent', async function () {

            testScrobbler.testRecentScrobbles = normalizedWithMixedDur;

            const newScrobble = generatePlay({
                playDate: normalizedWithMixedDur[normalizedWithMixedDur.length - 1].data.playDate.add(70, 'seconds')
            });

            assert.isFalse((await testScrobbler.alreadyScrobbled(newScrobble))[0]);
            return;
        });

        it('It is not detected as duplicate when play date is close to an existing scrobble', async function () {

            testScrobbler.testRecentScrobbles = normalizedWithMixedDur;

            const newScrobble = generatePlay({
                playDate: normalizedWithMixedDur[normalizedWithMixedDur.length - 3].data.playDate.add(3, 'seconds')
            });

            assert.isFalse((await testScrobbler.alreadyScrobbled(newScrobble))[0]);
        });

        it('It handles unique detection when no existing scrobble matches above a score of 0', async function () {

            testScrobbler.testRecentScrobbles = normalizedWithMixedDur;

                const uniquePlay = generatePlay({
                    artists: [
                        "２８１４"
                    ],
                    track: "新宿ゴールデン街",
                    duration: 130,
                    playDate: normalizedWithMixedDur[normalizedWithMixedDur.length - 3].data.playDate.add(6, 'minutes')
                });

                await assert.isFulfilled( testScrobbler.alreadyScrobbled(uniquePlay))
                assert.isFalse((await testScrobbler.alreadyScrobbled(uniquePlay))[0])
        });
    });

    describe('When scrobble track/artist/album matches existing but is a new scrobble', function () {

        beforeEach(function() {
            testScrobbler = generateTestScrobbler();
        });

        it('Is not detected as duplicate when artist is same, time is similar, but track is different', async function () {

            testScrobbler.testRecentScrobbles = normalizedWithMixedDur;

            const diffPlay = clone(normalizedWithMixedDur[1]);
            diffPlay.data.playDate = diffPlay.data.playDate.add(9, 's');
            diffPlay.data.track = 'A Totally Different Track'

            assert.isFalse((await testScrobbler.alreadyScrobbled(diffPlay))[0]);
        });

        it('Is not detected as duplicate when track is same, time is similar, but artist is different', async function () {

            testScrobbler.testRecentScrobbles = normalizedWithMixedDur;

            const diffPlay = clone(normalizedWithMixedDur[1]);
            diffPlay.data.playDate = diffPlay.data.playDate.add(9, 's');
            diffPlay.data.artists = ['A Different Artist'];

            assert.isFalse((await testScrobbler.alreadyScrobbled(diffPlay))[0]);
        });


        it('Is not detected as duplicate when play date is different by more than 10 seconds (high granularity source)', async function () {

            testScrobbler.testRecentScrobbles = normalizedWithMixedDur;

            const timeOffPos = clone(normalizedWithMixedDur[normalizedWithMixedDur.length - 1]);
            timeOffPos.data.playDate = timeOffPos.data.playDate.add(11, 's');

            const timeOffNeg = clone(normalizedWithMixedDur[normalizedWithMixedDur.length - 1]);
            timeOffNeg.data.playDate = timeOffNeg.data.playDate.subtract(11, 's');

            assert.isFalse((await testScrobbler.alreadyScrobbled(timeOffPos))[0]);
            assert.isFalse((await testScrobbler.alreadyScrobbled(timeOffNeg))[0]);
        });

        it('Is not detected as duplicate when play date is different by more than 60 seconds (low granularity source)', async function () {

            const recent = normalizePlays(mixedDurPlays, {
                initialDate: firstPlayDate,
                defaultMeta: {source: 'subsonic'}
            });
            testScrobbler.testRecentScrobbles = recent;

            const timeOffPos = clone(recent[recent.length - 1]);
            timeOffPos.data.playDate = timeOffPos.data.playDate.add(61, 's');

            const timeOffNeg = clone(recent[recent.length - 1]);
            timeOffNeg.data.playDate = timeOffNeg.data.playDate.subtract(61, 's');

            assert.isFalse((await testScrobbler.alreadyScrobbled(timeOffPos))[0]);
            assert.isFalse((await testScrobbler.alreadyScrobbled(timeOffNeg))[0]);
        });

        describe('When existing has duration', function () {

            beforeEach(function() {
                testScrobbler = generateTestScrobbler();
            });

            it('A track with continuity to the previous track is not detected as a duplicate', async function () {

                testScrobbler.testRecentScrobbles = normalizedWithDur;

                const brickPt1 = normalizedWithDur.find(x => x.data.track.includes('Another Brick'));
                const brickPt2 = clone(brickPt1);
                brickPt2.data.track = 'Another Brick in the Wall, Pt. 2';
                brickPt2.data.playDate = brickPt1.data.playDate.add(brickPt1.data.duration + 1, 'seconds');
                assert.isFalse((await testScrobbler.alreadyScrobbled(brickPt2))[0]);

                const story1 = normalizedWithDur.find(x => x.data.track.includes('Da Art of'));
                const story2 = clone(story1);
                story2.data.track = `Da Art of Storytellin' (Pt. 2)`;
                story2.data.playDate = story2.data.playDate.add(story1.data.duration + 1, 'seconds');

                assert.isFalse((await testScrobbler.alreadyScrobbled(story2))[0]);

                const ballad1 = normalizedWithDur.find(x => x.data.track.includes('Ballade No. 1'));
                const ballad2 = clone(ballad1);
                ballad2.data.track = `Ballade No. 2 in G Minor, Op. 27`;
                ballad2.data.playDate = ballad2.data.playDate.add(ballad1.data.duration + 1, 'seconds');

                assert.isFalse((await testScrobbler.alreadyScrobbled(ballad2))[0]);
            });

            it('Is not detected as duplicate when play date matches fuzzy but play is marked as repeat', async function () {

                const recent = normalizePlays(normalizedWithDur, {
                    initialDate: firstPlayDate,
                    defaultMeta: {source: 'jellyfin'}
                });
                testScrobbler.testRecentScrobbles = recent;

                const repeatPlay = clone(recent[recent.length - 1]);
                repeatPlay.data.playDate = repeatPlay.data.playDate.add(repeatPlay.data.duration + 2, 's');

                assert.isTrue((await testScrobbler.alreadyScrobbled(repeatPlay))[0]);

                repeatPlay.data.repeat = true;
                assert.isFalse((await testScrobbler.alreadyScrobbled(repeatPlay))[0]);
            });
        });

    });

    describe('When scrobble is a duplicate (title/artists/album)', function () {

        beforeEach(function() {
            testScrobbler = generateTestScrobbler();
        });

        it('Is detected as duplicate when an exact match', async function () {
            testScrobbler.testRecentScrobbles = normalizedWithMixedDur;
            assert.isTrue((await testScrobbler.alreadyScrobbled(normalizedWithMixedDur[normalizedWithMixedDur.length - 1]))[0]);
        });

        it('Is detected as duplicate when artist/title differences are whitespace or case', async function () {
            testScrobbler.testRecentScrobbles = normalizedWithMixedDur;
            const ref = normalizedWithMixedDur[3];

            const diffPlay = clone(ref);
            diffPlay.data.playDate = diffPlay.data.playDate.add(9, 's');


            diffPlay.data.track = ref.data.track.toUpperCase();
            assert.isTrue((await testScrobbler.alreadyScrobbled(diffPlay))[0]);

            diffPlay.data.track = `  ${ref.data.track} `;
            assert.isTrue((await testScrobbler.alreadyScrobbled(diffPlay))[0]);

            diffPlay.data.track = ref.data.track.replaceAll(' ', '   ');
            assert.isTrue((await testScrobbler.alreadyScrobbled(diffPlay))[0]);

            diffPlay.data.artists = ref.data.artists.map(x => x.toUpperCase());
            assert.isTrue((await testScrobbler.alreadyScrobbled(diffPlay))[0]);

            diffPlay.data.artists = ref.data.artists.map(x => x.replaceAll(' ', '   '));
            assert.isTrue((await testScrobbler.alreadyScrobbled(diffPlay))[0]);
        });

        it('Is detected as duplicate when artist/title differences are from unicode normalization', async function () {
            testScrobbler.testRecentScrobbles = normalizedWithMixedDur;
            const ref = normalizedWithMixedDur.find(x => x.data.track === 'Jimbó');

            const diffPlay = clone(ref);
            diffPlay.data.playDate = diffPlay.data.playDate.add(9, 's');
            diffPlay.data.track = 'Jimbo';
            assert.isTrue((await testScrobbler.alreadyScrobbled(diffPlay))[0]);
        });

        it('Is detected as duplicate when play date is off by 10 seconds or less (high granularity source)', async function () {

            testScrobbler.testRecentScrobbles = normalizedWithMixedDur;

            const timeOffPos = clone(normalizedWithMixedDur[normalizedWithMixedDur.length - 1]);
            timeOffPos.data.playDate = timeOffPos.data.playDate.add(10, 's');

            const timeOffNeg = clone(normalizedWithMixedDur[normalizedWithMixedDur.length - 1]);
            timeOffNeg.data.playDate = timeOffNeg.data.playDate.subtract(10, 's');

            assert.isTrue((await testScrobbler.alreadyScrobbled(timeOffPos))[0]);
            assert.isTrue((await testScrobbler.alreadyScrobbled(timeOffNeg))[0]);

            // 10 seconds fuzzy diff inclusive
            const son = normalizedWithMixedDurOlder.find(x => x.data.track === 'Sonora')
            son.data.playDate = dayjs().subtract(1, 'hour').set('minute', 26).set('second', 20);
            son.data.duration = 267;
            son.data.listenedFor = undefined;
            testScrobbler.testRecentScrobbles = normalizedWithMixedDurOlder.concat(son);

            const offSon = clone(son);
            offSon.data.playDate = dayjs().subtract(1, 'hour').set('minute', 30).set('second', 37);
            assert.isTrue((await testScrobbler.alreadyScrobbled(offSon))[0]);
        });

        it('Is detected as duplicate when play date is off by less than 60 seconds (low granularity source)', async function () {

            const recent = normalizePlays(mixedDurPlays, {
                initialDate: firstPlayDate,
                defaultMeta: {source: 'subsonic'}
            });
            testScrobbler.testRecentScrobbles = recent;

            const timeOffPos = clone(recent[recent.length - 1]);
            timeOffPos.data.playDate = timeOffPos.data.playDate.add(59, 's');

            const timeOffNeg = clone(recent[recent.length - 1]);
            timeOffNeg.data.playDate = timeOffNeg.data.playDate.subtract(59, 's');

            assert.isTrue((await testScrobbler.alreadyScrobbled(timeOffPos))[0]);
            assert.isTrue((await testScrobbler.alreadyScrobbled(timeOffNeg))[0]);
        });

        it('Is detected as duplicate when title is exact, artist is similar, and time is similar', async function () {
            testScrobbler.testRecentScrobbles = normalizedWithMixedDur;
            const ref = normalizedWithMixedDur[3];

            const diffPlay = clone(ref);
            diffPlay.data.playDate = diffPlay.data.playDate.add(3, 's');
            diffPlay.data.artists = [diffPlay.data.artists[0]]
            assert.isTrue((await testScrobbler.alreadyScrobbled(diffPlay))[0]);

            diffPlay.data.artists = [ref.data.artists[1]]
            assert.isTrue((await testScrobbler.alreadyScrobbled(diffPlay))[0]);


            const son = normalizedWithMixedDur.find(x => x.data.track === 'Sonora')

            const sonDiffPlay = clone(son);
            sonDiffPlay.data.playDate = sonDiffPlay.data.playDate.subtract(son.data.duration + 1, 's');
            assert.isTrue((await testScrobbler.alreadyScrobbled(sonDiffPlay))[0]);
        });

        it('Is detected as duplicate when artists are included in joiner', async function () {
            const ref = normalizedWithMixedDurOlder.find(x => x.data.track === 'Freeze Tag');
            ref.data.playDate = dayjs().subtract(1, 'hour').set('minute', 29).set('second', 26)

            const spotifyPlay: PlayObject = {
                data: {
                    artists: [
                        "Terrace Martin",
                        "Robert Glasper",
                        "9th Wonder",
                        "Kamasi Washington",
                        "Dinner Party",
                        "Cordae",
                        "Phoelix"
                    ],
                    album: "Dinner Party: Dessert",
                    track: "Freeze Tag (feat. Cordae & Phoelix)",
                    "duration": 191.375,
                    "playDate": dayjs().subtract(1, 'hour').set('minute', 29).set('second', 27)
                },
                meta: {
                    source: 'Spotify',
                    lifecycle: defaultLifecycle()
                }
            }

            testScrobbler.testRecentScrobbles = normalizedWithMixedDurOlder.concat(ref);

            assert.isTrue((await testScrobbler.alreadyScrobbled(spotifyPlay))[0]);
        });

        describe('When at least one play has duration', function () {

            beforeEach(function() {
                testScrobbler = generateTestScrobbler();
            });

            it('Is detected as duplicate when play date is close to the end of an existing scrobble', async function () {

                testScrobbler.testRecentScrobbles = normalizedWithDur;

                const timeEnd = clone(normalizedWithDur[normalizedWithMixedDur.length - 2]);
                timeEnd.data.playDate = timeEnd.data.playDate.add(timeEnd.data.duration, 's');

                assert.isTrue((await testScrobbler.alreadyScrobbled(timeEnd))[0]);

                // only one has duration
                timeEnd.data.duration = undefined;

                assert.isTrue((await testScrobbler.alreadyScrobbled(timeEnd))[0]);

                // only one has duration
                timeEnd.data.duration = undefined;

                assert.isTrue((await testScrobbler.alreadyScrobbled(timeEnd))[0]);
            });

        });
    });
});

describe('Detects duplicate and unique scrobbles using actively tracked scrobbles', function() {

    beforeEach(function() {
        testScrobbler = generateTestScrobbler();
        testScrobbler.testRecentScrobbles = normalizedWithMixedDur;
    });

    it('Detects a unique play', async function() {
        const newScrobble = generatePlay({
            playDate: normalizedWithMixedDur[normalizedWithMixedDur.length - 3].data.playDate.add(3, 'seconds')
        });

        const [matchedPlay, matchedData] = await testScrobbler.findExistingSubmittedPlayObj(newScrobble);

        assert.isUndefined(matchedPlay);
        assert.isEmpty(matchedData);
    });

    it('Detects an exact duplicate', async function() {
        const newScrobble = generatePlay({
            playDate: normalizedWithMixedDur[normalizedWithMixedDur.length - 3].data.playDate.add(3, 'seconds')
        });
        testScrobbler.addScrobbledTrack(newScrobble, newScrobble);

        const [matchedPlay, matchedData] = await testScrobbler.findExistingSubmittedPlayObj(newScrobble);

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

        const [matchedPlay, matchedData] = await testScrobbler.findExistingSubmittedPlayObj(dupScrobble);

        assert.isDefined(matchedPlay);
        assert.isNotEmpty(matchedData);
    });
});

describe('Upstream Scrobbles', function() {

    afterEach(function () {
        MockDate.reset();
    });

    it('Calls timerange func to get SOT scrobbles when none exists', async function() {
        const existingPlays = normalizePlays(generatePlays(3), {initialDate: dayjs().subtract(1, 'hour')});
        const scrobbler = generateTestScrobbler();
        scrobbler.testRecentScrobbles = existingPlays;
        await scrobbler.tryInitialize();

        const sp = spy(scrobbler, 'getScrobblesForTimeRange');

        const play = generatePlay({playDate: dayjs().subtract(60, 's')});
        await scrobbler.queueScrobble(play, 'test');
        const emptied = pEvent(scrobbler.emitter, 'queueEmptied');
        scrobbler.startScrobbling().then(() => null);
        await emptied;
        scrobbler.tryStopScrobbling().then(() => null);
        expect(sp.called).is.true;
    });

    it('Uses cached timerange for closely grouped scrobbles', async function() {
        const existingPlays = normalizePlays(generatePlays(3), {initialDate: dayjs().subtract(1, 'hour')});
        const scrobbler = generateTestScrobbler();
        scrobbler.testRecentScrobbles = existingPlays;
        await scrobbler.tryInitialize();

        const sp = spy(scrobbler, 'getScrobblesForTimeRange');

        const play1 = generatePlay({playDate: dayjs().subtract(3, 'm')});
        const play2 = generatePlay({playDate: dayjs().subtract(1, 'm')});
        await scrobbler.queueScrobble([play1, play2], 'test');
        const emptied = pEvent(scrobbler.emitter, 'queueEmptied');
        scrobbler.startScrobbling().then(() => null);
        await emptied;
        scrobbler.tryStopScrobbling().then(() => null);
        expect(sp.calledOnce).is.true;
    });

    it('Uses separate timerange calls when scrobbles are not closely grouped', async function() {
        const existingPlays = normalizePlays(generatePlays(3), {initialDate: dayjs().subtract(1, 'hour')});
        const scrobbler = generateTestScrobbler();
        scrobbler.testRecentScrobbles = existingPlays;
        await scrobbler.tryInitialize();

        const sp = spy(scrobbler, 'getScrobblesForTimeRange');

        const play1 = generatePlay({playDate: dayjs().subtract(3, 'm')});
        const play2 = generatePlay({playDate: dayjs().subtract(1, 'm')});
        const play3 = generatePlay({playDate: dayjs().subtract(DEFAULT_GROUP_DURATION.add(4, 'm'))});
        await scrobbler.queueScrobble([play1, play2, play3], 'test');
        const emptied = pEvent(scrobbler.emitter, 'queueEmptied');
        scrobbler.startScrobbling().then(() => null);
        await emptied;
        scrobbler.tryStopScrobbling().then(() => null);
        expect(sp.calledTwice).is.true;
    });

    it('Gets fresh timerange if TTL of staleAfter has passed', async function() {
        const existingPlays = normalizePlays(generatePlays(3), {initialDate: dayjs().subtract(1, 'hour')});
        const scrobbler = generateTestScrobbler();
        scrobbler.testRecentScrobbles = existingPlays;
        await scrobbler.tryInitialize();

        const sp = spy(scrobbler, 'getScrobblesForTimeRange');

        const play1 = generatePlay({playDate: dayjs().subtract(3, 'm')});
        const play2 = generatePlay({playDate: dayjs().subtract(1, 'm')});
        await scrobbler.queueScrobble([play1], 'test');
        const emptied = pEvent(scrobbler.emitter, 'queueEmptied');
        scrobbler.startScrobbling().then(() => null);
        await emptied;
        expect(sp.calledOnce).is.true;

        MockDate.set(dayjs().add(REFRESH_STALE_DEFAULT + 1, 's').toDate());
        const emptied2 = pEvent(scrobbler.emitter, 'queueEmptied');
        await scrobbler.queueScrobble([play2], 'test');
        await emptied2;
        scrobbler.tryStopScrobbling().then(() => null);
        expect(sp.calledTwice).is.true;
    });

});



describe('Scrobble client uses transform plays correctly', function() {

    beforeEach(async function() {
        testScrobbler = generateTestScrobbler();
        await testScrobbler.initialize();
        testScrobbler.testRecentScrobbles = normalizedWithMixedDur;
        testScrobbler.scrobbleSleep = 500;
        testScrobbler.scrobbleDelay = 0;
        //testScrobbler.lastScrobbleCheck = dayjs().subtract(60, 'seconds');
        testScrobbler.config.options = {};
        //testScrobbler.initScrobbleMonitoring().catch(console.error);
    });

    // TODO need to find a better way to detect this
    // since we are now doing it in the processing loop instead of before queue
    
    // it('Transforms play before queue when preCompare is present', async function() {
    //     testScrobbler.config.options = {
    //         playTransform: {
    //             preCompare: {
    //                 title: [
    //                     'cool'
    //                 ]
    //             }
    //         }
    //     }
    //     testScrobbler.buildTransformRules();
    //     const newScrobble = generatePlay({
    //         track: 'my cool track'
    //     });
    //     testScrobbler.queueScrobble(newScrobble, 'test');
    //     expect(testScrobbler.queuedScrobbles[0].play.data.track).is.eq('my  track');
    // });

    it('Transforms play on scrobble when postCompare is present', async function() {
        testScrobbler.config.options = {
            playTransform: {
                postCompare: {
                    title: [
                        'cool'
                    ]
                }
            }
        }
        testScrobbler.buildTransformRules();
        const newScrobble = generatePlay({
            track: 'my cool track'
        });
        await testScrobbler.queueScrobble(newScrobble, 'test');
        expect(testScrobbler.queuedScrobbles[0].play.data.track).is.eq('my cool track');
        testScrobbler.scrobbleSleep = 100;
        testScrobbler.initScrobbleMonitoring().catch(console.error);

        const e = (await pEvent(testScrobbler.emitter, 'scrobble')) as {data: {play: PlayObject }};
        expect(e.data.play.data.track).is.eq('my  track');
    });

    it('Transforms candidate play on comparison', async function() {
        testScrobbler.config.options = {
            playTransform: {
                compare: {
                    candidate: {
                        title: [
                            'hugely cool and very different track'
                        ]
                    }
                }
            }
        }
        const newScrobble = generatePlay({
            track: 'my hugely cool and very different track title'
        });

        testScrobbler.testRecentScrobbles = normalizePlays([newScrobble, ...withDurPlays], {initialDate: firstPlayDate});
        testScrobbler.buildTransformRules();

        expect((await testScrobbler.alreadyScrobbled(newScrobble))[0]).is.false;
    });

    it('Transforms existing play on comparison', async function() {
        testScrobbler.config.options = {
            playTransform: {
                compare: {
                    existing: {
                        title: [
                            'hugely cool and very different track'
                        ]
                    }
                }
            }
        }
        const newScrobble = generatePlay({
            track: 'my hugely cool and very different track title'
        });

        testScrobbler.testRecentScrobbles = normalizePlays([newScrobble, ...withDurPlays], {initialDate: firstPlayDate});
        testScrobbler.buildTransformRules();

        expect((await testScrobbler.alreadyScrobbled(newScrobble))[0]).is.false;
    });

    afterEach(async function () {
        this.timeout(3500);
        await testScrobbler.tryStopScrobbling()
    });

});

describe('Manages scrobble queue', function() {

    beforeEach(async function() {
        testScrobbler = generateTestScrobbler();
        await testScrobbler.initialize();
        testScrobbler.testRecentScrobbles = normalizedWithMixedDur;
        testScrobbler.testRecentScrobbles = normalizedWithMixedDur;
        testScrobbler.scrobbleSleep = 500;
        testScrobbler.scrobbleDelay = 0;
        testScrobbler.initScrobbleMonitoring().catch(console.error);
    });

    it('Scrobbles a uniquely queued play', async function() {
        const newScrobble = generatePlay({
            playDate: normalizedWithMixedDur[normalizedWithMixedDur.length - 3].data.playDate.add(3, 'seconds')
        });
        await testScrobbler.queueScrobble(newScrobble, 'test');
        const res = await Promise.race([pEvent(testScrobbler.emitter, 'scrobble'), sleep(3000)]);

        assert.isDefined(res);
        assert.isDefined(res.data);
    });

    it('Does not Scrobble a duplicate play queued after original is scrobbled', async function() {
        this.timeout(20000);

        const newScrobble = generatePlay({
            playDate: normalizedWithMixedDur[normalizedWithMixedDur.length - 3].data.playDate.add(3, 'seconds')
        });
        const dupScrobble = clone(newScrobble);
        dupScrobble.data.playDate = newScrobble.data.playDate.add(2, 'seconds');

        await testScrobbler.queueScrobble(newScrobble, 'test');
        const res = await Promise.race([pEvent(testScrobbler.emitter, 'scrobble'), sleep(1500)]);

        assert.isDefined(res);
        assert.isDefined(res.data);

        await testScrobbler.queueScrobble(dupScrobble, 'test');
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

        await testScrobbler.queueScrobble(newScrobble, 'test');
        await testScrobbler.queueScrobble(dupScrobble, 'test');
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

        await testScrobbler.queueScrobble([newScrobble1, newScrobble2, newScrobble3], 'test');
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

describe('Now Playing', function() {

    describe('Filtering Aggregated Updates', function() {

           it('When no Now Playing exists, chooses play based on sorted platform id', async function () {

                const npScrobbler = new NowPlayingScrobbler();
                await npScrobbler.initialize();

                const firstPlatform: PlayPlatformId = ['aaa', 'NO_USER'];
                const secondPlatform: PlayPlatformId = ['bbbb', 'NO_USER'];

                const pt = dayjs().subtract(15, 's');

                await npScrobbler.queuePlayingNow(generateSourcePlayerObj({play: generatePlay({playDate: pt}, {deviceId: genGroupIdStr(secondPlatform)})}) , {type: 'spotify', name: 'test'});
                await npScrobbler.queuePlayingNow(generateSourcePlayerObj({play: generatePlay({playDate: pt}, {deviceId: genGroupIdStr(firstPlatform)})}), {type: 'spotify', name: 'test'});

                const toReport = npScrobbler.nowPlayingFilter(npScrobbler.nowPlayingQueue);

                expect(toReport.play.meta.deviceId).eq(genGroupIdStr(firstPlatform));

            });

            it('When Now Playing platform does not exist in queued plays, chooses play based on sorted platform id', async function () {

                const npScrobbler = new NowPlayingScrobbler();
                await npScrobbler.initialize();

                const firstPlatform: PlayPlatformId = ['aaa', 'NO_USER'];
                const secondPlatform: PlayPlatformId = ['bbbb', 'NO_USER'];

                npScrobbler.nowPlayingLastPlay = generateSourcePlayerObj({play: generatePlay({}, {deviceId: genGroupIdStr(generatePlayPlatformId())})});

                const pt = dayjs().subtract(15, 's');

                await npScrobbler.queuePlayingNow(generateSourcePlayerObj({play:generatePlay({playDate: pt}, {deviceId: genGroupIdStr(secondPlatform)})}), {type: 'spotify', name: 'test'});
                await npScrobbler.queuePlayingNow(generateSourcePlayerObj({play:generatePlay({playDate: pt}, {deviceId: genGroupIdStr(firstPlatform)})}), {type: 'spotify', name: 'test'});

                const toReport = npScrobbler.nowPlayingFilter(npScrobbler.nowPlayingQueue);

                expect(toReport.play.meta.deviceId).eq(genGroupIdStr(firstPlatform));

            });

            it('Chooses play based on existing Now Playing', async function () {

                const npScrobbler = new NowPlayingScrobbler();
                await npScrobbler.initialize();

                const firstPlatform: PlayPlatformId = ['aaa', 'NO_USER'];
                const secondPlatform: PlayPlatformId = ['bbbb', 'NO_USER'];

                const pt = dayjs().subtract(15, 's');

                const stickyNp = generateSourcePlayerObj({play: generatePlay({playDate: pt}, {deviceId: genGroupIdStr(secondPlatform)})});

                npScrobbler.nowPlayingLastPlay = stickyNp
            

                await npScrobbler.queuePlayingNow(generateSourcePlayerObj({play:generatePlay({playDate: pt}, {deviceId: genGroupIdStr(firstPlatform)})}), {type: 'spotify', name: 'test'});
                await npScrobbler.queuePlayingNow(stickyNp, {type: 'spotify', name: 'test'});

                const toReport = npScrobbler.nowPlayingFilter(npScrobbler.nowPlayingQueue);

                expect(toReport.play.meta.deviceId).eq(genGroupIdStr(secondPlatform));

            });

             it('Sorts Sources alphabetically when using default Source sorting', async function () {

                const npScrobbler = new NowPlayingScrobbler();
                await npScrobbler.initialize();

                const a = generateSourcePlayerObj({play:generatePlay({}, {deviceId: genGroupIdStr(generatePlayPlatformId())})});
                const b = generateSourcePlayerObj({play:generatePlay({}, {deviceId: genGroupIdStr(generatePlayPlatformId())})});

                await npScrobbler.queuePlayingNow(b, {type: 'jellyfin', name: 'btest'})
                await npScrobbler.queuePlayingNow(a, {type: 'subsonic', name: 'atest'})

                const toReport = npScrobbler.nowPlayingFilter(npScrobbler.nowPlayingQueue);

                expect(toReport.play.meta.deviceId).eq(a.play.meta.deviceId);

            });

            it('Sorts Sources based on user config', async function () {

                const npScrobbler = new NowPlayingScrobbler({name: 'test', options: {nowPlaying: ['btest', 'atest']}});
                await npScrobbler.initialize();

                const a = generateSourcePlayerObj({play:generatePlay({}, {deviceId: genGroupIdStr(generatePlayPlatformId())})});
                const b = generateSourcePlayerObj({play:generatePlay({}, {deviceId: genGroupIdStr(generatePlayPlatformId())})});

                await npScrobbler.queuePlayingNow(a, {type: 'subsonic', name: 'atest'})
                await npScrobbler.queuePlayingNow(b, {type: 'jellyfin', name: 'btest'})

                const toReport = npScrobbler.nowPlayingFilter(npScrobbler.nowPlayingQueue);

                expect(toReport.play.meta.deviceId).eq(b.play.meta.deviceId);

            });

            it('Does not report if source is not in user config', async function () {

                const npScrobbler = new NowPlayingScrobbler({name: 'test', options: {nowPlaying: ['btest', 'atest']}});
                await npScrobbler.initialize();

                const c = generateSourcePlayerObj({play:generatePlay({}, {deviceId: genGroupIdStr(generatePlayPlatformId())})});

                await npScrobbler.queuePlayingNow(c, {type: 'jellyfin', name: 'ctest'})

                const toReport = npScrobbler.nowPlayingFilter(npScrobbler.nowPlayingQueue);

                expect(toReport).to.be.undefined;

            });
    });

    describe('Updating', function () {

        it('Should update if no existing Now Playing', async function () {

            const npScrobbler = new NowPlayingScrobbler();
            await npScrobbler.initialize();

            const res = npScrobbler.shouldUpdatePlayingNow(generateSourcePlayerObj({play:generatePlay({}, {deviceId: genGroupIdStr(generatePlayPlatformId())})}));
            expect(res).to.be.true;
        });

        it('Should update if previous Now Playing matches updated and last updated diff is greater than upper limit', async function () {

            const npScrobbler = new NowPlayingScrobbler();
            await npScrobbler.initialize();

            const lastUpdate = generateSourcePlayerObj({play:generatePlay({}, {deviceId: genGroupIdStr(generatePlayPlatformId())})});
            npScrobbler.nowPlayingLastUpdated = dayjs().subtract(npScrobbler.nowPlayingMaxThreshold(lastUpdate.play) + 1, 's');
            npScrobbler.nowPlayingLastPlay = lastUpdate;

            const res = npScrobbler.shouldUpdatePlayingNow(lastUpdate);
            expect(res).to.be.true;
        });

         it('Should NOT update if previous Now Playing matches updated and last updated diff is less than upper limit', async function () {

            const npScrobbler = new NowPlayingScrobbler();
            await npScrobbler.initialize();

            const lastUpdate = generateSourcePlayerObj({play:generatePlay({}, {deviceId: genGroupIdStr(generatePlayPlatformId())})});
            npScrobbler.nowPlayingLastUpdated = dayjs().subtract(npScrobbler.nowPlayingMaxThreshold(lastUpdate.play) - 1, 's');
            npScrobbler.nowPlayingLastPlay = lastUpdate;

            const res = npScrobbler.shouldUpdatePlayingNow(lastUpdate);
            expect(res).to.be.false;
        });

        it('Should update if previous Now Playing does NOT match updated and last updated diff is greater than lower limit', async function () {

            const npScrobbler = new NowPlayingScrobbler();
            await npScrobbler.initialize();

            const lastUpdate = generateSourcePlayerObj({play:generatePlay({}, {deviceId: genGroupIdStr(generatePlayPlatformId())})});
            npScrobbler.nowPlayingLastUpdated = dayjs().subtract(npScrobbler.nowPlayingMinThreshold(lastUpdate.play) + 1, 's');
            npScrobbler.nowPlayingLastPlay = lastUpdate;

            const res = npScrobbler.shouldUpdatePlayingNow(generateSourcePlayerObj({play:generatePlay({}, {deviceId: genGroupIdStr(generatePlayPlatformId())})}));
            expect(res).to.be.true;
        });

        it('Should NOT update if previous Now Playing does NOT match updated and last updated diff is less than than lower limit', async function () {

            const npScrobbler = new NowPlayingScrobbler();
            await npScrobbler.initialize();

            const lastUpdate = generateSourcePlayerObj({play:generatePlay({}, {deviceId: genGroupIdStr(generatePlayPlatformId())})});
            npScrobbler.nowPlayingLastUpdated = dayjs().subtract(npScrobbler.nowPlayingMinThreshold(lastUpdate.play) - 1, 's');
            npScrobbler.nowPlayingLastPlay = lastUpdate;

            const res = npScrobbler.shouldUpdatePlayingNow(generateSourcePlayerObj({play:generatePlay({}, {deviceId: genGroupIdStr(generatePlayPlatformId())})}));
            expect(res).to.be.false;
        });

    });

    describe('Scheduling', function () {

        this.afterEach(() => {
            MockDate.reset();
        });

        it('Should update when no existing Now Playing', async function () {

            const npScrobbler = new NowPlayingScrobbler();
            npScrobbler.nowPlayingTaskInterval = 10;
            await npScrobbler.initialize();
            npScrobbler.scheduler.startById('pn_task');

            await npScrobbler.queuePlayingNow(generateSourcePlayerObj({play:generatePlay({}, {deviceId: genGroupIdStr(generatePlayPlatformId())})}), {type: 'jellyfin', name: 'test'});

            const res = await Promise.race([pEvent(npScrobbler.emitter, 'nowPlayingUpdated'), sleep(12)]);

            expect(res).is.not.undefined;
        });

        it('Should update when updated does not match Now Playing', async function () {

            const npScrobbler = new NowPlayingScrobbler();
            npScrobbler.nowPlayingTaskInterval = 10;
            await npScrobbler.initialize();
            npScrobbler.scheduler.startById('pn_task');

            const now = dayjs();

            await npScrobbler.queuePlayingNow(generateSourcePlayerObj({play:generatePlay({}, {deviceId: genGroupIdStr(generatePlayPlatformId())})}), {type: 'jellyfin', name: 'test'});

            const res = await Promise.race([pEvent(npScrobbler.emitter, 'nowPlayingUpdated'), sleep(12)]);

            expect(res).is.not.undefined;

            MockDate.set(now.add(npScrobbler.nowPlayingMinThreshold() + 3, 's').toDate());

            await npScrobbler.queuePlayingNow(generateSourcePlayerObj({play:generatePlay({}, {deviceId: genGroupIdStr(generatePlayPlatformId())})}), {type: 'jellyfin', name: 'test'});

            const resUpdate = await Promise.race([pEvent(npScrobbler.emitter, 'nowPlayingUpdated'), sleep(12)]);

            expect(resUpdate).is.not.undefined;
        });

    });

});

describe('Scrobble Temporal Grouping', function () {

    it('Groups into separate groups when not within duration', function() {
        const plays1 = normalizePlays(generatePlays(3), {initialDate: dayjs().subtract(1, 'hour')});
        plays1.sort(sortByOldestPlayDate);
        const oldest1 = plays1[0].data.playDate.unix();
        const newest1 = plays1[plays1.length - 1].data.playDate.unix();

        const plays2 = normalizePlays(generatePlays(3), {initialDate: dayjs().subtract(2, 'hour')});
        plays2.sort(sortByOldestPlayDate);
        const oldest2 = plays2[0].data.playDate.unix();
        const newest2 = plays2[plays2.length - 1].data.playDate.unix();

        const plays = [...plays1, ...plays2];
        shuffleArray(plays);

        const ranges = groupPlaysToTimeRanges(plays, []);
        expect(ranges.length).eq(2);
        expect(ranges.some(x => x.from < oldest1 && x.to > newest1)).is.true;
        expect(ranges.some(x => x.from < oldest2 && x.to > newest2)).is.true;
    });

    it('Groups into existing time range', function() {
        const plays1 = normalizePlays(generatePlays(3), {initialDate: dayjs().subtract(1, 'hour')});
        plays1.sort(sortByOldestPlayDate);
        const oldest1 = plays1[0].data.playDate;
        const newest1 = plays1[plays1.length - 1].data.playDate;

        const plays2 = normalizePlays(generatePlays(3), {initialDate: dayjs().subtract(2, 'hour')});
        plays2.sort(sortByOldestPlayDate);
        const oldest2 = plays2[0].data.playDate;
        const newest2 = plays2[plays2.length - 1].data.playDate;

        const plays = [...plays1, ...plays2];
        shuffleArray(plays);

        const existing: PaginatedTimeRangeOptions = {from: oldest1.subtract(10, 's').unix(), to: newest1.add(10, 's').unix()};

        const ranges = groupPlaysToTimeRanges(plays, [existing]);
        expect(ranges.length).eq(2);
        expect(ranges.some(x => x.from < oldest1.unix() && x.to > newest1.unix())).is.true;
        expect(ranges.some(x => x.from < oldest2.unix() && x.to > newest2.unix())).is.true;
        expect(ranges.some(x => x.to === existing.to && x.from && existing.from));
    });
})