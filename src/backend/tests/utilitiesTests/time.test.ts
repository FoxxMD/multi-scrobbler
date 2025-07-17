import { assert, expect } from 'chai';
import { describe, it } from 'mocha';
import { closeToPlayEnd, closeToPlayStart, repeatDurationPlayed, timePassesScrobbleThreshold } from '../../utils/TimeUtils.js';
import { DEFAULT_CLOSE_POSITION_ABSOLUTE, DEFAULT_CLOSE_POSITION_PERCENT, DEFAULT_DURATION_REPEAT_ABSOLUTE, DEFAULT_DURATION_REPEAT_PERCENT, DEFAULT_SCROBBLE_DURATION_THRESHOLD, DEFAULT_SCROBBLE_PERCENT_THRESHOLD } from '../../common/infrastructure/Atomic.js';
import { generatePlay } from '../utils/PlayTestUtils.js';

describe('Play Position', function() {

    describe('Close To Start', function() {

        it(`Is close when within ${DEFAULT_CLOSE_POSITION_ABSOLUTE} seconds`, function() {
            expect(closeToPlayStart(generatePlay(), 10)[0]).is.true; 
        });
        it(`Is not close when later than ${DEFAULT_CLOSE_POSITION_ABSOLUTE} seconds`, function() {
            expect(closeToPlayStart(generatePlay({duration: 60}), 13)[0]).is.false; 
        });
        it(`Is close when within ${DEFAULT_CLOSE_POSITION_PERCENT} percent`, function() {
            expect(closeToPlayStart(generatePlay({duration: 300}), 40)[0]).is.true; 
        });
        it(`Is not close when greater than ${DEFAULT_CLOSE_POSITION_PERCENT} percent`, function() {
            expect(closeToPlayStart(generatePlay({duration: 60}), 15)[0]).is.false; 
        });
        it(`Is close when within ${DEFAULT_CLOSE_POSITION_ABSOLUTE} seconds and no duration`, function() {
            expect(closeToPlayStart(generatePlay({duration: undefined}), 10)[0]).is.true; 
        });

    });

    describe('Close To End', function() {

        it(`Is not close when no duration`, function() {
            expect(closeToPlayEnd(generatePlay({duration: undefined}), 50)[0]).is.false; 
        });
        it(`Is close when within ${DEFAULT_CLOSE_POSITION_ABSOLUTE} seconds`, function() {
            expect(closeToPlayEnd(generatePlay({duration: 60}), 50)[0]).is.true; 
        });
        it(`Is not close when earlier than ${DEFAULT_CLOSE_POSITION_ABSOLUTE} seconds`, function() {
            expect(closeToPlayEnd(generatePlay({duration: 60}), 45)[0]).is.false; 
        });
        it(`Is close when within ${DEFAULT_CLOSE_POSITION_PERCENT} percent`, function() {
            expect(closeToPlayEnd(generatePlay({duration: 300}), 261)[0]).is.true; 
        });
        it(`Is not close when less than ${DEFAULT_CLOSE_POSITION_PERCENT} percent`, function() {
            expect(closeToPlayEnd(generatePlay({duration: 300}), 240)[0]).is.false; 
        });
        
    });

});

describe('Play Repeat Duration', function() {

    it(`Is valid for repeat when more than ${DEFAULT_DURATION_REPEAT_ABSOLUTE} seconds`, function() {
        expect(repeatDurationPlayed(generatePlay({duration: 300}), DEFAULT_DURATION_REPEAT_ABSOLUTE + 1)[0]).is.true; 
    });
    it(`Is not valid for repeat when less than ${DEFAULT_DURATION_REPEAT_ABSOLUTE} seconds`, function() {
        expect(repeatDurationPlayed(generatePlay({duration: 300}), 10)[0]).is.false; 
    });
    it(`Is valid for repeat when more than ${DEFAULT_DURATION_REPEAT_PERCENT} percent`, function() {
        expect(repeatDurationPlayed(generatePlay({duration: 60}), 40)[0]).is.true; 
    });
    it(`Is not valid for repeat when less than ${DEFAULT_DURATION_REPEAT_PERCENT} percent`, function() {
        expect(repeatDurationPlayed(generatePlay({duration: 60}), 15)[0]).is.false; 
    });
    it(`Is valid for repeat when more than ${DEFAULT_DURATION_REPEAT_ABSOLUTE} seconds and no duration`, function() {
        expect(repeatDurationPlayed(generatePlay({duration: undefined}), DEFAULT_DURATION_REPEAT_ABSOLUTE + 1)[0]).is.true; 
    });

});

describe('Scrobble Threshold Checks', function() {

    it('uses defaults when no user-configured thresholds are passed', function() {
        const results = timePassesScrobbleThreshold({}, 1, 1);
        expect(results.duration.threshold).to.eq(DEFAULT_SCROBBLE_DURATION_THRESHOLD);
        expect(results.percent.threshold).to.eq(DEFAULT_SCROBBLE_PERCENT_THRESHOLD);
    });

    it('uses user-configured thresholds when passed', function() {
        const results = timePassesScrobbleThreshold({
            duration: 20,
            percent: 15
        }, 1, 1);
        expect(results.duration.threshold).to.eq(20);
        expect(results.percent.threshold).to.eq(15);
    });

    it('passes when duration is above threshold', function() {
        const results = timePassesScrobbleThreshold({}, DEFAULT_SCROBBLE_DURATION_THRESHOLD + 1);
        expect(results.duration.passes).is.true;
        expect(results.passes).is.true;
    });

    it('passes when percent is above threshold', function() {
        const results = timePassesScrobbleThreshold({}, 30, 50);
        expect(results.percent.passes).is.true;
        expect(results.passes).is.true;
    });

    it('handles zero duration', function() {
        const results = timePassesScrobbleThreshold({}, DEFAULT_SCROBBLE_DURATION_THRESHOLD + 1, 0);
        expect(results.duration.passes).is.true;
        expect(results.passes).is.true;
    });
});