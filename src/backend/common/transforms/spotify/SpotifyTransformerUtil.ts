import type {
    TransformerCommon,
    TransformOptions,
} from "../../../../core/Atomic.ts";
import type { SpotifyTransformerApiConfigData } from "../../vendor/spotify/SpotifyTypes.ts";
import { MaybeLogger } from "../../MaybeLogger.ts";
import * as z from 'zod';
import { removeUndefinedKeys } from "../../../../core/DataUtils.ts";
import { DEFAULT_TRANSFORMER_ENV_NAME } from "../../../../core/Transform.ts";

export const spotifyMissingTypes = z.enum(['album','title','artists','duration','isrc','ids','art']);
export type SpotifyMissingType = z.infer<typeof spotifyMissingTypes>;
export const DEFAULT_SPOTIFY_MISSING_TYPES: SpotifyMissingType[] = ['album','artists','title','duration'] as const;

export const spotifySearchTypes = z.enum(['isrc','basic']);
export type SpotifySearchType = z.infer<typeof spotifySearchTypes>;

export const DEFAULT_SPOTIFY_SEARCH_ORDER: SpotifySearchType[] = ['isrc', 'basic'];

export interface SpotifyTransformerData {
    searchWhenMissing?: SpotifyMissingType[]
    forceSearch?: boolean
    /** Minimum (0-1) fuzzy match score a candidate must have to be used
     *
     * @default 0.6
     */
    score?: number
    searchOrder?: SpotifySearchType[]
    /** An ISO 3166-1 alpha-2 country code used to bias/limit search results to what is available in this market */
    market?: string
    /**
     * A locale in ISO-639-1_ISO-3166-1 format (EX en_US, ja_JP) used to bias which translation of a localized
     * catalog name (artist/album/track) the Spotify API returns. Support for this is not officially documented
     * by Spotify and results may be inconsistent, but it can be used alongside (or instead of) `market` to try
     * to force names into a specific language.
     */
    locale?: string
    /** Deprioritize (but do not exclude) matches whose album is a compilation when ranking candidates
     *
     * @default false
     */
    deprioritizeCompilations?: boolean

    titleWeight?: number | true
    artistWeight?: number | true
    albumWeight?: number | true
}

export interface SpotifyTransformerDataConfig extends SpotifyTransformerApiConfigData {
}

export type SpotifyTransformerConfig = TransformerCommon<SpotifyTransformerData, SpotifyTransformerDataConfig> & { options?: TransformOptions };

const DEFAULTS_PRESET: SpotifyTransformerData = {
}

const DEFAULTS_ISRC_SEARCH: SpotifyTransformerData = {
    searchOrder: ['isrc']
}

const DEFAULTS_DECOMP: SpotifyTransformerData = {
    deprioritizeCompilations: true
}

const DEFAULTS_MISSING_FIELDS: SpotifyTransformerData = {
    searchWhenMissing: ['album','artists','title','duration']
}
const DEFAULTS_MISSING_ISRC: SpotifyTransformerData = {
    searchWhenMissing: ['isrc']
}
const DEFAULTS_MISSING_IDS: SpotifyTransformerData = {
    searchWhenMissing: ['ids']
}
const DEFAULTS_MISSING_ART: SpotifyTransformerData = {
    searchWhenMissing: ['art']
}

const PRESETS: Record<string, SpotifyTransformerData> = {
    default: DEFAULTS_PRESET,
    searchisrc: DEFAULTS_ISRC_SEARCH,
    decomp: DEFAULTS_DECOMP,
    missingfields: DEFAULTS_MISSING_FIELDS,
    missingids: DEFAULTS_MISSING_IDS,
    missingisrc: DEFAULTS_MISSING_ISRC,
    missingart: DEFAULTS_MISSING_ART
} as const;

export const configFromEnv = (logger: MaybeLogger = new MaybeLogger()): SpotifyTransformerConfig | undefined => {
    const sEnv = process.env.SPOTIFY_TRANSFORM_PRESETS;
    if(sEnv === undefined || sEnv.trim() === '') {
        return undefined;
    }

    const clientId = process.env.SPOTIFY_TRANSFORM_CLIENT_ID ?? process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = process.env.SPOTIFY_TRANSFORM_CLIENT_SECRET ?? process.env.SPOTIFY_CLIENT_SECRET;

    if (clientId === undefined || clientSecret === undefined) {
        logger.warn(`SPOTIFY_TRANSFORM was set but no clientId/clientSecret could be found. Set SPOTIFY_TRANSFORM_CLIENT_ID/SPOTIFY_TRANSFORM_CLIENT_SECRET, or SPOTIFY_CLIENT_ID/SPOTIFY_CLIENT_SECRET if also using the Spotify Source.`);
        return undefined;
    }

    const envConfig: SpotifyTransformerConfig = {
        type: 'spotify',
        name: DEFAULT_TRANSFORMER_ENV_NAME,
        data: {
            clientId,
            clientSecret,
        },
        defaults: removeUndefinedKeys({
            market: process.env.SPOTIFY_TRANSFORM_MARKET,
            locale: process.env.SPOTIFY_TRANSFORM_LOCALE    
        }, false)
    }

    const presets = sEnv.split(',').map(x => x.trim().toLocaleLowerCase());
    const soSet = new Set<SpotifySearchType>();
    const searchMissingSet = new Set<SpotifyMissingType>();
    for (const pName of presets) {
        const p = PRESETS[pName];
        if (p === undefined) {
            logger.warn(`No preset with name '${p}'`);
            continue;
        }
        const { searchOrder = [], searchWhenMissing = [], ...rest } = p;
        envConfig.defaults = {
            ...envConfig.defaults,
            ...rest,
        };
        for (const o of searchOrder) {
            soSet.add(o);
        }
        for(const o of searchWhenMissing) {
            searchMissingSet.add(o);
        }
    }

    if (soSet.size > 0) {
        envConfig.defaults = {...envConfig.defaults, searchOrder: Array.from(soSet)};
    }
    if (searchMissingSet.size > 0) {
        envConfig.defaults = {...envConfig.defaults, searchWhenMissing: Array.from(searchMissingSet)};
    }

    return envConfig;
}
