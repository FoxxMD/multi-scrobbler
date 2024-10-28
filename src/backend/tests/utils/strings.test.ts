import { assert, expect } from 'chai';
import { describe, it } from 'mocha';
import { intersect } from "../../utils.js";
import { generateBaseURL, joinedUrl, normalizeWebAddress } from "../../utils/NetworkUtils.js";
import {
    compareNormalizedStrings,
    normalizeStr,
    parseTrackCredits,
    uniqueNormalizedStrArr
} from "../../utils/StringUtils.js";
import { ExpectedResults } from "./interfaces.js";
import testData from './playTestData.json';
import { splitByFirstFound } from '../../../core/StringUtils.js';

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

describe('URL Parsing', function () {
    describe('Base URL', function () {

       it('should return http://localhost:9078 if no url is specified', function () {
           assert.equal(generateBaseURL(undefined, 9078).toString(), 'http://localhost:9078/');
       });

        it('should normalize URL without protocol to HTTP', function () {
            assert.include(generateBaseURL('192.168.0.1', 9078).toString(), 'http://192.168.0.1');
            assert.include(generateBaseURL('my.domain.local', 9078).toString(), 'http://my.domain.local');
        });

        it('should use 443 for port, instead of default port, if protocol is https and no port is specified', function () {
            assert.include(generateBaseURL('https://192.168.0.1', 9078).toString(), 'https://192.168.0.1');
            assert.include(generateBaseURL('https://my.domain.local', 9078).toString(), 'https://my.domain.local');
        });

        it('should preserve port if explicitly specified', function () {
            assert.include(generateBaseURL('http://my.domain.local:80', 9078).toString(), 'http://my.domain.local');
            assert.include(generateBaseURL('192.168.0.1:80', 9078).toString(), 'http://192.168.0.1');
            assert.include(generateBaseURL('192.168.0.1:8000', 9078).toString(), 'http://192.168.0.1:8000');
            assert.include(generateBaseURL('my.domain.local:9075', 9078).toString(), 'http://my.domain.local:9075');
            assert.include(generateBaseURL('https://my.domain.local:9075', 9078).toString(), 'https://my.domain.local:9075');
        });

        it('should use default port if protocol is HTTP and port is not specified', function () {
            assert.include(generateBaseURL('192.168.0.1', 9078).toString(), 'http://192.168.0.1:9078');
            assert.include(generateBaseURL('http://my.domain.local', 9078).toString(), 'http://my.domain.local:9078');
        });

        it('should preserve pathname for subfolder usage', function () {
            assert.include(generateBaseURL('192.168.0.1/my/subfolder', 9078).toString(), 'http://192.168.0.1:9078/my/subfolder');
            assert.include(generateBaseURL('http://my.domain.local/my/subfolder', 9078).toString(), 'http://my.domain.local:9078/my/subfolder');
            assert.include(generateBaseURL('http://my.domain.local:5000/my/subfolder', 9078).toString(), 'http://my.domain.local:5000/my/subfolder');
            assert.include(generateBaseURL('https://my.domain.local/my/subfolder', 9078).toString(), 'https://my.domain.local/my/subfolder');
        });

        it('should should strip wrapping quotes', function () {
            assert.equal(generateBaseURL(`"http://192.168.3.120:9078"`, 9078).toString(), 'http://192.168.3.120:9078/');
        });
    });

    describe('URL Path Joining', function() {
       it('should join a path to a base URL without erasing base pathname', function() {
           const baseUrl = generateBaseURL('192.168.0.1/my/subfolder', 9078);
           assert.equal(joinedUrl(baseUrl, 'lastfm/callback').toString(), 'http://192.168.0.1:9078/my/subfolder/lastfm/callback');
       });
        it('should join a path to a base URL while handling leading and trailing slashes', function() {
            const baseUrl = generateBaseURL('192.168.0.1/my/subfolder', 9078);
            assert.equal(joinedUrl(baseUrl, '/lastfm/callback').toString(), 'http://192.168.0.1:9078/my/subfolder/lastfm/callback');
            assert.equal(joinedUrl(baseUrl, 'lastfm/callback/').toString(), 'http://192.168.0.1:9078/my/subfolder/lastfm/callback/');

            const baseUrlNoSub = generateBaseURL('192.168.0.1', 9078);
            assert.equal(joinedUrl(baseUrlNoSub, '/lastfm/callback').toString(), 'http://192.168.0.1:9078/lastfm/callback');
            assert.equal(joinedUrl(baseUrlNoSub, 'lastfm/callback/').toString(), 'http://192.168.0.1:9078/lastfm/callback/');
        });
    });

    describe('Normalizing', function() {

        const anIP = '192.168.0.100';

        it('Should unwrap a quoted value', function () {
            expect(normalizeWebAddress(`"${anIP}"`).url.hostname).to.eq(anIP);
        });

        it('Should normalize an IP to HTTP protocol', function () {
            expect(normalizeWebAddress(anIP).url.protocol).to.eq('http:');
        });

        it('Should normalize an IP without a port to port 80', function () {
            expect(normalizeWebAddress(anIP).port).to.eq(80);
        });

        it('Should normalize an IP to an HTTP URL', function () {
            expect(normalizeWebAddress(anIP).normal).to.eq(`http://${anIP}`);
        });

        it('Should normalize an IP with port 443 to an HTTPS URL', function () {
            expect(normalizeWebAddress(`${anIP}:443`).url.protocol).to.eq(`https:`);
            expect(normalizeWebAddress(`${anIP}:443`).url.toString()).to.include(`https:`);
            expect(normalizeWebAddress(`${anIP}:443`).normal).to.include(`https:`);
            expect(normalizeWebAddress(`${anIP}:443`).port).to.eq(443);
        });

        it('Should not normalize an IP with port 443 if protocol is specified', function () {
            expect(normalizeWebAddress(`http://${anIP}:443`).url.protocol).to.eq(`http:`);
            expect(normalizeWebAddress(`http://${anIP}:443`).url.toString()).to.include(`http:`);
            expect(normalizeWebAddress(`http://${anIP}:443`).normal).to.include(`http:`);
            expect(normalizeWebAddress(`http://${anIP}:443`).port).to.eq(443);
        });

        it('Should normalize an IP with a port and preserve port', function () {
            expect(normalizeWebAddress(`${anIP}:5000`).port).to.eq(5000);
            expect(normalizeWebAddress(`${anIP}:5000`).normal).to.eq(`http://${anIP}:5000`);
            expect(normalizeWebAddress(`${anIP}:5000`).url.protocol).to.eq('http:');
            expect(normalizeWebAddress(`${anIP}:5000`).url.port).to.eq('5000');
        });

        it('Should remove trailing slash', function () {
            expect(normalizeWebAddress(`${anIP}:5000/`).normal).to.eq(`http://${anIP}:5000`);
        });
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

