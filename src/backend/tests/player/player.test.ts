import {describe, it} from 'mocha';
import {assert} from 'chai';
import {generatePlay} from "../utils/PlayTestUtils";
import {GenericPlayerState} from "../../sources/PlayerState/GenericPlayerState";
import {getLogger} from "../../common/logging";
import {
    CALCULATED_PLAYER_STATUSES,
    NO_DEVICE,
    NO_USER,
    REPORTED_PLAYER_STATUSES
} from "../../common/infrastructure/Atomic";
import {playObjDataMatch} from "../../utils";
import dayjs from "dayjs";
import clone from "clone";

const logger = getLogger({});

const newPlay = generatePlay({duration: 300});

describe('Basic player state', function () {

    it('Creates new play state when new', function () {
        const player = new GenericPlayerState(logger, [NO_DEVICE, NO_USER]);

        assert.isUndefined(player.currentListenRange);
        assert.isUndefined(player.currentPlay);

        player.setState(undefined, newPlay);

        assert.isDefined(player.currentListenRange);
        assert.isDefined(player.currentPlay);
    });

    it('Creates new play state in unknown status', function () {
        const player = new GenericPlayerState(logger, [NO_DEVICE, NO_USER]);

        assert.isUndefined(player.currentListenRange);
        assert.isUndefined(player.currentPlay);

        player.setState(undefined, newPlay);

        assert.isDefined(player.currentListenRange);
        assert.isDefined(player.currentPlay);
        assert.equal(CALCULATED_PLAYER_STATUSES.unknown, player.calculatedStatus);
    });

    it('Creates new play state when incoming play is not the same as stored play', function () {
        const player = new GenericPlayerState(logger, [NO_DEVICE, NO_USER]);

        player.setState(undefined, newPlay);

        assert.isTrue(playObjDataMatch(player.currentPlay, newPlay));

        const nextPlay = generatePlay({playDate: newPlay.data.playDate.add(2, 'seconds')});
        const [returnedPlay, prevPlay] = player.setState(undefined, nextPlay);

        assert.isTrue(playObjDataMatch(prevPlay, newPlay));
        assert.isTrue(playObjDataMatch(player.currentPlay, nextPlay));
    });
});

describe('Player status', function () {

    it('New player transitions from unknown to playing on n+1 states', function () {
        const player = new GenericPlayerState(logger, [NO_DEVICE, NO_USER]);

        player.setState(undefined, newPlay);
        assert.equal(CALCULATED_PLAYER_STATUSES.unknown, player.calculatedStatus);

        player.setState(undefined, newPlay, dayjs().add(10, 'seconds'));
        assert.equal(CALCULATED_PLAYER_STATUSES.playing, player.calculatedStatus);
    });

    describe('When source provides reported status', function () {

        it('Calculated state is playing when source reports playing', function () {
            const player = new GenericPlayerState(logger, [NO_DEVICE, NO_USER]);

            player.setState(REPORTED_PLAYER_STATUSES.playing, newPlay);
            player.setState(REPORTED_PLAYER_STATUSES.playing, newPlay, dayjs().add(10, 'seconds'));
            assert.equal(CALCULATED_PLAYER_STATUSES.playing, player.calculatedStatus);
        });


        it('Calculated state is paused when source reports paused', function () {
            const player = new GenericPlayerState(logger, [NO_DEVICE, NO_USER]);

            player.setState(REPORTED_PLAYER_STATUSES.playing, newPlay);
            player.setState(REPORTED_PLAYER_STATUSES.playing, newPlay, dayjs().add(10, 'seconds'));
            player.setState(REPORTED_PLAYER_STATUSES.paused, newPlay, dayjs().add(20, 'seconds'));
            assert.equal(CALCULATED_PLAYER_STATUSES.paused, player.calculatedStatus);
        });

        it('Calculated state is stopped when source reports stopped', function () {
            const player = new GenericPlayerState(logger, [NO_DEVICE, NO_USER]);

            player.setState(REPORTED_PLAYER_STATUSES.playing, newPlay);
            player.setState(REPORTED_PLAYER_STATUSES.playing, newPlay, dayjs().add(10, 'seconds'));
            player.setState(REPORTED_PLAYER_STATUSES.stopped, newPlay, dayjs().add(20, 'seconds'));
            assert.equal(CALCULATED_PLAYER_STATUSES.stopped, player.calculatedStatus);
        });

    });

    describe('When source provides playback position', function () {

        it('Calculated state is playing when position moves forward', function () {
            const player = new GenericPlayerState(logger, [NO_DEVICE, NO_USER]);

            const positioned = clone(newPlay);
            positioned.meta.trackProgressPosition = 3;

            player.setState(undefined, positioned);

            positioned.meta.trackProgressPosition = 13;
            player.setState(undefined, positioned, dayjs().add(10, 'seconds'));

            assert.equal(CALCULATED_PLAYER_STATUSES.playing, player.calculatedStatus);
        });

        it('Calculated state is paused when position does not change', function () {
            const player = new GenericPlayerState(logger, [NO_DEVICE, NO_USER]);

            const positioned = clone(newPlay);
            positioned.meta.trackProgressPosition = 3;

            player.setState(undefined, positioned);

            positioned.meta.trackProgressPosition = 13;
            player.setState(undefined, positioned, dayjs().add(10, 'seconds'));

            player.setState(undefined, positioned, dayjs().add(20, 'seconds'));

            assert.equal(CALCULATED_PLAYER_STATUSES.paused, player.calculatedStatus);
        });

        // TODO playback position reported and conflicts with player reported status
    });
});

describe('Player listen ranges', function () {
    describe('When source does not provide playback position', function () {

        it('Duration is timestamp based for unknown/playing reported players', function () {
            const player = new GenericPlayerState(logger, [NO_DEVICE, NO_USER]);

            player.setState(REPORTED_PLAYER_STATUSES.playing, newPlay);
            player.setState(REPORTED_PLAYER_STATUSES.playing, newPlay, dayjs().add(10, 'seconds'));
            player.setState(REPORTED_PLAYER_STATUSES.playing, newPlay, dayjs().add(20, 'seconds'));

            assert.equal(player.getListenDuration(), 20);

            const uplayer = new GenericPlayerState(logger, [NO_DEVICE, NO_USER]);

            uplayer.setState(undefined, newPlay);
            uplayer.setState(undefined, newPlay, dayjs().add(10, 'seconds'));
            uplayer.setState(undefined, newPlay, dayjs().add(20, 'seconds'));

            assert.equal(uplayer.getListenDuration(), 20);
        });

        it('Range ends if player reports paused', function () {
            const player = new GenericPlayerState(logger, [NO_DEVICE, NO_USER]);

            player.setState(REPORTED_PLAYER_STATUSES.playing, newPlay);
            player.setState(REPORTED_PLAYER_STATUSES.playing, newPlay, dayjs().add(10, 'seconds'));
            player.setState(REPORTED_PLAYER_STATUSES.playing, newPlay, dayjs().add(20, 'seconds'));
            player.setState(REPORTED_PLAYER_STATUSES.paused, newPlay, dayjs().add(30, 'seconds'));
            player.setState(REPORTED_PLAYER_STATUSES.paused, newPlay, dayjs().add(40, 'seconds'));

            assert.equal(player.getListenDuration(), 20);
        });

        it('Listen duration continues when player resumes', function () {
            const player = new GenericPlayerState(logger, [NO_DEVICE, NO_USER]);

            player.setState(REPORTED_PLAYER_STATUSES.playing, newPlay);
            player.setState(REPORTED_PLAYER_STATUSES.playing, newPlay, dayjs().add(10, 'seconds'));
            player.setState(REPORTED_PLAYER_STATUSES.playing, newPlay, dayjs().add(20, 'seconds'));
            player.setState(REPORTED_PLAYER_STATUSES.paused, newPlay, dayjs().add(30, 'seconds'));
            player.setState(REPORTED_PLAYER_STATUSES.paused, newPlay, dayjs().add(40, 'seconds'));
            // For TS-only players the player must see two consecutive playing states to count the duration between them
            // so it does NOT count above paused ^^ to below playing -- only playing-to-playing
            player.setState(REPORTED_PLAYER_STATUSES.playing, newPlay, dayjs().add(50, 'seconds'));
            player.setState(REPORTED_PLAYER_STATUSES.playing, newPlay, dayjs().add(60, 'seconds'));

            assert.equal(player.getListenDuration(), 30);
        });
    });

    describe('When source does provide playback position', function () {

        it('Duration is position based', function () {
            const player = new GenericPlayerState(logger, [NO_DEVICE, NO_USER]);

            const positioned = clone(newPlay);
            positioned.meta.trackProgressPosition = 3;
            player.setState(undefined, positioned);

            positioned.meta.trackProgressPosition = 10;
            player.setState(undefined, positioned, dayjs().add(10, 'seconds'));

            assert.equal(player.getListenDuration(), 7);
        });

        it('Range ends if position does not move', function () {
            const player = new GenericPlayerState(logger, [NO_DEVICE, NO_USER]);

            const positioned = clone(newPlay);
            positioned.meta.trackProgressPosition = 3;
            player.setState(undefined, positioned);

            positioned.meta.trackProgressPosition = 3;
            player.setState(undefined, positioned, dayjs().add(10, 'seconds'));

            assert.equal(player.getListenDuration(), 0);
        });

        it('Range continues when position continues moving forward', function () {
            const player = new GenericPlayerState(logger, [NO_DEVICE, NO_USER]);

            const positioned = clone(newPlay);
            positioned.meta.trackProgressPosition = 3;
            player.setState(undefined, positioned);

            positioned.meta.trackProgressPosition = 7;
            player.setState(undefined, positioned, dayjs().add(10, 'seconds'));

            player.setState(undefined, positioned, dayjs().add(20, 'seconds'));

            positioned.meta.trackProgressPosition = 17;
            player.setState(undefined, positioned, dayjs().add(30, 'seconds'));

            positioned.meta.trackProgressPosition = 27;
            player.setState(undefined, positioned, dayjs().add(40, 'seconds'));

            assert.equal(player.getListenDuration(), 24);
        });

        describe('Detects seeking', function () {

            it('Detects seeking forward', function () {
                const player = new GenericPlayerState(logger, [NO_DEVICE, NO_USER]);

                const positioned = clone(newPlay);
                positioned.meta.trackProgressPosition = 3;
                player.setState(undefined, positioned);

                positioned.meta.trackProgressPosition = 13;
                player.setState(undefined, positioned, dayjs().add(10, 'seconds'));

                positioned.meta.trackProgressPosition = 30;
                player.setState(undefined, positioned, dayjs().add(20, 'seconds'));

                assert.equal(player.currentListenRange.start.timestamp, player.currentListenRange.end.timestamp);

                positioned.meta.trackProgressPosition = 40;
                player.setState(undefined, positioned, dayjs().add(30, 'seconds'));

                assert.equal(player.getListenDuration(), 20);
            });

            it('Detects seeking backwards', function () {
                const player = new GenericPlayerState(logger, [NO_DEVICE, NO_USER]);

                const positioned = clone(newPlay);
                positioned.meta.trackProgressPosition = 30;
                player.setState(undefined, positioned);

                positioned.meta.trackProgressPosition = 40;
                player.setState(undefined, positioned, dayjs().add(10, 'seconds'));

                positioned.meta.trackProgressPosition = 20;
                player.setState(undefined, positioned, dayjs().add(20, 'seconds'));

                assert.equal(player.currentListenRange.start.timestamp, player.currentListenRange.end.timestamp);

                positioned.meta.trackProgressPosition = 30;
                player.setState(undefined, positioned, dayjs().add(30, 'seconds'));

                assert.equal(player.getListenDuration(), 20);
            });

        });

        describe('Detects repeating', function () {
            it('Detects repeat when player was within 12 seconds of ending and seeked back to within 12 seconds of start', function () {
                const player = new GenericPlayerState(logger, [NO_DEVICE, NO_USER]);

                const positioned = clone(newPlay);
                positioned.data.duration = 70;
                positioned.meta.trackProgressPosition = 45;
                player.setState(undefined, positioned);

                positioned.meta.trackProgressPosition = 55;
                player.setState(undefined, positioned, dayjs().add(10, 'seconds'));

                positioned.meta.trackProgressPosition = 65;
                player.setState(undefined, positioned, dayjs().add(20, 'seconds'));

                positioned.meta.trackProgressPosition = 5;
                const [curr, prevPlay] = player.setState(undefined, positioned, dayjs().add(30, 'seconds'));

                assert.isDefined(prevPlay);
                assert.equal(player.getListenDuration(), 0);
            });

            it('Detects repeat when player was within 15% of ending and seeked back to within 15% of start', function () {
                const player = new GenericPlayerState(logger, [NO_DEVICE, NO_USER]);

                const positioned = clone(newPlay);
                positioned.data.duration = 300;
                positioned.meta.trackProgressPosition = 351;
                player.setState(undefined, positioned);

                positioned.meta.trackProgressPosition = 361;
                player.setState(undefined, positioned, dayjs().add(10, 'seconds'));

                positioned.meta.trackProgressPosition = 371;
                player.setState(undefined, positioned, dayjs().add(20, 'seconds'));

                positioned.meta.trackProgressPosition = 20;
                const [curr, prevPlay] = player.setState(undefined, positioned, dayjs().add(30, 'seconds'));

                assert.isDefined(prevPlay);
                assert.equal(player.getListenDuration(), 0);
            });

            it('Detects repeat when player is seeked to start and a heft chunk of the track has already been played', function () {
                const player = new GenericPlayerState(logger, [NO_DEVICE, NO_USER]);

                const positioned = clone(newPlay);
                positioned.data.duration = 70;
                positioned.meta.trackProgressPosition = 0;
                player.setState(undefined, positioned);

                positioned.meta.trackProgressPosition = 10;
                player.setState(undefined, positioned, dayjs().add(10, 'seconds'));

                positioned.meta.trackProgressPosition = 20;
                player.setState(undefined, positioned, dayjs().add(20, 'seconds'));

                positioned.meta.trackProgressPosition = 30;
                player.setState(undefined, positioned, dayjs().add(30, 'seconds'));

                positioned.meta.trackProgressPosition = 40;
                player.setState(undefined, positioned, dayjs().add(40, 'seconds'));

                positioned.meta.trackProgressPosition = 2;
                const [curr, prevPlay] = player.setState(undefined, positioned, dayjs().add(50, 'seconds'));

                assert.isDefined(prevPlay);
                assert.equal(player.getListenDuration(), 0);
            });
        });
    });
});
