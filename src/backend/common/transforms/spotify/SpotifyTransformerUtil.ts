import type {
    TransformerCommon,
    TransformOptions,
} from "../../../../core/Atomic.ts";
import type { SpotifyTransformerApiConfigData } from "../../vendor/spotify/SpotifyTypes.ts";
import { MaybeLogger } from "../../MaybeLogger.ts";
import * as z from 'zod';
import { removeUndefinedKeys } from "../../../../core/DataUtils.ts";
import { applyTermSchema, buildRulesSchema, buildStageSchema, DEFAULT_TRANSFORMER_ENV_NAME } from "../../../../core/Transform.ts";

export const spotifyMissingTypes = z.enum(['album','title','artists','duration','isrc','ids','art']);
export type SpotifyMissingType = z.infer<typeof spotifyMissingTypes>;
export const DEFAULT_SPOTIFY_MISSING_TYPES: SpotifyMissingType[] = ['album','artists','title','duration'] as const;

export const spotifySearchTypes = z.enum(['isrc','basic']);
export type SpotifySearchType = z.infer<typeof spotifySearchTypes>;

export const DEFAULT_SPOTIFY_SEARCH_ORDER: SpotifySearchType[] = ['isrc', 'basic'];

/** Spotify Stage options. Used for transformer `defaults` and for overrides in a Stage. Values are normalized by `parseStageConfig` */
export const spotifyStageOptionsSchema = z.object({
    searchWhenMissing: z.array(z.string()).optional().meta({description: `Search if Play is missing any of: ${spotifyMissingTypes.options.join(', ')}`}),
    forceSearch: z.boolean().optional().meta({description: 'Always search, even if nothing is missing'}),
    score: z.number().optional().meta({description: 'Minimum match score (0-1). Default 0.6'}),
    searchOrder: z.union([z.string(), z.array(z.string())]).optional().meta({description: `Search methods, in order. Any of: ${spotifySearchTypes.options.join(', ')}`}),
    market: z.string().optional().meta({description: 'ISO 3166-1 alpha-2 country code to limit results to'}),
    locale: z.string().optional().meta({description: 'Locale (EX en_US) to bias localized names. Unofficial'}),
    deprioritizeCompilations: z.boolean().optional().meta({description: 'Rank compilation album matches lower. Default false'}),
    titleWeight: z.union([z.number(), z.literal(true)]).optional().meta({description: 'Weight of title when ranking matches'}),
    artistWeight: z.union([z.number(), z.literal(true)]).optional().meta({description: 'Weight of artist when ranking matches'}),
    albumWeight: z.union([z.number(), z.literal(true)]).optional().meta({description: 'Weight of album when ranking matches'}),
});

export type SpotifyTransformerData = z.input<typeof spotifyStageOptionsSchema>;

export const spotifyStageSchema = buildStageSchema(
    'spotify',
    buildRulesSchema(applyTermSchema, {title: true, artists: true, albumArtists: true, album: true, duration: true, meta: true, art: true}),
    spotifyStageOptionsSchema
).meta({title: 'Spotify Stage'});

export type SpotifyStage = z.output<typeof spotifyStageSchema>;

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
    const soSet = new Set<string>();
    const searchMissingSet = new Set<string>();
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
