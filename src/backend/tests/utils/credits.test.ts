import { describe, it } from 'mocha';
import { expect } from 'chai';
import { creditMbid, mbMeta, mergeCreditsMetadata } from '../../../core/MusicMetadata.ts';
import { nameToCredit } from "../../../core/MusicMetadata.ts";
import { namesToCredits } from "../../../core/MusicMetadata.ts";

describe('#mergeCreditsMetadata', function () {

    const from = [nameToCredit('Beyoncé', mbMeta('id-b', 'artist')), nameToCredit('Tyler, The Creator', mbMeta('id-j', 'artist'))];

    it('matches by name regardless of order', function () {
        const merged = mergeCreditsMetadata(namesToCredits(['tyler the creator', 'Beyonce']), from);
        expect(merged.map(x => x.name)).to.eql(['tyler the creator', 'Beyonce']);
        expect(merged.map(x => creditMbid(x, 'artist'))).to.eql(['id-j', 'id-b']);
    });

    it('only adds metadata to credits with a matching name when some names match', function () {
        const merged = mergeCreditsMetadata(namesToCredits(['Someone Else', 'Beyonce']), from);
        expect(merged.map(x => creditMbid(x, 'artist'))).to.eql([undefined, 'id-b']);
    });

    it('falls back to position when no names match and lists are the same length', function () {
        const merged = mergeCreditsMetadata(namesToCredits(['Foo', 'Bar']), from);
        expect(merged.map(x => creditMbid(x, 'artist'))).to.eql(['id-b', 'id-j']);
    });

    it('adds nothing when no names match and lists are different lengths', function () {
        const merged = mergeCreditsMetadata(namesToCredits(['Foo']), from);
        expect(merged.map(x => creditMbid(x, 'artist'))).to.eql([undefined]);
    });
});
