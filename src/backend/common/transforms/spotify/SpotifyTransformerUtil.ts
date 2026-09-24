import type {
    TransformerCommon,
    TransformOptions,
} from "../../../../core/Atomic.ts";
import type { SpotifyTransformerApiConfigData } from "../../vendor/spotify/SpotifyTypes.ts";
import { MaybeLogger } from "../../MaybeLogger.ts";
import * as z from 'zod';

export const spotifyMissingTypes = z.enum(['album','title','artists','duration','isrc','ids']);
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
    /** A locale (EX en_US, ja_JP) used to try to bias which translation of a localized catalog name
     * (artist/album/track) the Spotify API returns. Not officially documented by Spotify -- results may be
     * inconsistent -- but can be used alongside (or instead of) `market` to try to force names into a
     * specific language.
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

export const configFromEnv = (logger: MaybeLogger = new MaybeLogger()): SpotifyTransformerConfig | undefined => {
    const enabled = process.env.SPOTIFY_TRANSFORM;
    if (enabled === undefined || enabled.trim() === '' || enabled.trim().toLocaleLowerCase() === 'false') {
        return undefined;
    }

    const clientId = process.env.SPOTIFY_TRANSFORM_CLIENT_ID ?? process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = process.env.SPOTIFY_TRANSFORM_CLIENT_SECRET ?? process.env.SPOTIFY_CLIENT_SECRET;

    if (clientId === undefined || clientSecret === undefined) {
        logger.warn(`SPOTIFY_TRANSFORM was set but no clientId/clientSecret could be found. Set SPOTIFY_TRANSFORM_CLIENT_ID/SPOTIFY_TRANSFORM_CLIENT_SECRET, or SPOTIFY_CLIENT_ID/SPOTIFY_CLIENT_SECRET if also using the Spotify Source.`);
        return undefined;
    }

    const deprioritizeCompilations = (process.env.SPOTIFY_TRANSFORM_DEPRIORITIZE_COMPILATIONS ?? '').trim().toLocaleLowerCase() === 'true';

    return {
        type: 'spotify',
        name: 'MSDefault',
        data: {
            clientId,
            clientSecret,
            market: process.env.SPOTIFY_TRANSFORM_MARKET,
            locale: process.env.SPOTIFY_TRANSFORM_LOCALE
        },
        defaults: {
            ...(deprioritizeCompilations ? { deprioritizeCompilations } : {})
        }
    };
}
