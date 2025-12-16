import { assert, expect } from 'chai';
import { describe, it } from 'mocha';
import {
    compareNormalizedStrings,
    normalizeStr,
    replaceInterpolatedValues,
} from "../../utils/StringUtils.js";
import { splitByFirstFound } from '../../../core/StringUtils.js';
import { noCasePropObj } from '../../utils/DataUtils.js';

describe('String Comparisons', function () {

    it('should ignore symbols', async function () {
        const result = compareNormalizedStrings('this string! is the. same', 'this string is the same');
        assert.isAtLeast(result.highScore, 100);
    });

    it('should ignore whitespace', async function () {
        const result = compareNormalizedStrings('this string   is the   same   ', 'this string is the same');
        assert.isAtLeast(result.highScore, 100);
    });

    it('should ignore case', async function () {
        const result = compareNormalizedStrings('ThIs STRING iS THe SAMe', 'this string is the same');
        assert.isAtLeast( result.highScore, 100);
    });

    it('should normalize unicode', async function () {
        const tests = [
            ['Enamorate Bailando','Enamórate Bailando'],
            ['Dina Ogon', 'Dina Ögon'],
            ['Nana', 'Nanã'],
            ['Nana', 'Nanä']
        ]

        for(const test of tests) {
            const result = compareNormalizedStrings(test[0], test[1]);
            assert.equal(100, result.highScore);
        }
    });

    it('should not erase non-english characters', async function () {
        const tests = [
            ['VAPERROR / t e l e p a t h テレパシー能力者 - 切っても切れない', 'vaperror t e l e p a t h テレパシー能力者 切っても切れない'],
            ['Мой мармеладный (Speed Up)', 'мои мармеладныи speed up'],
            ['Мой мармеладный (Я не права) [Из сериала "Ольга", 2 Сезон]', 'мои мармеладныи я не права из сериала ольга 2 сезон']
        ]

        for(const test of tests) {
            const result = normalizeStr(test[0], {keepSingleWhitespace: true});
            assert.equal(result, test[1]);
        }
    });

    it('should score small changes correctly', async function () {
        const tests = [
            ['there is change', 'therr is change'],
            ['laser cannon', 'lazer cannon'],
            ['Monster', 'Manster'],
            ['What are you doing', 'hwat are you doing']
        ]

        for(const test of tests) {
            const result = compareNormalizedStrings(test[0], test[1]);
            assert.isAtLeast( result.highScore, 75, `Comparing: '${test[0]}' | '${test[1]}'`);
        }
    });

    it('should score word bags correctly', async function () {
        const tests = [
            ['there change is', 'there is change'],
            ['laser cannon', 'cannon laser'],
            ['One two three four', 'One four two threee'],
            ['you, doin hwat are', 'hwat are you doing'],
            ['My Track (feat. Tourist1, Artist2)', 'My Track (feat. Artist2, Tourist1)']
        ]

        for(const test of tests) {
            const result = compareNormalizedStrings(test[0], test[1]);
            assert.isAtLeast( result.highScore, 80, `Comparing: '${test[0]}' | '${test[1]}'`);
        }
    });

    it('should not score very similar as identical', async function () {
        const tests = [
            ['Another Brick in the Wall, Pt. 1', 'Another Brick in the Wall, Pt. 2'],
        ]

        for(const test of tests) {
            const result = compareNormalizedStrings(test[0], test[1]);
            assert.isAtMost( result.highScore, 99, `Comparing: '${test[0]}' | '${test[1]}'`);
        }
    });

    it('should handle strings with different lengths', async function () {
        const tests = [
            ['The Amazing Bongo Hop', 'The Bongo Hop'],
        ]

        for(const test of tests) {
            const result = compareNormalizedStrings(test[0], test[1]);
            assert.isAtMost( result.highScore, 58, `Comparing: '${test[0]}' | '${test[1]}'`);
        }
    });

    it('should be string parameter order invariant', async function () {
        const longerString = 'Nidia Gongora TEST';
        const shorterString = 'Nidia Gongora'

        const result1 = compareNormalizedStrings(longerString, shorterString);
        const result2 = compareNormalizedStrings(shorterString, longerString);

        assert.equal( result1.highScore, result2.highScore, `Comparing: '${longerString}' | '${shorterString}'`);
    });
});

describe('String Splitting', function() {

    it('should not split string with no delimiter', function() {
        const artistName = undefined;
        const artist = "Phil Collins";
        const artistStrings = splitByFirstFound(artist, [','], [artistName]);
        expect(artistStrings).to.eql(['Phil Collins'])
    });
});

it('Proxy object has case-insensitive keys', function() {
    const myObj: Record<string, any> = {FOO: 'bar'};

    const iObj = noCasePropObj(myObj);

    expect(iObj.foO).is.not.undefined;
    expect(iObj.foo).eq('bar');
});

describe('Interpolation', function() {

    it('interpolates values', function() {
        const replaced = replaceInterpolatedValues('My cool string has [[asecret]] in it', {asecret: 'foo'});
        expect(replaced).not.includes('[');
        expect(replaced).not.includes(']');
        expect(replaced).includes('foo');
    });

    it('interpolates values case-insensitive', function() {
        const replaced = replaceInterpolatedValues('My cool string has [[ASECREt]] in it', {aSeCrEt: 'foo'});
        expect(replaced).includes('foo');
    });

    it('interpolates values after trimming', function() {
        const replaced = replaceInterpolatedValues('My cool string has [[  ASECREt  ]] in it', {aSeCrEt: 'foo'});
        expect(replaced).includes('foo');
    });

    it('leaves match in place if not interpolated', function() {
        const replaced = replaceInterpolatedValues('My cool string has [[asecret]] and [[coolsecret]] in it', {bar: 'foo', coolsecret: 'xxx'});
        expect(replaced).includes('[[asecret]]');
        expect(replaced).includes('xxx');
        expect(replaced).not.includes('[[coolsecret]]');
    });
});

