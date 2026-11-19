import { assert } from 'chai';
import { describe, it } from 'mocha';
import { addRange, contiguousCoveredFrom, mergeRanges, removeRange, subtractRanges } from "../../utils/RangeUtils.ts";

describe('Range Utils', function () {

    describe('mergeRanges', function () {
        it('sorts and merges overlapping ranges', function () {
            assert.deepEqual(mergeRanges([[20, 30], [0, 10], [5, 15]]), [[0, 15], [20, 30]]);
        });
        it('merges adjacent ranges', function () {
            assert.deepEqual(mergeRanges([[0, 10], [11, 20]]), [[0, 20]]);
        });
        it('does not merge ranges with a gap', function () {
            assert.deepEqual(mergeRanges([[0, 10], [12, 20]]), [[0, 10], [12, 20]]);
        });
        it('drops inverted ranges and handles empty', function () {
            assert.deepEqual(mergeRanges([]), []);
            assert.deepEqual(mergeRanges([[10, 5]]), []);
        });
        it('absorbs contained ranges', function () {
            assert.deepEqual(mergeRanges([[0, 100], [10, 20]]), [[0, 100]]);
        });
    });

    describe('addRange', function () {
        it('adds and merges', function () {
            assert.deepEqual(addRange([[0, 10], [20, 30]], [11, 19]), [[0, 30]]);
        });
    });

    describe('removeRange', function () {
        it('splits a range around the removed span', function () {
            assert.deepEqual(removeRange([[0, 100]], [40, 60]), [[0, 39], [61, 100]]);
        });
        it('removes fully contained ranges', function () {
            assert.deepEqual(removeRange([[10, 20], [30, 40]], [0, 25]), [[30, 40]]);
        });
        it('removes everything', function () {
            assert.deepEqual(removeRange([[10, 20]], [0, 100]), []);
        });
    });

    describe('subtractRanges (gaps)', function () {
        it('returns whole request when nothing is covered', function () {
            assert.deepEqual(subtractRanges([0, 100], []), [[0, 100]]);
        });
        it('returns nothing when fully covered', function () {
            assert.deepEqual(subtractRanges([10, 20], [[0, 100]]), []);
        });
        it('returns gaps between covered ranges', function () {
            assert.deepEqual(subtractRanges([0, 100], [[10, 20], [50, 60]]), [[0, 9], [21, 49], [61, 100]]);
        });
        it('treats touching coverage as no gap', function () {
            assert.deepEqual(subtractRanges([0, 100], [[0, 50], [51, 100]]), []);
        });
        it('handles an unbounded start (0)', function () {
            assert.deepEqual(subtractRanges([0, 1000], [[500, 2000]]), [[0, 499]]);
        });
    });

    describe('contiguousCoveredFrom', function () {
        const covered: [number, number][] = [[0, 10], [20, 100]];
        it('desc returns span from range start to edge', function () {
            assert.deepEqual(contiguousCoveredFrom(80, 'desc', covered), [20, 80]);
        });
        it('asc returns span from edge to range end', function () {
            assert.deepEqual(contiguousCoveredFrom(30, 'asc', covered), [30, 100]);
        });
        it('returns undefined when edge is not covered', function () {
            assert.isUndefined(contiguousCoveredFrom(15, 'desc', covered));
        });
    });
});
