import * as z from "zod";
import { MaybeLogger } from "../../MaybeLogger.ts";
import type { RockskyTransformerConfig, RockskyTransformerData } from "../../vendor/rocksky/interfaces.ts";

export const configFromEnv = (logger: MaybeLogger = new MaybeLogger()) => {
    const rsEnv = process.env.RS_PRESETS;
    let rsConfig: RockskyTransformerConfig;
    if (rsEnv !== undefined && rsEnv.trim() !== '') {
        rsConfig = {
            type: 'rocksky',
            name: 'MSRockskyDefault',
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
        const soSet = new Set<SearchType>();
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
            rsConfig.defaults.searchOrder = Array.from(soSet);
        }
        logger.debug(`Using presets: ${presets.join(',')}`);
    }

    return rsConfig;
}

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
    "searchOrder": ["isrc", "basic"]
};

export const DEFAULTS_ID: RockskyTransformerData = {
    "searchOrder": ["isrc", "mbid", "basicorids", "basic"]
};

export const PRESETS: Record<string, RockskyTransformerData> = {
    default: DEFAULTS_PRESET,
    sensible: DEFAULTS_ID,
    native: DEFAULTS_NATIVE,
    fields: { ...DEFAULTS_FIELDS_BIAS, ...DEFAULTS_PRESET },
    'id': DEFAULTS_ID
};
export const searchType = z.enum(['basic', 'basicorids', 'mbid', 'isrc', 'artist']);export type SearchType = z.infer<typeof searchType>;

