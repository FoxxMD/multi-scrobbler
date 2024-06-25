import { loggerTest } from "@foxxmd/logging";
import { assert } from 'chai';
import clone from "clone";
import { describe, it } from 'mocha';
import { playsAreAddedOnly, playsAreSortConsistent } from "../../utils/PlayComparisonUtils.js";
import { generatePlay, generatePlays } from "./PlayTestUtils.js";

const logger = loggerTest;

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

    describe('Added Only', function () {

        it('Non-identical lists are not add only', function () {
            const [ok, diff, addType] = playsAreAddedOnly(existingList, generatePlays(10))
            assert.isFalse(ok);
        });

        it('Lists with only prepended additions are detected', function () {
            const [ok, diff, addType] = playsAreAddedOnly(existingList, [generatePlay(), generatePlay(), ...existingList])
            assert.isTrue(ok);
            assert.equal(addType, 'prepend');
        });

        it('Lists with only appended additions are detected', function () {
            const [ok, diff, addType] = playsAreAddedOnly(existingList, [...existingList, generatePlay(), generatePlay()])
            assert.isTrue(ok);
            assert.equal(addType, 'append');
        });

        it('Lists of fixed length with prepends are correctly detected', function () {
            const [ok, diff, addType] = playsAreAddedOnly(existingList, [generatePlay(), generatePlay(), ...existingList].slice(0, 9))
            assert.isTrue(ok);
            assert.equal(addType, 'prepend');
        });

        it('Lists with inserts are detected', function () {
            const splicedList1 = [...existingList.map(x => clone(x))];
            splicedList1.splice(4, 0, generatePlay())
            const [ok, diff, addType] = playsAreAddedOnly(existingList, splicedList1)
            assert.isFalse(ok)
            //assert.equal(addType, 'insert');

            const splicedList2 = [...existingList.map(x => clone(x))];
            splicedList2.splice(2, 0, generatePlay())
            splicedList2.splice(6, 0, generatePlay())
            const [ok2, diff2, addType2] = playsAreAddedOnly(existingList, splicedList2)
            assert.isFalse(ok2)
            //assert.equal(addType2, 'insert');
        });

        it('Lists with inserts and prepends are detected as inserts', function () {
            const splicedList = [...existingList.map(x => clone(x))];
            splicedList.splice(2, 0, generatePlay())
            splicedList.splice(6, 0, generatePlay())
            const [ok, diff3, addType] = playsAreAddedOnly(existingList, [generatePlay(), generatePlay(), ...splicedList])
            assert.isFalse(ok);
            //assert.equal(addType, 'insert');
        });

        it('Lists with inserts and appends are detected as inserts', function () {
            const splicedList = [...existingList.map(x => clone(x))];
            splicedList.splice(2, 0, generatePlay())
            splicedList.splice(6, 0, generatePlay())
            const [ok, diff4, addType] = playsAreAddedOnly(existingList, [...splicedList, generatePlay(), generatePlay()])
            assert.isFalse(ok);
            //assert.equal(addType, 'insert');
        });

        it('Lists with inserts and appends and prepends are detected as inserts', function () {
            const splicedList = [...existingList.map(x => clone(x))];
            const [ok, diff, addType] = playsAreAddedOnly(existingList, [generatePlay(), generatePlay(), ...splicedList, generatePlay(), generatePlay()])
            assert.isFalse(ok);
            //assert.equal(addType, 'insert');
        });
    })
});
