import { expect } from 'chai';
import { describe, it } from 'mocha';
import { parseToRegexOrLiteralSearch } from "@foxxmd/regex-buddy-core";
import { nativeParse } from "../../common/transforms/NativeTransformer.ts";
import { listenResponseToPlay, listenToNaivePlay } from "../../common/vendor/ListenbrainzApiClient.ts";
import NativeTransformer from "../../common/transforms/NativeTransformer.ts";
import { loggerTest } from "@foxxmd/logging";
import { Cacheable } from "cacheable";
import { initMemoryCache } from "../../common/Cache.ts";
import { statefulInvariantTransform } from "../../../core/PlayUtils.ts";
import { patchObject } from "../../../core/DataUtils.ts";
import { slimHistoricalPlay } from "../../scrobblers/AbstractHistoricalScrobbleClient.ts";
import { parseWithReference, stripReferenceNames } from "../../utils/CreditPipeline.ts";
import { DELIMITERS, type ParseRecord } from "../../../core/Atomic.ts";
import { creditMbid, creditsToNames, mbMeta, nameToCredit } from "../../../core/MusicMetadata.ts";
import type { PlayObject } from "../../../core/PlaySchema.ts";
import type { ListenResponse } from "../../../core/vendor/listenbrainz/interfaces.ts";
import characterization from './characterization.json' with { type: 'json' };

// [artist strings, track name]
const cases: [string[], string][] = [
    [['Foo'], 'Song'],
    [['Foo, Bar'], 'Song'],
    [['Foo & Bar'], 'Song'],
    [['Foo / Bar'], 'Song'],
    [['Foo \\ Bar'], 'Song'],
    [['Foo feat. Bar'], 'Song'],
    [['Foo ft. Bar & Baz'], 'Song'],
    [['Foo vs. Bar'], 'Song'],
    [['Foo x Bar'], 'Song'],
    [['Foo with Bar'], 'Song'],
    [['Foo × Bar'], 'Song'],
    [['Foo'], 'Song (feat. Bar & Baz)'],
    [['Foo'], 'Song ft. Bar, Baz'],
    [['Foo'], 'Song [with Bar]'],
    [['Foo, Bar'], 'Song (feat. Foo)'],
    [['Foo & Bar', 'Baz, Qux'], 'Song'],
    [['Earth, Wind & Fire'], 'Song'],
];

type Result = [string[], string];
const asPlay = (artists: string[], track: string) => ({data: {artists: artists.map(name => ({name})), track: {name: track}}, meta: {}}) as unknown as PlayObject;
const asListen = (artist: string, track: string) => ({listened_at: 1700000000, track_metadata: {artist_name: artist, track_name: track, additional_info: {}}}) as unknown as ListenResponse;
const result = (play: PlayObject): Result => [creditsToNames(play.data.artists ?? []), play.data.track!.name];

const modes: Record<keyof typeof characterization, (artists: string[], track: string) => PlayObject | undefined> = {
    native: (a, t) => nativeParse(asPlay(a, t)),
    // how Musicbrainz and Rocksky transformers call it
    native_titleClean_DELIM: (a, t) => nativeParse(asPlay(a, t), {titleClean: true, delimiters: DELIMITERS}),
    native_noMono: (a, t) => nativeParse(asPlay(a, t), {artistsParseMonolithicOnly: false}),
    native_ignore: (a, t) => nativeParse(asPlay(a, t), {ignoreArtistsRegex: [parseToRegexOrLiteralSearch('Earth, Wind & Fire'), parseToRegexOrLiteralSearch('/Foo & Bar/i')]}),
    native_titleOnly: (a, t) => nativeParse(asPlay(a, t), {artistsParseFrom: ['title']}),
    native_artistsOnly: (a, t) => nativeParse(asPlay(a, t), {artistsParseFrom: ['artists']}),
    naive: (a, t) => a.length === 1 ? listenToNaivePlay(asListen(a[0], t)) : undefined,
    naive_noExtract: (a, t) => a.length === 1 ? listenToNaivePlay(asListen(a[0], t), {extractArtists: false}) : undefined,
};

// Locks current parsing output so moving it into a shared pipeline does not change behavior.
// Expectations are recorded output, not necessarily ideal output.
describe('Parsing characterization', function () {
    for (const [mode, run] of Object.entries(modes)) {
        describe(mode, function () {
            for (const [artists, track] of cases) {
                const key = `${artists.join(' | ')} -- ${track}`;
                const expected = (characterization as unknown as Record<string, Record<string, Result>>)[mode][key];
                if (expected === undefined) {
                    continue;
                }
                it(key, function () {
                    expect(result(run(artists, track)!)).to.deep.eq(expected);
                });
            }
        });
    }
});

describe('stripReferenceNames', function () {
    const mapping = (name: string, joinPhrase = '') => ({name, joinPhrase});

    it('Removes mapped name with its join phrase and reports it as leading', function () {
        expect(stripReferenceNames('Lucas & L-Boy feat. Foo', [mapping('Lucas & L-Boy', ' feat. ')])).to.deep.eq({remaining: 'Foo', leading: 'Lucas & L-Boy'});
    });

    it('Removes mapped name without join phrase when join phrase is not present', function () {
        expect(stripReferenceNames('Foo, Lucas & L-Boy', [mapping('Lucas & L-Boy', ' feat. ')])).to.deep.eq({remaining: 'Foo, ', leading: undefined});
    });

    it('Matches case-insensitively and leaves unmatched string unchanged', function () {
        expect(stripReferenceNames('Song (feat. lucas & l-boy)', [mapping('Lucas & L-Boy')]).remaining).eq('Song (feat. )');
        expect(stripReferenceNames('Foo', [mapping('Bar & Baz')])).to.deep.eq({remaining: 'Foo', leading: undefined});
    });
});

describe('parseWithReference decisions', function () {
    const ref = (name: string, joinPhrase = '') => ({name, joinPhrase, credit: {name}});

    it('Records segment applied and track accepted', function () {
        const res = parseWithReference('Foo with Bar', 'Song', {artists: [ref('Foo', ' × '), ref('Bar')], track: 'Song'});
        expect(creditsToNames(res.artists!)).to.deep.eq(['Foo', 'Bar']);
        expect(res.decisions.map(x => [x.step, x.outcome])).to.deep.eq([
            ['segment', 'applied'],
            ['joinedNames', 'skipped'],
            ['delimiters', 'applied'],
            ['primaryArtistGate', 'applied'],
            ['merge', 'applied'],
            ['trackGate', 'applied'],
        ]);
    });

    it('Records primary artist rejection with the failing candidate', function () {
        const res = parseWithReference('Chris Lake with Riovaz', 'Song', {artists: [ref('Somebody Else')], track: 'Song'});
        expect(res.artists).to.be.undefined;
        const last = res.decisions[res.decisions.length - 1];
        expect(last.step).eq('primaryArtistGate');
        expect(last.outcome).eq('rejected');
        expect(last.reason).to.include('Chris Lake with Riovaz');
    });
});

describe('nativeParse credit metadata', function () {
    const withMbid = (name: string) => nameToCredit(name, mbMeta(`${name}-mbid`, 'artist'));
    const play = (artists: string[], track = 'Song') => ({data: {artists: artists.map(withMbid), track: {name: track}}, meta: {}}) as unknown as PlayObject;

    it('Keeps metadata for artists passed through as-is', function () {
        const ignored = nativeParse(play(['Foo & Bar']), {ignoreArtistsRegex: [parseToRegexOrLiteralSearch('Foo & Bar')]});
        expect(creditMbid(ignored.data.artists![0], 'artist')).eq('Foo & Bar-mbid');
        const notSplit = nativeParse(play(['Foo, Bar', 'Baz']));
        expect(notSplit.data.artists!.map(x => creditMbid(x, 'artist'))).to.deep.eq(['Foo, Bar-mbid', 'Baz-mbid']);
    });

    it('Uses new credits for parsed artists', function () {
        const parsed = nativeParse(play(['Foo, Bar']));
        expect(parsed.data.artists!.map(x => creditMbid(x, 'artist'))).to.deep.eq([undefined, undefined]);
        // a string that parses to itself is still a parsed artist
        const single = nativeParse(play(['Foo']));
        expect(creditMbid(single.data.artists![0], 'artist')).to.be.undefined;
    });
});

describe('Parse records', function () {
    const listen = (mapping?: object) => ({listened_at: 1700000000, track_metadata: {artist_name: 'Foo with Bar', track_name: 'Song', additional_info: {}, mbid_mapping: mapping}}) as unknown as ListenResponse;

    it('LZ records reference decisions when mapping is used', function () {
        const play = listenResponseToPlay(listen({recording_name: 'Song', artists: [{artist_credit_name: 'Foo', join_phrase: ' × ', artist_mbid: 'a'}, {artist_credit_name: 'Bar', join_phrase: '', artist_mbid: 'b'}]}));
        expect(play.meta.parseRecord!.parser).eq('listenbrainz');
        expect(play.meta.parseRecord!.decisions.at(-1)).to.include({step: 'trackGate', outcome: 'applied'});
        // only the parsed play carries it, not the original
        expect(play.original!.play!.meta.parseRecord).to.be.undefined;
    });

    it('LZ records a patch from submitted to parsed track and artists', function () {
        const play = listenResponseToPlay(listen({recording_name: 'Song', artists: [{artist_credit_name: 'Foo', join_phrase: ' × ', artist_mbid: 'a'}, {artist_credit_name: 'Bar', join_phrase: '', artist_mbid: 'b'}]}));
        const {submitted, patch} = play.meta.parseRecord!;
        expect(creditsToNames(submitted!.artists)).to.deep.eq(['Foo with Bar']);
        expect(patchObject(submitted!, patch!)).to.deep.eq({track: play.data.track, artists: play.data.artists});
        // nothing to change, no patch
        const unchanged = listenResponseToPlay({...listen(), track_metadata: {...listen().track_metadata, artist_name: 'Foo'}} as ListenResponse);
        expect(unchanged.meta.parseRecord!.patch).to.be.undefined;
    });

    it('LZ records why the naive play was used', function () {
        const noMapping = listenResponseToPlay(listen());
        expect(noMapping.meta.parseRecord!.decisions.map(x => [x.step, x.outcome])).to.deep.eq([['reference', 'skipped'], ['naive', 'applied']]);
        const rejected = listenResponseToPlay(listen({recording_name: 'Song', artists: [{artist_credit_name: 'Somebody', join_phrase: '', artist_mbid: 'a'}]}));
        expect(rejected.meta.parseRecord!.decisions.map(x => x.step).slice(-2)).to.deep.eq(['primaryArtistGate', 'naive']);
    });

    it('Native stage puts its decisions in transform inputs', async function () {
        const t = new NativeTransformer({name: 'test', type: 'native'}, {logger: loggerTest, cache: new Cacheable({primary: initMemoryCache({ttl: '1ms'})})});
        await t.initialize();
        const data = await t.getTransformerData(asPlay(['Foo, Bar'], 'Song'), t.parseConfig({type: 'native'}));
        expect(data.meta.lifecycleInputs).to.have.length(1);
        expect(data.meta.lifecycleInputs![0].type).eq('parseDecisions');
        expect((data.meta.lifecycleInputs![0].input as ParseRecord).parser).eq('native');
    });

    it('Is not carried into embedded or historical plays', function () {
        const play = listenResponseToPlay(listen());
        expect(statefulInvariantTransform(play).meta.parseRecord).to.be.undefined;
        expect(slimHistoricalPlay(play).meta.parseRecord).to.be.undefined;
    });
});
