import {describe, it} from 'mocha';
import {assert} from 'chai';
import {compareNormalizedStrings, parseTrackCredits, uniqueNormalizedStrArr} from "../../utils/StringUtils";
import testData from './playTestData.json';
import {ExpectedResults} from "./interfaces";
import {intersect} from "../../utils";

interface PlayTestFixture {
    caseHints: string[]
    data: {
        track: string
        artists: string[]
        album?: string
    }
    expected: ExpectedResults
}

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

    it('should handle strings with different lengths', async function () {
        const tests = [
            ['The Amazing Bongo Hop', 'The Bongo Hop'],
        ]

        for(const test of tests) {
            const result = compareNormalizedStrings(test[0], test[1]);
            assert.isAtMost( result.highScore, 53, `Comparing: '${test[0]}' | '${test[1]}'`);
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

describe('Play Strings',function () {

    const testFixtures = testData as unknown as PlayTestFixture[];
    const joinerData = testFixtures.filter(x => intersect(['joiner','track'], x.caseHints).length === 2);

    it('should parse joiners from track title', function() {
        for(const test of joinerData) {
            const res = parseTrackCredits(test.data.track);
            let artists: string[] = [...test.data.artists];
            if(res.secondary !== undefined) {
                artists = uniqueNormalizedStrArr([...artists, ...res.secondary]);
            }
            assert.equal(res.primaryComposite, test.expected.track);
            assert.sameDeepMembers(artists, test.expected.artists);
        }
    });
});
