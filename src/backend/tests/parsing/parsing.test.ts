import { expect } from 'chai';
import { describe, it } from 'mocha';
import { parseToRegexOrLiteralSearch } from "@foxxmd/regex-buddy-core";
import { nativeParse } from "../../common/transforms/NativeTransformer.ts";
import { listenToNaivePlay } from "../../common/vendor/ListenbrainzApiClient.ts";
import { DELIMITERS } from "../../../core/Atomic.ts";
import { creditsToNames } from "../../../core/MusicMetadata.ts";
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
