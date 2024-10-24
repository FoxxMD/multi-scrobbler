import { loggerTest } from "@foxxmd/logging";
import { assert } from 'chai';
import clone from "clone";
import dayjs from "dayjs";
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

const logger = loggerTest;

const newPlay = generatePlay({duration: 300});

const testState = (data: Omit<PlayerStateDataMaybePlay, 'platformId'>): PlayerStateDataMaybePlay => ({...data, platformId: SINGLE_USER_PLATFORM_ID});

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
            const player = new GenericPlayerState(logger, [NO_DEVICE, NO_USER]);

            const positioned = clone(newPlay);
            positioned.meta.trackProgressPosition = 3;

            player.update(testState({play: positioned}));

            positioned.meta.trackProgressPosition = 13;
            player.update(testState({play: positioned}), dayjs().add(10, 'seconds'));

            assert.equal(CALCULATED_PLAYER_STATUSES.playing, player.calculatedStatus);
        });

        it('Calculated state is paused when position does not change', function () {
            const player = new GenericPlayerState(logger, [NO_DEVICE, NO_USER]);

            const positioned = clone(newPlay);
            positioned.meta.trackProgressPosition = 3;

            player.update(testState({play: positioned}));

            positioned.meta.trackProgressPosition = 13;
            player.update(testState({play: positioned}), dayjs().add(10, 'seconds'));

            player.update(testState({play: positioned}), dayjs().add(20, 'seconds'));

            assert.equal(CALCULATED_PLAYER_STATUSES.paused, player.calculatedStatus);
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
            const player = new GenericPlayerState(logger, [NO_DEVICE, NO_USER]);

            const positioned = clone(newPlay);
            positioned.meta.trackProgressPosition = 3;
            player.update(testState({play: positioned}));

            positioned.meta.trackProgressPosition = 10;
            player.update(testState({play: positioned}), dayjs().add(10, 'seconds'));

            assert.equal(player.getListenDuration(), 7);
        });

        it('Range ends if position does not move', function () {
            const player = new GenericPlayerState(logger, [NO_DEVICE, NO_USER]);

            const positioned = clone(newPlay);
            positioned.meta.trackProgressPosition = 3;
            player.update(testState({play: positioned}));

            positioned.meta.trackProgressPosition = 3;
            player.update(testState({play: positioned}), dayjs().add(10, 'seconds'));

            assert.equal(player.getListenDuration(), 0);
        });

        it('Range continues when position continues moving forward', function () {
            const player = new GenericPlayerState(logger, [NO_DEVICE, NO_USER]);

            const positioned = clone(newPlay);
            positioned.meta.trackProgressPosition = 3;
            player.update(testState({play: positioned}));

            positioned.meta.trackProgressPosition = 7;
            player.update(testState({play: positioned}), dayjs().add(10, 'seconds'));

            player.update(testState({play: positioned}), dayjs().add(20, 'seconds'));

            positioned.meta.trackProgressPosition = 17;
            player.update(testState({play: positioned}), dayjs().add(30, 'seconds'));

            positioned.meta.trackProgressPosition = 27;
            player.update(testState({play: positioned}), dayjs().add(40, 'seconds'));

            assert.equal(player.getListenDuration(), 24);
        });

        describe('Detects seeking', function () {

            it('Detects seeking forward', function () {
                const player = new GenericPlayerState(logger, [NO_DEVICE, NO_USER]);

                const positioned = clone(newPlay);
                positioned.meta.trackProgressPosition = 3;
                player.update(testState({play: positioned}));

                positioned.meta.trackProgressPosition = 13;
                player.update(testState({play: positioned}), dayjs().add(10, 'seconds'));

                positioned.meta.trackProgressPosition = 30;
                player.update(testState({play: positioned}), dayjs().add(20, 'seconds'));

                assert.equal(player.currentListenRange.start.timestamp, player.currentListenRange.end.timestamp);

                positioned.meta.trackProgressPosition = 40;
                player.update(testState({play: positioned}), dayjs().add(30, 'seconds'));

                assert.equal(player.getListenDuration(), 20);
            });

            it('Detects seeking backwards', function () {
                const player = new GenericPlayerState(logger, [NO_DEVICE, NO_USER]);

                const positioned = clone(newPlay);
                positioned.meta.trackProgressPosition = 30;
                player.update(testState({play: positioned}));

                positioned.meta.trackProgressPosition = 40;
                player.update(testState({play: positioned}), dayjs().add(10, 'seconds'));

                positioned.meta.trackProgressPosition = 20;
                player.update(testState({play: positioned}), dayjs().add(20, 'seconds'));

                assert.equal(player.currentListenRange.start.timestamp, player.currentListenRange.end.timestamp);

                positioned.meta.trackProgressPosition = 30;
                player.update(testState({play: positioned}), dayjs().add(30, 'seconds'));

                assert.equal(player.getListenDuration(), 20);
            });

        });

        describe('Detects repeating', function () {
            it('Detects repeat when player was within 12 seconds of ending and seeked back to within 12 seconds of start', function () {
                const player = new GenericPlayerState(logger, [NO_DEVICE, NO_USER]);

                const positioned = clone(newPlay);
                positioned.data.duration = 70;
                positioned.meta.trackProgressPosition = 45;
                player.update(testState({play: positioned}));

                positioned.meta.trackProgressPosition = 55;
                player.update(testState({play: positioned}), dayjs().add(10, 'seconds'));

                positioned.meta.trackProgressPosition = 65;
                player.update(testState({play: positioned}), dayjs().add(20, 'seconds'));

                positioned.meta.trackProgressPosition = 5;
                const [curr, prevPlay] = player.update(testState({play: positioned}), dayjs().add(30, 'seconds'));

                assert.isDefined(prevPlay);
                assert.equal(player.getListenDuration(), 0);
            });

            it('Detects repeat when player was within 15% of ending and seeked back to within 15% of start', function () {
                const player = new GenericPlayerState(logger, [NO_DEVICE, NO_USER]);

                const positioned = clone(newPlay);
                positioned.data.duration = 300;
                positioned.meta.trackProgressPosition = 351;
                player.update(testState({play: positioned}));

                positioned.meta.trackProgressPosition = 361;
                player.update(testState({play: positioned}), dayjs().add(10, 'seconds'));

                positioned.meta.trackProgressPosition = 371;
                player.update(testState({play: positioned}), dayjs().add(20, 'seconds'));

                positioned.meta.trackProgressPosition = 20;
                const [curr, prevPlay] = player.update(testState({play: positioned}), dayjs().add(30, 'seconds'));

                assert.isDefined(prevPlay);
                assert.equal(player.getListenDuration(), 0);
            });

            it('Detects repeat when player is seeked to start and a heft chunk of the track has already been played', function () {
                const player = new GenericPlayerState(logger, [NO_DEVICE, NO_USER]);

                const positioned = clone(newPlay);
                positioned.data.duration = 70;
                positioned.meta.trackProgressPosition = 0;
                player.update(testState({play: positioned}));

                positioned.meta.trackProgressPosition = 10;
                player.update(testState({play: positioned}), dayjs().add(10, 'seconds'));

                positioned.meta.trackProgressPosition = 20;
                player.update(testState({play: positioned}), dayjs().add(20, 'seconds'));

                positioned.meta.trackProgressPosition = 30;
                player.update(testState({play: positioned}), dayjs().add(30, 'seconds'));

                positioned.meta.trackProgressPosition = 40;
                player.update(testState({play: positioned}), dayjs().add(40, 'seconds'));

                positioned.meta.trackProgressPosition = 2;
                const [curr, prevPlay] = player.update(testState({play: positioned}), dayjs().add(50, 'seconds'));

                assert.isDefined(prevPlay);
                assert.equal(player.getListenDuration(), 0);
            });
        });
    });
});
