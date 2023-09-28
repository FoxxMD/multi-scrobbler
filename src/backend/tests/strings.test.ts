import {describe, it} from 'mocha';
import {assert} from 'chai';
import {compareNormalizedStrings} from "../utils/StringUtils";


describe('String Comparisons', function () {

    it('should ignore punctuation', async function () {
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
});
