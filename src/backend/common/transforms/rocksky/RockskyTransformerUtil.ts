import { MaybeLogger } from "../../MaybeLogger.ts";
import { type RockskyApiClientConfig, type SearchType, searchType } from "../../vendor/rocksky/interfaces.ts";
import { applyTermSchema, buildRulesSchema, buildStageSchema, DEFAULT_TRANSFORMER_ENV_NAME, type TransformerCommon, type TransformOptions } from "../../../../core/Transform.ts";
import { rockskyMissingFields } from "../../../../core/Atomic.ts";
import * as z from 'zod';

/** Rocksky Stage options. Used for transformer `defaults` and for overrides in a Stage. Values are normalized by `parseStageConfig` */
export const rockskyStageOptionsSchema = z.object({
    searchWhenMissing: z.array(rockskyMissingFields).optional().meta({description: `Search if Play is missing any of: ${rockskyMissingFields.options.join(', ')}`}),
    forceSearch: z.boolean().optional().meta({description: 'Always search, even if nothing is missing'}),
    score: z.number().optional().meta({description: 'Minimum match score (0-100). Default 90'}),
    allowNoMatch: z.boolean().optional().meta({description: 'Do not fail if no match is found'}),
    searchOrder: z.array(z.string()).optional().meta({description: `Search methods, in order. Any of: ${searchType.options.join(', ')}`}),
    searchArtistMethod: z.enum(['naive', 'native']).optional().meta({description: "Artist parsing for 'artist' search. Default native"}),
});

export type RockskyTransformerData = z.input<typeof rockskyStageOptionsSchema>;

export type RockskyTransformerConfig = TransformerCommon & { defaults?: RockskyTransformerData, data?: RockskyApiClientConfig, options?: TransformOptions & { logUrl?: boolean } };

export const rockskyStageSchema = buildStageSchema(
    'rocksky',
    buildRulesSchema(applyTermSchema, {title: true, artists: true, albumArtists: true, album: true, duration: true, meta: true, art: true}),
    rockskyStageOptionsSchema
).meta({title: 'Rocksky Stage'});

export type RockskyStage = z.output<typeof rockskyStageSchema>;

export const configFromEnv = (logger: MaybeLogger = new MaybeLogger()) => {
    const rsEnv = process.env.RS_PRESETS;
    let rsConfig: RockskyTransformerConfig | undefined;
    if (rsEnv !== undefined && rsEnv.trim() !== '') {
        rsConfig = {
            type: 'rocksky',
            name: DEFAULT_TRANSFORMER_ENV_NAME,
            data: {
                apis: [
                    {
                        enable: true
                    }
                ]
            },
            defaults: {}
        };
        const presets = rsEnv.split(',').map(x => x.trim().toLocaleLowerCase());
        const soSet = new Set<string>();
        for (const pName of presets) {
            const p = PRESETS[pName];
            if (p === undefined) {
                logger.warn(`No preset with name '${p}'`);
                continue;
            }
            const { searchOrder = [], ...rest } = p;
            rsConfig.defaults = {
                ...rsConfig.defaults,
                ...rest,
            };
            for (const o of searchOrder) {
                soSet.add(o);
            }
        }

        if (soSet.size > 0) {
            rsConfig.defaults = {...rsConfig.defaults, searchOrder: Array.from(soSet)};
        }
        logger.debug(`Using presets: ${presets.join(',')}`);
    }

    return rsConfig;
}

export const DEFAULT_ROCKSKY_SEARCH_ORDER: SearchType[] = ["isrc","basic"] 

export const DEFAULTS_NATIVE: RockskyTransformerData = {
    "searchArtistMethod": "native",
    "searchOrder": ["artist"]
};

export const DEFAULTS_FIELDS_BIAS = {
    "titleWeight": 0.33,
    "albumWeight": 0.33,
    "artistWeight": 0.33
};

export const DEFAULTS_PRESET: RockskyTransformerData = {
    "searchOrder": DEFAULT_ROCKSKY_SEARCH_ORDER
};

export const DEFAULTS_ID: RockskyTransformerData = {
    "searchOrder": ["isrc", "mbid", "basic"]
};

export const PRESETS: Record<string, RockskyTransformerData> = {
    default: DEFAULTS_PRESET,
    sensible: DEFAULTS_ID,
    native: DEFAULTS_NATIVE,
    'id': DEFAULTS_ID
};
