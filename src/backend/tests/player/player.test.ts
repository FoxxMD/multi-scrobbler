import { loggerTest } from "@foxxmd/logging";
import { assert, expect } from 'chai';
import clone from "clone";
import dayjs, { Dayjs } from "dayjs";
import { describe, it } from 'mocha';
import {
    CALCULATED_PLAYER_STATUSES,
    NO_DEVICE,
    NO_USER,
    PlayerStateDataMaybePlay,
    REPORTED_PLAYER_STATUSES,
    SINGLE_USER_PLATFORM_ID
} from "../../common/infrastructure/Atomic.js";
import { GenericPlayerState } from "../../sources/PlayerState/GenericPlayerState.js";
import { playObjDataMatch } from "../../utils.js";
import { generatePlay } from "../utils/PlayTestUtils.js";
import { PositionalPlayerState } from "../../sources/PlayerState/PositionalPlayerState.js";
import { ListenProgressPositional } from "../../sources/PlayerState/ListenProgress.js";
import { ListenRangePositional } from "../../sources/PlayerState/ListenRange.js";

const logger = loggerTest;

const newPlay = generatePlay({duration: 300});

const testState = (data: Omit<PlayerStateDataMaybePlay, 'platformId'>): PlayerStateDataMaybePlay => ({...data, platformId: SINGLE_USER_PLATFORM_ID});

class TestPositionalPlayerState extends PositionalPlayerState {
    protected newListenRange(start?: ListenProgressPositional, end?: ListenProgressPositional, options: object = {}): ListenRangePositional {
        const range = super.newListenRange(start, end, {allowedDrift: this.allowedDrift, rtImmediate: false, rtTruth: this.rtTruth, ...options});
        return range;
    }
    public testSessionRepeat(position: number, reportedTS?: Dayjs) {
        return this.isSessionRepeat(position, reportedTS);
    }
}

describe('Basic player state', function () {

    it('Creates new play state when new', function () {
        const player = new GenericPlayerState(logger, [NO_DEVICE, NO_USER]);

        assert.isUndefined(player.currentListenRange);
        assert.isUndefined(player.currentPlay);

        player.update(testState({play: newPlay}));

        assert.isDefined(player.currentListenRange);
        assert.isDefined(player.currentPlay);
    });

    it('Creates new play state in unknown status', function () {
        const player = new GenericPlayerState(logger, [NO_DEVICE, NO_USER]);

        assert.isUndefined(player.currentListenRange);
        assert.isUndefined(player.currentPlay);

        player.update(testState({play: newPlay}));

        assert.isDefined(player.currentListenRange);
        assert.isDefined(player.currentPlay);
        assert.equal(CALCULATED_PLAYER_STATUSES.unknown, player.calculatedStatus);
    });

    it('Creates new play state when incoming play is not the same as stored play', function () {
        const player = new GenericPlayerState(logger, [NO_DEVICE, NO_USER]);

        player.update(testState({play: newPlay}));

        assert.isTrue(playObjDataMatch(player.currentPlay, newPlay));

        const nextPlay = generatePlay({playDate: newPlay.data.playDate.add(2, 'seconds')});
        const [returnedPlay, prevPlay] = player.update(testState({play: nextPlay}));

        assert.isTrue(playObjDataMatch(prevPlay, newPlay));
        assert.isTrue(playObjDataMatch(player.currentPlay, nextPlay));
    });
});

describe('Player status', function () {

    it('New player transitions from unknown to playing on n+1 states', function () {
        const player = new GenericPlayerState(logger, [NO_DEVICE, NO_USER]);

        player.update(testState({play: newPlay}));
        assert.equal(CALCULATED_PLAYER_STATUSES.unknown, player.calculatedStatus);

        player.update(testState({play: newPlay}), dayjs().add(10, 'seconds'));
        assert.equal(CALCULATED_PLAYER_STATUSES.playing, player.calculatedStatus);
    });

    describe('When source provides reported status', function () {

        it('Calculated state is playing when source reports playing', function () {
            const player = new GenericPlayerState(logger, [NO_DEVICE, NO_USER]);

            player.update(testState({play: newPlay, status: REPORTED_PLAYER_STATUSES.playing}));
            player.update(testState({play: newPlay, status: REPORTED_PLAYER_STATUSES.playing}), dayjs().add(10, 'seconds'));
            assert.equal(CALCULATED_PLAYER_STATUSES.playing, player.calculatedStatus);
        });


        it('Calculated state is paused when source reports paused', function () {
            const player = new GenericPlayerState(logger, [NO_DEVICE, NO_USER]);

            player.update(testState({play: newPlay, status: REPORTED_PLAYER_STATUSES.playing}));
            player.update(testState({play: newPlay, status: REPORTED_PLAYER_STATUSES.playing}), dayjs().add(10, 'seconds'));
            player.update(testState({play: newPlay, status: REPORTED_PLAYER_STATUSES.paused}), dayjs().add(20, 'seconds'));
            assert.equal(CALCULATED_PLAYER_STATUSES.paused, player.calculatedStatus);
        });

        it('Calculated state is stopped when source reports stopped', function () {
            const player = new GenericPlayerState(logger, [NO_DEVICE, NO_USER]);

            player.update(testState({play: newPlay, status: REPORTED_PLAYER_STATUSES.playing}));
            player.update(testState({play: newPlay, status: REPORTED_PLAYER_STATUSES.playing}), dayjs().add(10, 'seconds'));
            player.update(testState({play: newPlay, status: REPORTED_PLAYER_STATUSES.stopped}), dayjs().add(20, 'seconds'));
            assert.equal(CALCULATED_PLAYER_STATUSES.stopped, player.calculatedStatus);
        });

    });

    describe('When source provides playback position', function () {

        it('Calculated state is playing when position moves forward', function () {
            const player = new TestPositionalPlayerState(logger, [NO_DEVICE, NO_USER]);

            const positioned = clone(newPlay);

            player.update(testState({play: positioned, position: 3}));

            player.currentListenRange.rtPlayer.setPosition(13000);
            player.update(testState({play: positioned, position: 13}), dayjs().add(10, 'seconds'));

            assert.equal(CALCULATED_PLAYER_STATUSES.playing, player.calculatedStatus);
        });

        it('Calculated state is paused when position does not change and rt overdrifts', function () {
            const player = new TestPositionalPlayerState(logger, [NO_DEVICE, NO_USER]);

            const positioned = clone(newPlay);
            positioned.meta.trackProgressPosition = 3;

            player.update(testState({play: positioned, position: 3}));

            player.currentListenRange.rtPlayer.setPosition(13000);
            player.update(testState({play: positioned, position: 13}), dayjs().add(10, 'seconds'));

            player.currentListenRange.rtPlayer.setPosition(23000);
            player.update(testState({play: positioned, position: 13}), dayjs().add(20, 'seconds'));

            assert.equal(CALCULATED_PLAYER_STATUSES.paused, player.calculatedStatus);
        });

        it('Uses last known position for final range when cleaning up stale player', function () {
            const player = new TestPositionalPlayerState(logger, [NO_DEVICE, NO_USER], {staleInterval: 20, rtTruth: true});

            const positioned = clone(newPlay);
            positioned.meta.trackProgressPosition = 3;

            player.update(testState({play: positioned, position: 3}));

            player.currentListenRange.rtPlayer.setPosition(13000);
            player.update(testState({play: positioned, position: 13}), dayjs().add(10, 'seconds'));

            player.currentListenRange.rtPlayer.setPosition(23000);
            player.update(testState({play: positioned, position: 23}), dayjs().add(20, 'seconds'));

            const staleDate = dayjs().add(41, 'seconds')
            player.currentListenRange.rtPlayer.setPosition(44000);
            expect(player.currentListenRange.isOverDrifted(23)).to.be.true;

            expect(player.checkStale(staleDate)).to.be.true;
            expect(player.listenRanges[player.listenRanges.length - 1].end.position).to.eq(23);
            expect(player.getListenDuration()).to.eq(20);
        });

        // TODO playback position reported and conflicts with player reported status
    });
});

describe('Player listen ranges', function () {
    describe('When source does not provide playback position', function () {

        it('Duration is timestamp based for unknown/playing reported players', function () {
            const player = new GenericPlayerState(logger, [NO_DEVICE, NO_USER]);

            player.update(testState({play: newPlay, status: REPORTED_PLAYER_STATUSES.playing}));
            player.update(testState({play: newPlay, status: REPORTED_PLAYER_STATUSES.playing}), dayjs().add(10, 'seconds'));
            player.update(testState({play: newPlay, status: REPORTED_PLAYER_STATUSES.playing}), dayjs().add(20, 'seconds'));

            assert.equal(player.getListenDuration(), 20);

            const uplayer = new GenericPlayerState(logger, [NO_DEVICE, NO_USER]);

            uplayer.update(testState({play: newPlay}));
            uplayer.update(testState({play: newPlay}), dayjs().add(10, 'seconds'));
            uplayer.update(testState({play: newPlay}), dayjs().add(20, 'seconds'));

            assert.equal(uplayer.getListenDuration(), 20);
        });

        it('Range ends if player reports paused', function () {
            const player = new GenericPlayerState(logger, [NO_DEVICE, NO_USER]);

            player.update(testState({play: newPlay, status: REPORTED_PLAYER_STATUSES.playing}));
            player.update(testState({play: newPlay, status: REPORTED_PLAYER_STATUSES.playing}), dayjs().add(10, 'seconds'));
            player.update(testState({play: newPlay, status: REPORTED_PLAYER_STATUSES.playing}), dayjs().add(20, 'seconds'));
            player.update(testState({play: newPlay, status: REPORTED_PLAYER_STATUSES.paused}), dayjs().add(30, 'seconds'));
            player.update(testState({play: newPlay, status: REPORTED_PLAYER_STATUSES.paused}), dayjs().add(40, 'seconds'));

            assert.equal(player.getListenDuration(), 20);
        });

        it('Listen duration continues when player resumes', function () {
            const player = new GenericPlayerState(logger, [NO_DEVICE, NO_USER]);

            player.update(testState({play: newPlay, status: REPORTED_PLAYER_STATUSES.playing}));
            player.update(testState({play: newPlay, status: REPORTED_PLAYER_STATUSES.playing}), dayjs().add(10, 'seconds'));
            player.update(testState({play: newPlay, status: REPORTED_PLAYER_STATUSES.playing}), dayjs().add(20, 'seconds'));
            player.update(testState({play: newPlay, status: REPORTED_PLAYER_STATUSES.paused}), dayjs().add(30, 'seconds'));
            player.update(testState({play: newPlay, status: REPORTED_PLAYER_STATUSES.paused}), dayjs().add(40, 'seconds'));
            // For TS-only players the player must see two consecutive playing states to count the duration between them
            // so it does NOT count above paused ^^ to below playing -- only playing-to-playing
            player.update(testState({play: newPlay, status: REPORTED_PLAYER_STATUSES.playing}), dayjs().add(50, 'seconds'));
            player.update(testState({play: newPlay, status: REPORTED_PLAYER_STATUSES.playing}), dayjs().add(60, 'seconds'));

            assert.equal(player.getListenDuration(), 30);
        });
    });

    describe('When source does provide playback position', function () {

        it('Duration is position based', function () {
            const player = new TestPositionalPlayerState(logger, [NO_DEVICE, NO_USER]);

            const positioned = clone(newPlay);

            player.update(testState({play: positioned, position: 3}));

            player.currentListenRange.rtPlayer.setPosition(10000);
            player.update(testState({play: positioned, position: 10}), dayjs().add(10, 'seconds'));

            assert.equal(player.getListenDuration(), 7);
        });

        it('Range ends if position over drifts', function () {
            const player = new TestPositionalPlayerState(logger, [NO_DEVICE, NO_USER]);

            const positioned = clone(newPlay);
            player.update(testState({play: positioned, position: 3}));

            player.currentListenRange.rtPlayer.setPosition(10000);
            player.update(testState({play: positioned, position: 3}), dayjs().add(10, 'seconds'));

            assert.equal(player.getListenDuration(), 0);
        });

        it('Range continues when position continues moving forward', function () {
            const player = new TestPositionalPlayerState(logger, [NO_DEVICE, NO_USER]);

            const positioned = clone(newPlay);
            player.update(testState({play: positioned, position: 3}));

            player.currentListenRange.rtPlayer.setPosition(7000);
            player.update(testState({play: positioned, position: 7}), dayjs().add(4, 'seconds'));


            player.currentListenRange.rtPlayer.setPosition(23000);
            player.update(testState({play: positioned, position: 23}), dayjs().add(20, 'seconds'));

            player.currentListenRange.rtPlayer.setPosition(33000);
            player.update(testState({play: positioned, position: 33}), dayjs().add(30, 'seconds'));

            player.currentListenRange.rtPlayer.setPosition(43000);
            player.update(testState({play: positioned, position: 43}), dayjs().add(40, 'seconds'));

            assert.equal(player.getListenDuration(), 40);
        });

        describe('Detects seeking', function () {

            it('Detects seeking forward', function () {
                const player = new TestPositionalPlayerState(logger, [NO_DEVICE, NO_USER]);

                const positioned = clone(newPlay);
                player.update(testState({play: positioned, position: 3}));

                positioned.meta.trackProgressPosition = 13;
                player.currentListenRange.rtPlayer.setPosition(13000);
                player.update(testState({play: positioned, position: 13}), dayjs().add(10, 'seconds'));

                player.currentListenRange.rtPlayer.setPosition(17000);
                const [isSeeked, time] = player.currentListenRange.seeked(24, dayjs().add(17, 'seconds'))
                assert.isTrue(isSeeked);
                assert.equal(time, 7000)
            });

            it('Detects seeking backwards when position is before last reported position', function () {
                const player = new TestPositionalPlayerState(logger, [NO_DEVICE, NO_USER]);

                const positioned = clone(newPlay);
                player.update(testState({play: positioned, position: 3}));

                player.currentListenRange.rtPlayer.setPosition(13000);
                player.update(testState({play: positioned, position: 13}), dayjs().add(10, 'seconds'));

                player.currentListenRange.rtPlayer.setPosition(17000);
                const [isSeeked, time] = player.currentListenRange.seeked(10, dayjs().add(17, 'seconds'))
                assert.isTrue(isSeeked);
                assert.equal(time, -3000)
            });
        });

        describe('Detects repeating', function () {
            it('Detects repeat when player was within 12 seconds of ending and seeked back to within 12 seconds of start', function () {
                const player = new TestPositionalPlayerState(logger, [NO_DEVICE, NO_USER]);

                const positioned = clone(newPlay);
                positioned.data.duration = 70;
                player.update(testState({play: positioned, position: 45}));

                player.currentListenRange.rtPlayer.setPosition(65000);
                player.update(testState({play: positioned, position: 65}), dayjs().add(20, 'seconds'));

                const isRepeat = player.testSessionRepeat(5,  dayjs().add(20, 'seconds'));
                assert.isTrue(isRepeat);

                player.currentListenRange.rtPlayer.setPosition(67000);
                const [curr, prevPlay] = player.update(testState({play: positioned, position: 5}), dayjs().add(22, 'seconds'));

                assert.isDefined(prevPlay);
                assert.equal(player.getListenDuration(), 0);
            });

            it('Detects repeat when player was within 15% of ending and seeked back to within 15% of start', function () {
                const player = new TestPositionalPlayerState(logger, [NO_DEVICE, NO_USER]);

                const positioned = clone(newPlay);
                positioned.data.duration = 300;

                player.update(testState({play: positioned, position: 351}));

                player.currentListenRange.rtPlayer.setPosition(361000);
                player.update(testState({play: positioned, position: 361}), dayjs().add(10, 'seconds'));

                player.currentListenRange.rtPlayer.setPosition(371000);
                player.update(testState({play: positioned, position: 371}), dayjs().add(20, 'seconds'));

                const isRepeat = player.testSessionRepeat(20,  dayjs().add(30, 'seconds'));
                assert.isTrue(isRepeat);

                player.currentListenRange.rtPlayer.setPosition(381000);
                const [curr, prevPlay] = player.update(testState({play: positioned, position: 20}), dayjs().add(30, 'seconds'));

                assert.isDefined(prevPlay);
                assert.equal(player.getListenDuration(), 0);
            });

            it('Detects repeat when player is seeked to start and a hefty chunk of the track has already been played', function () {
                const player = new TestPositionalPlayerState(logger, [NO_DEVICE, NO_USER]);

                const positioned = clone(newPlay);
                positioned.data.duration = 70;

                player.update(testState({play: positioned, position: 0}));

                player.currentListenRange.rtPlayer.setPosition(40000);
                player.update(testState({play: positioned, position: 40}), dayjs().add(40, 'seconds'));

                const isRepeat = player.testSessionRepeat(2,  dayjs().add(50, 'seconds'));
                assert.isTrue(isRepeat);

                positioned.meta.trackProgressPosition = 2;
                player.currentListenRange.rtPlayer.setPosition(50000);
                const [curr, prevPlay] = player.update(testState({play: positioned, position: 2}), dayjs().add(50, 'seconds'));

                assert.isDefined(prevPlay);
                assert.equal(player.getListenDuration(), 0);
            });
        });
    });
});
