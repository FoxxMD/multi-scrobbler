import type { searchAndReplace as searchAndReplaceFunc} from "@foxxmd/regex-buddy-core";
import { testMaybeRegex as testMaybeRegexFunc } from "@foxxmd/regex-buddy-core";
import type {PlayObject, PlayObjectMinimal} from "../../core/Atomic.ts";

import { type WhenParts, type WhenConditions } from "../../core/Transform.ts";
import dayjs from "dayjs";
import { playImages } from "../../core/MusicMetadata.ts";
import { compareDuration, type DurationComparison } from "../../core/TimeUtils.ts";

/** Test a Play part against a parsed test value (string/regex, comparison, etc...) */
export type PlayPartTester<T = string> = (test: T, play: PlayObject, options?: SuppliedRegex) => boolean;

/** Get the strings of a Play part that a string/regex test is matched against. Empty if the Play does not have the part */
export type PlayPartStringReader = (play: PlayObject) => string[];

const definedStrings = (...vals: (string | undefined | null)[]): string[] => vals.filter((x): x is string => x !== undefined && x !== null);

/**
 * Test if any value of a Play part matches a string/regex
 *
 * An empty (or whitespace) test matches only if the part has no values IE "test that Play has no artists"
 * */
export const testPlayPartValues = (test: string, values: string[], options?: SuppliedRegex): boolean => {
    const {
        testMaybeRegex = testMaybeRegexFunc,
    } = options || {};
    if (test.trim() === '') {
        return values.length === 0;
    }
    return values.some(x => testMaybeRegex(test, x)[0]);
}

/**
 * Build a tester for a Play part from a reader, that gets the part's value from a Play, and a test for that value
 *
 * @template V Value of the Play part
 * @template T Parsed test value
 * */
export const partTester = <V, T>(read: (play: PlayObject) => V, test: (test: T, value: V, options?: SuppliedRegex) => boolean): PlayPartTester<T> =>
    (testVal, play, options) => test(testVal, read(play), options);

/** Build a string/regex tester for a Play part from the strings it has */
export const stringPartTester = (read: PlayPartStringReader): PlayPartTester<string> => partTester(read, testPlayPartValues);

/** Built-in testers for Play parts */
export const PLAY_PART_TESTERS = {
    title: stringPartTester((play) => definedStrings(play.data.track?.name)),
    artists: stringPartTester((play) => (play.data.artists ?? []).map(x => x.name)),
    albumArtists: stringPartTester((play) => (play.data.albumArtists ?? []).map(x => x.name)),
    album: stringPartTester((play) => definedStrings(play.data.album?.name)),
    art: stringPartTester((play) => playImages(play.data)),
    deviceId: stringPartTester((play) => definedStrings(play.meta.deviceId)),
    user: stringPartTester((play) => definedStrings(play.meta.user)),
    library: stringPartTester((play) => definedStrings(play.meta.library)),
    musicService: stringPartTester((play) => definedStrings(play.meta.musicService)),
    playlist: stringPartTester((play) => definedStrings(play.meta.playlistId, play.meta.playlistName)),
    // Play without a duration never matches
    duration: partTester((play) => play.data.duration, (test: DurationComparison, value) =>
        value !== undefined && compareDuration(dayjs.duration(value, 'seconds'), test.operator, test.duration)),
    listenedFor: partTester((play) => play.data.listenedFor, (test: DurationComparison, value) =>
        value !== undefined && compareDuration(dayjs.duration(value, 'seconds'), test.operator, test.duration)),
} satisfies Record<string, PlayPartTester<any>>;

export type BuiltInPlayPart = keyof typeof PLAY_PART_TESTERS;

/** Test value the built-in tester for a part accepts */
type BuiltInTest<K extends BuiltInPlayPart> = Parameters<typeof PLAY_PART_TESTERS[K]>[0];

/** A tester for every part of P, typed by the part's (parsed) test value */
export type PlayPartTesters<P> = { [K in keyof P]-?: PlayPartTester<NonNullable<P[K]>> };

/** Parts of P a built-in tester covers: same key and a test value the built-in accepts */
type BuiltInCoveredParts<P> = { [K in keyof P]-?: K extends BuiltInPlayPart ? (NonNullable<P[K]> extends BuiltInTest<K> ? K : never) : never }[keyof P];

/**
 * Testers that must be supplied to test P: required for parts without a built-in tester, optional overrides for the rest
 *
 * Narrow P (EX zod `.omit()`/`.pick()` on its schema) to require fewer testers
 * */
export type SuppliedPlayPartTesters<P> = Omit<PlayPartTesters<P>, BuiltInCoveredParts<P>> & Partial<Pick<PlayPartTesters<P>, BuiltInCoveredParts<P>>>;

/** Get the supplied, or built-in, tester for a part. Throws if there is none (only possible when types are bypassed) */
export const getPlayPartTester = <T>(part: string, testers: object = {}): PlayPartTester<T> => {
    const tester = (testers as Partial<Record<string, PlayPartTester<T>>>)[part] ?? (PLAY_PART_TESTERS as Partial<Record<string, PlayPartTester<any>>>)[part];
    if (tester === undefined) {
        throw new Error(`No tester for Play part '${part}'`);
    }
    return tester;
}

/** Test that every given part of a Play matches its test (AND) */
export const testPlayParts = <P extends object>(parts: P, play: PlayObject, testers: SuppliedPlayPartTesters<P>, options?: SuppliedRegex): boolean => {
    for (const [part, test] of Object.entries(parts)) {
        if (test === undefined) {
            continue;
        }
        if (!getPlayPartTester(part, testers)(test, play, options)) {
            return false;
        }
    }
    return true;
}

/** Testers for `when` parts without a built-in tester */
const WHEN_PART_TESTERS: SuppliedPlayPartTesters<WhenParts> = {};

export const testWhen = (parts: WhenParts, play: PlayObject, options?: SuppliedRegex): boolean => testPlayParts(parts, play, WHEN_PART_TESTERS, options);

export const testWhenConditions = (when: WhenConditions, play: PlayObject, options?: SuppliedRegex) => when.some(x => testWhen(x, play, options));

export interface SuppliedRegex {
    searchAndReplace?: typeof searchAndReplaceFunc,
    testMaybeRegex?: typeof testMaybeRegexFunc,
}

export const baseFormatPlayObj = (data: any, play: PlayObjectMinimal): PlayObject => {
    const original = {
        data,
        play,
    };
    const basePlay: PlayObject =  {
        data: {
            ...play.data
        },
        meta: {
            seenAt: dayjs(),
            ...play.meta,
        },
        original
    }
    original.play.meta.seenAt = basePlay.meta.seenAt;
    return basePlay;
}