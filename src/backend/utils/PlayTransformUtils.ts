import type { searchAndReplace as searchAndReplaceFunc} from "@foxxmd/regex-buddy-core";
import { testMaybeRegex as testMaybeRegexFunc } from "@foxxmd/regex-buddy-core";
import type {PlayObject, PlayObjectMinimal} from "../../core/Atomic.ts";

import { type WhenParts, type WhenConditions } from "../../core/Transform.ts";
import dayjs from "dayjs";
import { playImages } from "../../core/MusicMetadata.ts";

export const testWhen = (parts: WhenParts, play: PlayObject, options?: SuppliedRegex): boolean => {
    const {
        testMaybeRegex = testMaybeRegexFunc,
    } = options || {}

    if(parts.title !== undefined) {
        if(!testMaybeRegex(parts.title, play.data.track?.name ?? '')[0]) {
            return false;
        }
    }
    for(const [test, credits] of [[parts.artists, play.data.artists], [parts.albumArtists, play.data.albumArtists]] as const) {
        if(test !== undefined) {
            // allows user to test if artists are empty
            const names = test.length === 0 ? [''] : (credits ?? []).map(x => x.name);
            if(names.every(x => !testMaybeRegex(test, x)[0])) {
                return false;
            }
        }
    }
    if(parts.album !== undefined) {
        if(!testMaybeRegex(parts.album, play.data.album?.name ?? '')[0]) {
            return false;
        }
    }
    if(parts.art !== undefined) {
        const images = playImages(play.data);
        if(parts.art.trim() === '') {
            // user is testing to see if there is no art
            // if test is empty string and there is no art then it passes
            return images.length === 0;
        }
        // passes if any art url matches the search
        return images.some(x => testMaybeRegex(parts.art!, x)[0]);
    }
    return true;
}

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