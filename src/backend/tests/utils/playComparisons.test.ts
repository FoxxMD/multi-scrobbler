import { assert, expect } from 'chai';
import clone from "clone";
import dayjs from "dayjs";
import { describe, it } from 'mocha';
import { existingScrobble, genericSourcePlayMatch, playsAreAddedOnly, playsAreBumpedOnly, playsAreSortConsistent } from "../../utils/PlayComparisonUtils.ts";
import { generatePlay, generatePlays } from "../../../core/tests/utils/PlayTestUtils.ts";
import { artistNamesToCredits } from "../../../core/StringUtils.ts";
import type {PlayObject} from "../../../core/Atomic.ts";

const newPlay = generatePlay();

const existingList = generatePlays(10);

describe('Compare lists by order', function () {

    describe('Identity', function () {
        it('Identical lists are equal', function () {
            const identicalList = [...existingList.map(x => clone(x))];
            assert.isTrue(playsAreSortConsistent(existingList, identicalList));
        });

        it('Non-identical lists are not equal', function () {
            assert.isFalse(playsAreSortConsistent(existingList, generatePlays(11)));
        });

        it('Non-identical lists with modifications are not equal', function () {
            const modified = [...existingList.map(x => clone(x))];
            modified.splice(2, 1, generatePlay());
            modified[6].data.track = 'A CHANGE';
            modified.splice(8, 0, generatePlay());
            const modded = [...modified, generatePlay()];
            assert.isFalse(playsAreSortConsistent(existingList, modded));
        });
    });

    describe('Non-identical lists', function() {
        let candidateList: PlayObject[];

        before(function() {
            candidateList = generatePlays(10);
        });

        it('are not add only', function () {
            const [ok, diff, addType] = playsAreAddedOnly(existingList, candidateList)
            assert.isFalse(ok);
        });

        it('are not bump only', function () {
            const [ok, diff, addType] = playsAreAddedOnly(existingList, candidateList)
            assert.isFalse(ok);
        });
    });

    describe('Lists with only prepended additions', function() {
        let candidateList: PlayObject[];

        before(function() {
            candidateList = [generatePlay(), generatePlay(), ...existingList];
        });

        it('are add only', function () {
            const [ok, diff, addType] = playsAreAddedOnly(existingList, candidateList)
            assert.isTrue(ok);
            assert.equal(addType, 'prepend');
        });

        it('are not bump only', function () {
            const [ok, diff, addType] = playsAreBumpedOnly(existingList, candidateList)
            assert.isFalse(ok);
        });
    });

    describe('Lists with only appended additions', function() {
        let candidateList: PlayObject[];

        before(function() {
            candidateList = [...existingList, generatePlay(), generatePlay()];
        });

        it('are add only', function () {
            const [ok, diff, addType] = playsAreAddedOnly(existingList, candidateList)
            assert.isTrue(ok);
            assert.equal(addType, 'append');
        });

        it('are not bump only', function () {
            const [ok, diff, addType] = playsAreBumpedOnly(existingList, candidateList)
            assert.isFalse(ok);
        });
    
    });

    describe('Lists of fixed length with prepends', function() {
        let candidateList: PlayObject[];

        before(function() {
            candidateList = [generatePlay(), generatePlay(), ...existingList].slice(0, 9);
        });

        it('are add only', function () {
            const [ok, diff, addType] = playsAreAddedOnly(existingList, candidateList)
            assert.isTrue(ok);
            assert.equal(addType, 'prepend');
        });

        it('are not bump only', function () {
            const [ok, diff, addType] = playsAreBumpedOnly(existingList, candidateList)
            assert.isFalse(ok);
        });
    });


    describe('Lists with inserts', function() {
        let candidateList: PlayObject[],
        candidateList2: PlayObject[];

        before(function() {
            candidateList = [...existingList.map(x => clone(x))];
            candidateList.splice(4, 0, generatePlay())

            candidateList2 = [...existingList.map(x => clone(x))];
            candidateList2.splice(2, 0, generatePlay())
            candidateList2.splice(6, 0, generatePlay())
        });

        it('are not add only', function () {
            const [ok, diff, addType] = playsAreAddedOnly(existingList, candidateList)
            assert.isFalse(ok)

            const [ok2, diff2, addType2] = playsAreAddedOnly(existingList, candidateList2)
            assert.isFalse(ok2)
        });

        it('are not bump only', function () {
            const [ok, diff, addType] = playsAreBumpedOnly(existingList, candidateList)
            assert.isFalse(ok)

            const [ok2, diff2, addType2] = playsAreBumpedOnly(existingList, candidateList2)
            assert.isFalse(ok2)
        });
    
    });

    describe('Lists with inserts and prepends', function() {
        let candidateList: PlayObject[];

        before(function() {
            candidateList = [...existingList.map(x => clone(x))];
            candidateList.splice(2, 0, generatePlay())
            candidateList.splice(6, 0, generatePlay())
            candidateList = [generatePlay(), generatePlay(), ...candidateList]
        });

        it('are not add only', function () {
            const [ok, diff, addType] = playsAreAddedOnly(existingList, candidateList)
            assert.isFalse(ok);
        });

        it('are not bump only', function () {
            const [ok, diff, addType] = playsAreBumpedOnly(existingList, candidateList)
            assert.isFalse(ok);
        });
    
    });

    describe('Lists with inserts and appends', function() {
        let candidateList: PlayObject[];

        before(function() {
            candidateList = [...existingList.map(x => clone(x))];
            candidateList.splice(2, 0, generatePlay())
            candidateList.splice(6, 0, generatePlay())
            candidateList = [...candidateList, generatePlay(), generatePlay()]
        });

        it('are not add only', function () {
            const [ok, diff, addType] = playsAreAddedOnly(existingList, candidateList)
            assert.isFalse(ok);
        });

        it('are not bump only', function () {
            const [ok, diff, addType] = playsAreBumpedOnly(existingList, candidateList)
            assert.isFalse(ok);
        });
    });

    describe('Lists with inserts and appends and prepends', function() {
        let candidateList: PlayObject[];

        before(function() {
            candidateList = [...existingList.map(x => clone(x))];
            candidateList = [generatePlay(), generatePlay(), ...candidateList, generatePlay(), generatePlay()]
        });

        it('are not add only', function () {
            const [ok, diff, addType] = playsAreAddedOnly(existingList, candidateList)
            assert.isFalse(ok);
        });

        it('are not bump only', function () {
            const [ok, diff, addType] = playsAreBumpedOnly(existingList, candidateList)
            assert.isFalse(ok);
        });
    });

    describe('Lists with plays bumped-by-prepend', function() {
        let candidateList: PlayObject[];

        before(function() {
            candidateList = [...existingList.map(x => clone(x))];
            const bumped = candidateList[6];
            candidateList.splice(6, 1);
            candidateList.unshift(bumped);
        });

        it('are not add only', function () {
            const [ok, diff, addType] = playsAreAddedOnly(existingList, candidateList);
            assert.isFalse(ok);
        });

        it('are bump only', function () {
            const [ok, diff, addType] = playsAreBumpedOnly(existingList, candidateList);
            assert.isTrue(ok);
            assert.equal(addType, 'prepend');
        });
    
    });

    describe('Lists with plays bumped-by-append', function() {
        let candidateList: PlayObject[];

        before(function() {
            candidateList = [...existingList.map(x => clone(x))];
            const bumped = candidateList[6];
            candidateList.splice(6, 1);
            candidateList.push(bumped);
        });

        it('are not add only', function () {
            const [ok, diff, addType] = playsAreAddedOnly(existingList, candidateList);
            assert.isFalse(ok);
        });

        it('are bump only', function () {
            const [ok, diff, addType] = playsAreBumpedOnly(existingList, candidateList);
            assert.isTrue(ok);
            assert.equal(addType, 'append');
        });
    
    });

    describe('Source Play Comparisons', function() {

        describe('Generic Source Comparison', function() {

            it('matches identical plays', function() {
                expect(genericSourcePlayMatch(newPlay, newPlay)).to.be.true;
            });

            it('matches identical plays with close timestamps', function() {
                const closePlay = clone(newPlay);
                closePlay.data.playDate = closePlay.data.playDate.add(3, 's');
                expect(genericSourcePlayMatch(newPlay, closePlay)).to.be.true;
            });

            it('does not match unique plays', function() {
                expect(genericSourcePlayMatch(newPlay, generatePlay())).to.be.false;
            });

            it('does not match unique plays with exact timestamps', function() {
                const diffPlay = generatePlay();
                diffPlay.data.playDate = newPlay.data.playDate;
                expect(genericSourcePlayMatch(newPlay, diffPlay)).to.be.false;
            });

            it('does not match unique plays with close timestamps', function() {
                const diffPlay = generatePlay();
                diffPlay.data.playDate = newPlay.data.playDate.add(3, 's');
                expect(genericSourcePlayMatch(newPlay, diffPlay)).to.be.false;
            });
        });

        describe('Backlog vs live-tracked duplicate detection', function() {

            // mirrors a real observed duplicate: Spotify backlog reports a single
            // timestamp near the END of a track, while live "Player" tracking
            // records the actual start-to-finish window
            const trackDuration = 244; // 4:04
            const listenedFor = 182; // 3:02 -- tracker stopped short of full duration
            const start = dayjs('2024-01-01T13:18:38.000Z');
            const backlogTimestamp = start.add(223, 's'); // 13:22:21 -- inside duration window, outside listenedFor window, and not within 10s of matching duration exactly (diff from duration is 21s)

            const existingLiveTrackedPlay: PlayObject = generatePlay({
                track: 'Empty Threat',
                artists: artistNamesToCredits(['CHVRCHES']),
                duration: trackDuration,
                playDate: start,
                listenedFor,
                listenRanges: [{ start: { timestamp: clone(start) }, end: { timestamp: start.add(listenedFor, 's') } }]
            });

            const backlogCandidate: PlayObject = generatePlay({
                track: 'Empty Threat',
                artists: artistNamesToCredits(['CHVRCHES']),
                duration: trackDuration,
                playDate: backlogTimestamp
            });
            // backlog candidate: no newFromSource, no listenRanges of its own -- matches how Spotify's
            // history-endpoint plays are actually built (SpotifySource.ts backlog path)

            it('matches a backlog candidate whose timestamp falls within the live-tracked duration window', async function() {
                const res = await existingScrobble(backlogCandidate, [existingLiveTrackedPlay]);
                assert.isTrue(res.match, 'a backlog candidate landing inside the live play\'s duration window should match');
            });

            it('does NOT match the same window when the candidate is itself confirmed live', async function() {
                // guards against swallowing a genuine back-to-back repeat: only a
                // backlog-sourced candidate should get the loosened duration/listenedFor check
                const liveCandidate = clone(backlogCandidate);
                liveCandidate.meta.newFromSource = true;

                const res = await existingScrobble(liveCandidate, [existingLiveTrackedPlay]);
                assert.isFalse(res.match, 'a confirmed-live candidate should not gain the loosened duration/listenedFor match');
            });
        });

    });
});
