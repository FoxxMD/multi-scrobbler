import type { MusicbrainzApiConfigData } from "../../infrastructure/Atomic.ts";
import { MaybeLogger } from "../../MaybeLogger.ts";
import { applyTermSchema, buildRulesSchema, buildStageSchema, DEFAULT_TRANSFORMER_ENV_NAME, type TransformerCommon, type TransformOptions } from "../../../../core/Transform.ts";
import { mBReleasePrimaryGroupTypesSchema, mBReleaseSecondaryGroupTypesSchema, mBReleaseStatusesSchema } from "../../vendor/musicbrainz/MusicbrainzTypes.ts";
import { maybeStringLowerArrayFromString } from "../../../utils/ZodUtils.ts";
import * as z from 'zod';

export interface MusicbrainzTransformerDataConfig {
    apis: MusicbrainzApiConfigData[];
}

export type MusicbrainzTransformerConfig = TransformerCommon & { defaults?: MusicbrainzTransformerData, data?: MusicbrainzTransformerDataConfig, options?: TransformOptions & {logUrl?: boolean} }

export type SearchType = 'freetext' | 'album' | 'artist' | 'basic' | 'basicorids' | 'isrc' | 'mbidrecording';

export const DEFAULT_SEARCHTYPE_ORDER: SearchType[] = ['isrc', 'basic'];

const searchArtistMethodSchema = z.enum(['naive', 'native']);

/** Musicbrainz Stage options. Used for transformer `defaults` and for overrides in a Stage. Values are normalized by `parseStageConfig` */
export const musicbrainzStageOptionsSchema = z.object({
    searchWhenMissing: z.array(z.string()).optional().meta({description: 'Search if Play is missing any of: artists, title, album, duration'}),
    forceSearch: z.boolean().optional().meta({description: 'Always search, even if nothing is missing'}),
    score: z.number().optional().meta({description: 'Minimum match score (0-100). Default 90'}),
    fallbackArtistSearch: searchArtistMethodSchema.optional().meta({description: "DEPRECATED. Use searchOrder 'artist'", deprecated: true}),
    fallbackFreeText: z.boolean().optional().meta({description: "DEPRECATED. Use searchOrder 'freetext'", deprecated: true}),
    fallbackAlbumSearch: z.boolean().optional().meta({description: "DEPRECATED. Use searchOrder 'album'", deprecated: true}),
    logPreMbid: z.boolean().optional().meta({description: 'Log MBIDs Play has before searching'}),
    searchOrder: z.array(z.string()).optional().meta({description: 'Search methods, in order. Any of: isrc, mbidrecording, basicorids, basic, artist, album, freetext'}),
    searchArtistMethod: searchArtistMethodSchema.optional().meta({description: "Artist parsing for 'artist' search. Default native"}),
    ignoreVA: z.boolean().optional().meta({description: "Ignore 'Various Artists' album artist. Default true"}),

    releaseGroupPrimaryTypeAllow: mBReleasePrimaryGroupTypesSchema.optional().meta({description: 'Only allow releases with these release group primary types'}),
    releaseGroupPrimaryTypeDeny: mBReleasePrimaryGroupTypesSchema.optional().meta({description: 'Deny releases with these release group primary types'}),
    releaseGroupPrimaryTypePriority: mBReleasePrimaryGroupTypesSchema.optional().meta({description: 'Prioritize releases by these release group primary types, in order'}),

    releaseGroupSecondaryTypeAllow: mBReleaseSecondaryGroupTypesSchema.optional().meta({description: 'Only allow releases with these release group secondary types'}),
    releaseGroupSecondaryTypeDeny: mBReleaseSecondaryGroupTypesSchema.optional().meta({description: 'Deny releases with these release group secondary types. Default audiobook'}),
    releaseGroupSecondaryTypePriority: mBReleaseSecondaryGroupTypesSchema.optional().meta({description: 'Prioritize releases by these release group secondary types, in order'}),

    releaseStatusAllow: mBReleaseStatusesSchema.optional().meta({description: 'Only allow releases with these statuses'}),
    releaseStatusDeny: mBReleaseStatusesSchema.optional().meta({description: 'Deny releases with these statuses'}),
    releaseStatusPriority: mBReleaseStatusesSchema.optional().meta({description: 'Prioritize releases by these statuses, in order'}),

    releaseCountryAllow: maybeStringLowerArrayFromString.optional().meta({description: 'Only allow releases from these ISO2 countries'}),
    releaseCountryDeny: maybeStringLowerArrayFromString.optional().meta({description: 'Deny releases from these ISO2 countries'}),
    releaseCountryPriority: maybeStringLowerArrayFromString.optional().meta({description: 'Prioritize releases by these ISO2 countries, in order'}),

    releaseAllowEmpty: z.boolean().optional().meta({description: 'Keep recordings that have no releases'}),
    allowMusicVideo: z.boolean().optional().meta({description: 'Allow music video recordings. Default false'}),

    titleWeight: z.union([z.number(), z.literal(true)]).optional().meta({description: 'Weight of title when ranking matches'}),
    artistWeight: z.union([z.number(), z.literal(true)]).optional().meta({description: 'Weight of artist when ranking matches'}),
    albumWeight: z.union([z.number(), z.literal(true)]).optional().meta({description: 'Weight of album when ranking matches'}),
});

export type MusicbrainzTransformerData = z.input<typeof musicbrainzStageOptionsSchema>;

export const musicbrainzStageSchema = buildStageSchema(
    'musicbrainz',
    buildRulesSchema(applyTermSchema, {title: true, artists: true, albumArtists: true, album: true, duration: true, meta: true}),
    musicbrainzStageOptionsSchema
).meta({title: 'Musicbrainz Stage'});

export type MusicbrainzStage = z.output<typeof musicbrainzStageSchema>;

export const DEFAULTS_SENSIBLE: MusicbrainzTransformerData = {
    // use official release over anything else
    "releaseStatusPriority": ["official"],
    // prefer album, then single, then ep
    "releaseGroupPrimaryTypePriority": ["album", "single", "ep"],
    // prefer worldwide release
    "releaseCountryPriority": ["XW"]
};

export const DEFAULTS_NATIVE: MusicbrainzTransformerData = {
    "searchArtistMethod": "native",
    "searchOrder": ["artist"]
};

export const DEFAULTS_AGGRESSIVE: MusicbrainzTransformerData = {
    "searchOrder": ["freetext"]
};

export const DEFAULTS_FIELDS_BIAS = {
    "titleWeight": 0.33,
    "albumWeight": 0.33,
    "artistWeight": 0.33
};

export const DEFAULTS_PRESET: MusicbrainzTransformerData = {
    "searchOrder": ["isrc", "basic"]
};

export const DEFAULTS_ID: MusicbrainzTransformerData = {
    "searchOrder": ["isrc", "mbidrecording", "basicorids", "basic"]
};

export const DEFAULTS_MUSIC_VIDEO: MusicbrainzTransformerData = {
    allowMusicVideo: true
};

export const DEFAULTS_AUDIOBOOK: MusicbrainzTransformerData = {
    releaseGroupSecondaryTypeDeny: []
};

export const PRESETS: Record<string, MusicbrainzTransformerData> = {
    default: DEFAULTS_PRESET,
    sensible: DEFAULTS_SENSIBLE,
    native: DEFAULTS_NATIVE,
    aggressive: DEFAULTS_AGGRESSIVE,
    fields: DEFAULTS_FIELDS_BIAS,
    musicvideo: DEFAULTS_MUSIC_VIDEO,
    audiobook: DEFAULTS_AUDIOBOOK,
    'id': DEFAULTS_ID
};

export const configFromEnv = (logger: MaybeLogger = new MaybeLogger()) => {
    const mbEnv = process.env.MB_PRESETS;
    let mbConfig: MusicbrainzTransformerConfig | undefined;
    if (mbEnv !== undefined && mbEnv.trim() !== '') {
        mbConfig = {
            type: 'musicbrainz',
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
        const presets = mbEnv.split(',').map(x => x.trim().toLocaleLowerCase());
        const soSet = new Set<string>();
        for (const pName of presets) {
            const p = PRESETS[pName];
            if (p === undefined) {
                logger.warn(`No preset with name '${p}'`);
                continue;
            }
            const { searchOrder = [], ...rest } = p;
            mbConfig.defaults = {
                ...mbConfig.defaults,
                ...rest,
            };
            for (const o of searchOrder) {
                soSet.add(o);
            }
        }

        if (soSet.size > 0) {
            mbConfig.defaults = {...mbConfig.defaults, searchOrder: Array.from(soSet)};
        }
        logger.debug(`Using presets: ${presets.join(',')}`);
    }

    return mbConfig;
};