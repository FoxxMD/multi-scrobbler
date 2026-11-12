import { expect } from 'chai';
import { describe, it } from 'mocha';
import { closeToPlayEnd, closeToPlayStart, repeatDurationPlayed, timePassesScrobbleThreshold } from '../../utils/TimeUtils.ts';
import { compareDuration, durationComparisonSchema, parseDurationComparison, parseDurationFromDurationValue } from '../../../core/TimeUtils.ts';
import { DEFAULT_CLOSE_POSITION_ABSOLUTE, DEFAULT_CLOSE_POSITION_PERCENT, DEFAULT_DURATION_REPEAT_ABSOLUTE, DEFAULT_DURATION_REPEAT_PERCENT, DEFAULT_SCROBBLE_DURATION_THRESHOLD, DEFAULT_SCROBBLE_PERCENT_THRESHOLD } from '../../common/infrastructure/Atomic.ts';
import { generatePlay } from '../../../core/tests/utils/PlayTestUtils.ts';

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
describe('Duration Parsing', function() {

    it('parses short and long units', function() {
        expect(parseDurationFromDurationValue('37s').asSeconds()).eq(37);
        expect(parseDurationFromDurationValue('2 mins').asSeconds()).eq(120);
        expect(parseDurationFromDurationValue('500ms').asMilliseconds()).eq(500);
        expect(parseDurationFromDurationValue('3 hours').asHours()).eq(3);
        expect(parseDurationFromDurationValue('PT5S').asSeconds()).eq(5);
    });

    describe('Comparison', function() {
        it('parses operator and duration', function() {
            for (const [val, op, seconds] of [['> 7 s', '>', 7], ['= 2 minutes', '=', 120], ['< 37s', '<', 37], [' >90 ', '>', 90]] as const) {
                const res = parseDurationComparison(val);
                expect(res.operator).eq(op);
                expect(res.duration.asSeconds()).eq(seconds);
            }
        });

        it('rejects invalid values', function() {
            for (const val of ['7 s', '>= 7s', '> 7 fortnights', '>', '! 7s']) {
                expect(() => parseDurationComparison(val), val).to.throw();
                expect(durationComparisonSchema.safeParse(val).success, val).is.false;
            }
        });

        it('parses with schema', function() {
            const res = durationComparisonSchema.parse('< 37s');
            expect(res.operator).eq('<');
            expect(res.duration.asSeconds()).eq(37);
        });
    });
});

describe('Duration Compare', function() {
    it('compares durations with operator', function() {
        const {operator, duration} = parseDurationComparison('> 7 s');
        expect(compareDuration(parseDurationFromDurationValue(8), operator, duration)).is.true;
        expect(compareDuration(parseDurationFromDurationValue(7), operator, duration)).is.false;
        expect(compareDuration(parseDurationFromDurationValue(120), '=', parseDurationFromDurationValue('2 minutes'))).is.true;
        expect(compareDuration(parseDurationFromDurationValue(36), '<', parseDurationFromDurationValue('37s'))).is.true;
    });
});
