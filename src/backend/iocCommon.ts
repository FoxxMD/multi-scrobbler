import type { MSCache } from "./common/Cache.ts";
import type { CovertArtSingletonMap, MusicBrainzSingletonMap } from "./common/vendor/musicbrainz/MusicbrainzTypes.ts";
import type { RockskySingletonMap } from "./common/vendor/rocksky/RockskyClientWrapped.ts";

/**
 * Subset of root container items used by API clients that are (indirectly) constructed by the root container.
 *
 * These live outside of ioc.ts so those clients do not need to import the container that imports them (circular import)
 */
export interface RootCommon {
    version: string
    cache: () => MSCache
    mbMap: () => MusicBrainzSingletonMap
    rsMap: () => RockskySingletonMap
    caMap: () => CovertArtSingletonMap
}

let common: RootCommon | undefined;

export const setRootCommon = (items: RootCommon) => {
    common = items;
}

export const getRootCommon = (): RootCommon => {
    if (common === undefined) {
        throw new Error('Root container has not been created yet, call getRoot() from ioc.ts first');
    }
    return common;
}
