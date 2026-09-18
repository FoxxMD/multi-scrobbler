import type { MissingMbidType, TransformerCommon, TransformOptions } from "../../../../core/Atomic.ts";
import type { MusicbrainzApiConfigData } from "../../infrastructure/Atomic.ts";
import { MaybeLogger } from "../../MaybeLogger.ts";

export interface MusicbrainzTransformerDataConfig {
    apis: MusicbrainzApiConfigData[];
}

export type MusicbrainzTransformerConfig = TransformerCommon<MusicbrainzTransformerData, MusicbrainzTransformerDataConfig> & {options?: TransformOptions & {logUrl?: boolean}}

export type SearchType = 'freetext' | 'album' | 'artist' | 'basic' | 'basicorids' | 'isrc' | 'mbidrecording';

export const DEFAULT_SEARCHTYPE_ORDER: SearchType[] = ['isrc', 'basic'];

export interface MusicbrainzTransformerData {
    searchWhenMissing?: MissingMbidType[];
    forceSearch?: boolean;
    score?: number;
    fallbackArtistSearch?: ('naive' | 'native');
    fallbackFreeText?: boolean;
    fallbackAlbumSearch?: boolean;
    logPreMbid?: boolean;
    searchOrder?: SearchType[];
    searchArtistMethod?: ('naive' | 'native');

    /** Ignore album artist if it is "Various Artists"
     *
     * @default true
     */
    ignoreVA?: boolean;

    /** Allow only releases with release groups with these primary types
     *
     * @see https://wiki.musicbrainz.org/Release_Group/Type#Primary_types
    */
    releaseGroupPrimaryTypeAllow?: string[];
    /** Filter out any releases with release groups with these primary types
     *
     * @see https://wiki.musicbrainz.org/Release_Group/Type#Primary_types
    */
    releaseGroupPrimaryTypeDeny?: string[];
    /** Prioritise releases to use based on the order of these release group types
      *
      * @see https://wiki.musicbrainz.org/Release_Group/Type#Primary_types
     */
    releaseGroupPrimaryTypePriority?: string[];

    /** Allow only releases with release groups with these secondary types
     *
     * @see https://wiki.musicbrainz.org/Release_Group/Type#Secondary_types
    */
    releaseGroupSecondaryTypeAllow?: string[];
    /** Filter out any releases with release groups with these secondary types
     *
     * @see https://wiki.musicbrainz.org/Release_Group/Type#Secondary_types
    */
    releaseGroupSecondaryTypeDeny?: string[];
    /** Prioritise releases to use based on the order of these release group secondary types
     *
     * @see https://wiki.musicbrainz.org/Release_Group/Type#Secondary_types
    */
    releaseGroupSecondaryTypePriority?: string[];

    /** Allow only releases with these statuses
     *
     * @see https://wiki.musicbrainz.org/Release#Status
    */
    releaseStatusAllow?: string[];
    /** Filter out any releases with these statuses
     *
     * @see https://wiki.musicbrainz.org/Release#Status
    */
    releaseStatusDeny?: string[];
    /** Prioritise releases to used based on the order of these statuses
     *
     * @see https://wiki.musicbrainz.org/Release#Status
    */
    releaseStatusPriority?: string[];

    /** Allow only releases from these ISO2 countries
 *
 * @see https://beta.musicbrainz.org/doc/Release/Country
*/
    releaseCountryAllow?: string[];
    /** Filter out any releases rom these ISO2 countries
     *
     * @see https://beta.musicbrainz.org/doc/Release/Country
    */
    releaseCountryDeny?: string[];
    /** Prioritise releases to used based on the order of these ISO2 countries
     *
     * @see https://beta.musicbrainz.org/doc/Release/Country
    */
    releaseCountryPriority?: string[];

    /** Do not filter out a recording if it initially has no releases
     *
     * Use in conjunction with release filters by setting to `true`
     * to prevent recordings from being filtered out solely becauase they don't have any releases to begin with
     *
     */
    releaseAllowEmpty?: boolean;

    titleWeight?: number | true;
    artistWeight?: number | true;
    albumWeight?: number | true;
}

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

export const PRESETS: Record<string, MusicbrainzTransformerData> = {
    default: DEFAULTS_PRESET,
    sensible: DEFAULTS_SENSIBLE,
    native: DEFAULTS_NATIVE,
    aggressive: DEFAULTS_AGGRESSIVE,
    fields: DEFAULTS_FIELDS_BIAS,
    'id': DEFAULTS_ID
};

export const configFromEnv = (logger: MaybeLogger = new MaybeLogger()) => {
    const mbEnv = process.env.MB_PRESETS;
    let mbConfig: MusicbrainzTransformerConfig;
    if (mbEnv !== undefined && mbEnv.trim() !== '') {
        mbConfig = {
            type: 'musicbrainz',
            name: 'MSDefault',
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
        const soSet = new Set<SearchType>();
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
            mbConfig.defaults.searchOrder = Array.from(soSet);
        }
        logger.debug(`Using presets: ${presets.join(',')}`);
    }

    return mbConfig;
};