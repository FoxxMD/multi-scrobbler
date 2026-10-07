import { describe, it } from 'mocha';
import { expect } from 'chai';
import { buildFreetextQuery, buildLuceneQuery, cleanLuceneFields } from '../../common/vendor/musicbrainz/LuceneUtils.ts';

describe('#LuceneUtils', function () {

    it('builds fields in insertion order, skipping undefined and empty values', function () {
        expect(buildLuceneQuery({recording: 'Song', artist: ['A'], release: undefined, arid: [], rid: '1-2'}))
            .to.eq('recording:"Song" AND artist:"A" AND rid:"1-2"');
    });

    it('matches any of multiple values unless field prefers all', function () {
        const query = {artist: ['A', 'B'], arid: ['1', '2']};
        expect(buildLuceneQuery(query, {preferAll: ['artist']}))
            .to.eq('(artist:("A" AND "B") OR artist:("A" OR "B")) AND arid:("1" OR "2")');
        expect(buildLuceneQuery(query, {operator: 'OR'}))
            .to.eq('artist:("A" OR "B") OR arid:("1" OR "2")');
    });

    it('cleans only the given fields', function () {
        const query = {release: 'AC/DC (Live)', reid: ['1-2']};
        expect(cleanLuceneFields(query, ['release'])).to.eql({release: 'AC\\/DC \\(Live\\)', reid: ['1-2']});
        expect(cleanLuceneFields(query, ['release'], {escapeCharacters: false, removeCharacters: true})).to.eql({release: 'AC DC Live', reid: ['1-2']});
    });

    it('builds freetext from only the given fields', function () {
        expect(buildFreetextQuery({recording: 'Song', artist: ['A', 'B'], release: undefined, rid: '1'}, ['recording', 'artist', 'release']))
            .to.eq('Song A B');
    });
});
