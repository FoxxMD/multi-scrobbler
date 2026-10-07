import * as z from "zod";
import { maybeArrayFromStringSchemaCreate } from "../../../utils/ZodUtils.ts";
import type { MusicbrainzApiWrapped } from "./MusicbrainzApi.ts";

export type MusicBrainzSingletonMap = Map<string, MusicbrainzApiWrapped>;

export const MB_RELEASE_STATUSES = z.enum(['official', 'promotion', 'bootleg', 'pseudo-release', 'withdrawn', 'expunged', 'cancelled']);
export type MBReleaseStatus = z.infer<typeof MB_RELEASE_STATUSES>;
export const mBReleaseStatusesSchema = maybeArrayFromStringSchemaCreate(MB_RELEASE_STATUSES, { lower: true });export const mBReleaseStatusSchema = z.string().transform(x => x.trim().toLocaleLowerCase()).pipe(MB_RELEASE_STATUSES);

export const MB_RELEASE_GROUP_PRIMARY_TYPES = z.enum(['album', 'single', 'ep', 'broadcast', 'other']);
export type MBReleaseGroupPrimaryType = z.infer<typeof MB_RELEASE_GROUP_PRIMARY_TYPES>;
export const mBReleasePrimaryGroupTypeSchema = z.string().transform(x => x.trim().toLocaleLowerCase()).pipe(MB_RELEASE_GROUP_PRIMARY_TYPES);
export const mBReleasePrimaryGroupTypesSchema = maybeArrayFromStringSchemaCreate(MB_RELEASE_GROUP_PRIMARY_TYPES, { lower: true });

export const MB_RELEASE_GROUP_SECONDARY_TYPES = z.enum(['compilation', 'soundtrack', 'live', 'remix', 'audiobook']);
export type MBReleaseGroupSecondaryType = z.infer<typeof MB_RELEASE_GROUP_SECONDARY_TYPES>;
export const mBReleaseSecondaryGroupTypeSchema = z.string().transform(x => x.trim().toLocaleLowerCase()).pipe(MB_RELEASE_GROUP_SECONDARY_TYPES);
export const mBReleaseSecondaryGroupTypesSchema = maybeArrayFromStringSchemaCreate(MB_RELEASE_GROUP_SECONDARY_TYPES, { lower: true });

/** based on the Search Fields table of the Release section in the Musicbrainz Seach API docs
 * 
 * @see https://wiki.musicbrainz.org/MusicBrainz_API/Search#Search_Fields_11
 */
export const releaseSearchQueryOpts = z.object({
    /** (part of) the name of any of the release artists  */
    artistname: z.string().array().optional(),
    /** the release's MBID */
    reid: z.string().array().optional(),
    /** (part of) the release's title (diacritics are ignored) */
    release: z.string().optional(),
    /** the MBID of the release group for this release  */
    rgid: z.string().optional()
});

export type ReleaseSearchQueryOpts = z.infer<typeof releaseSearchQueryOpts>;

/** based on the Search Fields table of the Artist section in the Musicbrainz Seach API docs
 * 
 * @see https://wiki.musicbrainz.org/MusicBrainz_API/Search#Artist
 * @see https://wiki.musicbrainz.org/MusicBrainz_API/Search#Search_Fields_3
 */
export const artistSearchQueryOpts = z.object({
    /** (part of) the artist's name (diacritics are ignored) */
    artist: z.string().array().optional(),
    /** (part of) any primary alias attached to the artist (diacritics are ignored)  */
    primary_alias: z.string().array().optional(),
    /** the artist's MBID */
    arid: z.string().array().optional(),
});

export type ArtistSearchQueryOpts = z.infer<typeof artistSearchQueryOpts>;