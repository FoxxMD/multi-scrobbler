import { describe, it } from 'mocha';
import { expect } from 'chai';
import { creditId, creditMbid, mbMeta, mergeCreditsMetadata, resolveCredit, resolveCredits, spotifyMeta } from '../../../core/MusicMetadata.ts';
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

describe('#resolveCredit', function () {

    const existing = { ...nameToCredit('My Song', spotifyMeta('sp-old', 'track'), mbMeta('mb-old', 'recording')), image: 'old.jpg' };
    const incoming = { ...nameToCredit('My Song (Remastered)', mbMeta('mb-new', 'recording')), image: 'new.jpg' };

    it('renames and merges metadata, keeping ids from other services, when name and meta are used', function () {
        const credit = resolveCredit(existing, incoming, { name: true, meta: true, art: false });
        expect(credit?.name).to.eq('My Song (Remastered)');
        expect(creditMbid(credit, 'recording')).to.eq('mb-new');
        expect(creditId(credit, 'spotify', 'track')).to.eq('sp-old');
        expect(credit?.image).to.eq('old.jpg');
    });

    it('drops existing metadata when renamed without meta', function () {
        const credit = resolveCredit(existing, incoming, { name: true, meta: false, art: false });
        expect(credit).to.eql({ name: 'My Song (Remastered)', image: 'old.jpg' });
    });

    it('keeps existing metadata when name is unchanged without meta', function () {
        const credit = resolveCredit(existing, { ...incoming, name: 'My Song' }, { name: true, meta: false, art: false });
        expect(credit).to.eql(existing);
    });

    it('adds metadata without renaming when only meta is used', function () {
        const credit = resolveCredit(existing, incoming, { name: false, meta: true, art: false });
        expect(credit?.name).to.eq('My Song');
        expect(creditMbid(credit, 'recording')).to.eq('mb-new');
        expect(creditId(credit, 'spotify', 'track')).to.eq('sp-old');
    });

    it('only replaces image when art is used', function () {
        expect(resolveCredit(existing, incoming, { name: false, meta: false, art: true })).to.eql({ ...existing, image: 'new.jpg' });
        expect(resolveCredit(existing, { name: 'No Image' }, { name: false, meta: false, art: true })).to.eql(existing);
    });

    it('does not create a credit when name is not used', function () {
        expect(resolveCredit(undefined, incoming, { name: false, meta: true, art: true })).to.be.undefined;
    });

    it('creates a credit with only allowed parts when there is no existing credit', function () {
        expect(resolveCredit(undefined, incoming, { name: true, meta: false, art: false })).to.eql({ name: 'My Song (Remastered)' });
        expect(resolveCredit(undefined, incoming, { name: true, meta: true, art: true })).to.eql(incoming);
    });
});

describe('#resolveCredits', function () {

    const existing = [
        { ...nameToCredit('Beyonce', spotifyMeta('sp-b', 'artist')), image: 'b.jpg' },
        nameToCredit('jay z', spotifyMeta('sp-j', 'artist'))
    ];
    const incoming = [
        { ...nameToCredit('Jay Z', mbMeta('mb-j', 'artist')), image: 'j-new.jpg' },
        nameToCredit('Beyoncé', mbMeta('mb-b', 'artist')),
    ];

    it('matches metadata to existing credits by name when only meta is used', function () {
        const credits = resolveCredits(existing, incoming, { name: false, meta: true, art: false })!;
        expect(credits.map(x => x.name)).to.eql(['Beyonce', 'jay z']);
        expect(credits.map(x => creditMbid(x, 'artist'))).to.eql(['mb-b', 'mb-j']);
        expect(credits.map(x => creditId(x, 'spotify', 'artist'))).to.eql(['sp-b', 'sp-j']);
        expect(credits[0].image).to.eq('b.jpg');
    });

    it('matches metadata by position when no names match and counts are equal', function () {
        const credits = resolveCredits(namesToCredits(['Foo', 'Bar']), incoming, { name: false, meta: true, art: false })!;
        expect(credits.map(x => creditMbid(x, 'artist'))).to.eql(['mb-j', 'mb-b']);
    });

    it('replaces the list without keeping existing metadata when names change without meta', function () {
        const credits = resolveCredits(existing, [...incoming, nameToCredit('Beyonce', mbMeta('mb-b', 'artist'))], { name: true, meta: false, art: false });
        // existing image is kept for a credit whose name survived
        expect(credits).to.eql([{ name: 'Jay Z' }, { name: 'Beyoncé' }, { name: 'Beyonce', image: 'b.jpg' }]);
    });

    it('keeps existing metadata when names are unchanged without meta', function () {
        const sameNames = existing.map(x => nameToCredit(x.name, mbMeta('mb-x', 'artist')));
        expect(resolveCredits(existing, sameNames, { name: true, meta: false, art: false })).to.eql(existing);
    });

    it('uses incoming credits, keeping other service ids for unchanged names, when name and meta are used', function () {
        const credits = resolveCredits(existing, [incoming[0], nameToCredit('Beyonce', mbMeta('mb-b', 'artist'))], { name: true, meta: true, art: true })!;
        expect(credits.map(x => x.name)).to.eql(['Jay Z', 'Beyonce']);
        expect(credits.map(x => creditMbid(x, 'artist'))).to.eql(['mb-j', 'mb-b']);
        expect(credits.map(x => creditId(x, 'spotify', 'artist'))).to.eql([undefined, 'sp-b']);
        expect(credits.map(x => x.image)).to.eql(['j-new.jpg', 'b.jpg']);
    });

    it('only sets image on first credit when only art is used', function () {
        const credits = resolveCredits(existing, incoming, { name: false, meta: false, art: true })!;
        expect(credits).to.eql([{ ...existing[0], image: 'j-new.jpg' }, existing[1]]);
    });

    it('returns existing credits when there are no incoming credits and names are not used', function () {
        expect(resolveCredits(existing, undefined, { name: false, meta: true, art: true })).to.eql(existing);
    });
});
