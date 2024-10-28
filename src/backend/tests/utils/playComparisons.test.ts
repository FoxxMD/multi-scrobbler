import { loggerTest } from "@foxxmd/logging";
import { assert } from 'chai';
import clone from "clone";
import { describe, it } from 'mocha';
import { playsAreAddedOnly, playsAreBumpedOnly, playsAreSortConsistent } from "../../utils/PlayComparisonUtils.js";
import { generatePlay, generatePlays } from "./PlayTestUtils.js";
import { PlayObject } from "../../../core/Atomic.js";

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
});
