import { loggerTest, loggerDebug, childLogger } from "@foxxmd/logging";
import chai, { assert, expect } from 'chai';
import asPromised from 'chai-as-promised';
import { after, before, describe, it } from 'mocha';

import { asPlays, generateArtistsStr, generatePlay, normalizePlays } from "../utils/PlayTestUtils.js";
import { parseArtistCredits, parseContextAwareStringList, parseCredits } from "../../utils/StringUtils.js";

describe('Parsing Artists from String', function() {

    it('Parses Artists from an Artist-like string', function () {
        for(const i of Array(20)) {
            const [str, primaries, secondaries] = generateArtistsStr();
            const credits = parseArtistCredits(str);
            const allArtists = primaries.concat(secondaries);
            const parsed = [credits.primary].concat(credits.secondary ?? [])
            expect(primaries.concat(secondaries),`
'${str}'
Expected => ${allArtists.join(' || ')}
Found    => ${parsed.join(' || ')}`)

.eql(parsed)
        }
    });

    it('Parses & as "local" joiner when other delimiters present', function () {

        const data = [{
            str: `Melendi \\ Ryan Lewis \\ The Righteous Brothers (featuring Joan Jett & The Blackhearts \\ Robin Schulz)`,
            expected: ['Melendi', 'Ryan Lewis', 'The Righteous Brothers', 'Joan Jett & The Blackhearts', 'Robin Schulz']
        }, {
            str: `Gigi D'Agostino \\ YOASOBI (vs Sam Hunt, Lisa Loeb & Booba)`,
            expected: [`Gigi D'Agostino`, 'YOASOBI', 'Sam Hunt', 'Lisa Loeb', 'Booba']
        }];

        for(const d of data) {
            const credits = parseArtistCredits(d.str);
            const parsed = [credits.primary].concat(credits.secondary ?? [])
            expect(d.expected).eql(parsed)
        }
    
    });

    it('Only parses & as "global" joiner when no other delimiters present', function () {

        const data = [{
            str: `Melendi & Ryan Lewis & The Righteous Brothers (featuring The Blackhearts \\ Robin Schulz)`,
            expected: ['Melendi', 'Ryan Lewis', 'The Righteous Brothers', 'The Blackhearts', 'Robin Schulz']
        }];

        for(const d of data) {
            const credits = parseArtistCredits(d.str);
            const parsed = [credits.primary].concat(credits.secondary ?? [])
            expect(d.expected).eql(parsed)
        }
    });

    it('Parses secondary free regex', function () {

        const data = [{
            str: `Diddy & Grand Funk Railroad feat. Daya & (G)I-DLE`,
            expected: ['Diddy', 'Grand Funk Railroad', 'Daya', '(G)I-DLE']
        }];

        for(const d of data) {
            const credits = parseArtistCredits(d.str);
            const parsed = [credits.primary].concat(credits.secondary ?? [])
            expect(d.expected).eql(parsed)
        }
    });

    it('Parses singlar Artist with wrapped vs multiple', function () {
        const [str, primaries, secondaries] = generateArtistsStr({primary: 1, secondary: {num: 2, ft: 'vs', joiner: '/', ftWrap: true}});
        const credits = parseArtistCredits(str);
        const moreCredits = parseCredits(str);
        expect(true).eq(true);
    });

    describe('When joiner is known', function () {

        it('Parses many primary artists', function () {
            for(const i of Array(10)) {
                const [str, primaries, secondaries] = generateArtistsStr({primary: {max: 3, joiner: '/'}, secondary: 0});
                const credits = parseArtistCredits(str, ['/']);
                const allArtists = primaries.concat(secondaries);
                const parsed = [credits.primary].concat(credits.secondary ?? [])
                expect(primaries.concat(secondaries),`
'${str}'
Expected => ${allArtists.join(' || ')}
Found    => ${parsed.join(' || ')}`)
        .eql(parsed)
            }
        });

        it('Parses many secondary artists', function () {
            // fails on -- Peso Pluma / Lil Baby / R. Kelly (featuring TOMORROW X TOGETHER / AC/DC / DaVido)
            for(const i of Array(10)) {
                const [str, primaries, secondaries] = generateArtistsStr({primary: {max: 3, joiner: '/'}, secondary: {joiner: '/', finalJoiner: false}});
                const credits = parseArtistCredits(str, ['/']);
                const allArtists = primaries.concat(secondaries);
                const parsed = [credits.primary].concat(credits.secondary ?? [])
                expect(primaries.concat(secondaries),`
'${str}'
Expected => ${allArtists.join(' || ')}
Found    => ${parsed.join(' || ')}`)
        .eql(parsed)
            }
        });


    });


});