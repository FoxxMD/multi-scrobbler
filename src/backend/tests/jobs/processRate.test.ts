import { expect } from 'chai';
import { describe, it } from 'mocha';
import { addRateSample, estimateRate, type RateSample } from '../../../core/ProcessRate.ts';

describe('Job process rate', function () {

    it('drops samples older than the window', function () {
        let samples: RateSample[] = [];
        for (const at of [0, 30_000, 61_000, 90_000]) {
            samples = addRateSample(samples, {at, count: at / 1000});
        }
        expect(samples.map(x => x.at)).to.eql([30_000, 61_000, 90_000]);
    });

    it('needs two samples over some time', function () {
        expect(estimateRate([])).to.be.undefined;
        expect(estimateRate([{at: 0, count: 0}])).to.be.undefined;
        expect(estimateRate([{at: 5, count: 0}, {at: 5, count: 3}])).to.be.undefined;
    });

    it('gives plays per minute and finish time from progress', function () {
        const rate = estimateRate([{at: 0, count: 10, progress: 0.1}, {at: 30_000, count: 40, progress: 0.4}]);
        expect(rate?.perMinute).to.eq(60);
        // 0.3 per 30s, 0.6 left takes 60s more
        expect(rate?.finishAt).to.be.closeTo(90_000, 1);
    });

    it('has no finish time without progress gained', function () {
        expect(estimateRate([{at: 0, count: 0}, {at: 60_000, count: 30}])).to.eql({perMinute: 30});
        expect(estimateRate([{at: 0, count: 5, progress: 0.5}, {at: 60_000, count: 5, progress: 0.5}])).to.eql({perMinute: 0});
    });
});
