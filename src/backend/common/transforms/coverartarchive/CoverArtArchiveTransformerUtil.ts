import * as z from "zod";
import { MaybeLogger } from "../../MaybeLogger.ts";
import type { PlayObject, TransformerCommon, TransformOptions } from "../../../../core/Atomic.ts";
import { caaArtType, thumbSizes, type CovertArtApiClientConfig } from "../../vendor/musicbrainz/CoverArtApiTypes.ts";
import { DEFAULT_TRANSFORMER_ENV_NAME } from "../../../../core/Transform.ts";

export const caaMissingTypes = z.enum(['album']);
export type CAAMissingType = z.infer<typeof caaMissingTypes>;
export const caaSizesConfig = z.enum([...thumbSizes.options, 'any']);
export type CAASizesConfig = z.infer<typeof caaSizesConfig>;
export const caaAllowedTypesConfig = z.enum([...caaArtType.options, 'any']);
export type CAAAllowedTypesConfig = z.infer<typeof caaAllowedTypesConfig>;

export const coverArtArchiveTransformDataSchema = z.object({
    searchWhenMissing: z.union([z.literal(true),caaMissingTypes.array()]).optional(),
    allowedTypes: caaAllowedTypesConfig.array().optional(),
    allowedSizes: caaSizesConfig.array().optional(),
    preferredSizes: thumbSizes.array().optional(),
    forceSearch: z.boolean().optional(),
});
export type CoverArtArchiveTransformData = z.infer<typeof coverArtArchiveTransformDataSchema>;

export type CovertArtArchiveTransformerConfig = TransformerCommon<CoverArtArchiveTransformData, CovertArtApiClientConfig> & { options?: TransformOptions };

export const configFromEnv = (logger: MaybeLogger = new MaybeLogger()) => {
    const transformEnv = process.env.CAA_PRESETS;
    let tConfig: CovertArtArchiveTransformerConfig | undefined;
    if (transformEnv !== undefined && transformEnv.trim() !== '') {
        tConfig = {
            type: 'coverartarchive',
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
        const presets = transformEnv.split(',').map(x => x.trim().toLocaleLowerCase());
        for (const pName of presets) {
            const p = PRESETS[pName];
            if (p === undefined) {
                logger.warn(`No preset with name '${p}'`);
                continue;
            }
            tConfig.defaults = {
                ...tConfig.defaults,
                ...p,
            };
        }
        logger.debug(`Using presets: ${presets.join(',')}`);
    }

    return tConfig;
}

export const DEFAULTS_PRESET: CoverArtArchiveTransformData = {
    searchWhenMissing: true,
    allowedTypes: ['front']
};

export const DEFAULTS_ANY: CoverArtArchiveTransformData = {
    searchWhenMissing: true,
    allowedTypes: ['any']
};

export const PRESETS: Record<string, CoverArtArchiveTransformData> = {
    default: DEFAULTS_PRESET,
    any: DEFAULTS_ANY,
};

export const hasArtFields = (play: PlayObject): CAAMissingType[] => {
    const t: CAAMissingType[] = [];
    if(play.meta.art?.album !== undefined) {
        t.push('album');
    }
    // if(play.meta.art?.artist !== undefined) {
    //     t.push('artist');
    // }
    // if(play.meta.art?.track !== undefined) {
    //     t.push('track');
    // }
    return t;
}