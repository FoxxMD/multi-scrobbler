import * as z from "zod";
import type { Credit, TrackData } from "./Atomic.ts";
import { compareNormalizedStrings } from "./StringUtils.ts";

export const musicServiceName = z.enum(['spotify', 'musicbrainz', 'youtube', 'jellyfin', 'plex', 'listenbrainz', 'rocksky']);
export type MusicServiceName = z.infer<typeof musicServiceName>;

export const musicServiceBaseSchema = z.object({
    name: musicServiceName,
    image: z.string().optional()
});
export type MusicServiceBase = z.infer<typeof musicServiceBaseSchema>;

export const musicServiceIdBaseSchema = z.object({
    ...musicServiceBaseSchema.shape,
    id: z.string(),
    idType: z.string().optional(),
});
export type MusicServiceIdBase = z.infer<typeof musicServiceIdBaseSchema>;

export const musicServiceMBSchema = z.object({
    ...musicServiceIdBaseSchema.shape,
    name: z.literal(musicServiceName.enum.musicbrainz),
    idHint: z.enum(['recording', 'release', 'track', 'artist', 'release-group']).optional()
});
export type MusicServiceMB = z.infer<typeof musicServiceMBSchema>;
export const musicServiceNonMBSchema = z.object({
    ...musicServiceIdBaseSchema.shape,
    name: musicServiceName.exclude(['musicbrainz']),
});
export type MusicServiceNonMB = z.infer<typeof musicServiceNonMBSchema>;
export const musicServicesSchema = z.discriminatedUnion('name', [musicServiceMBSchema, musicServiceNonMBSchema]);

export type MusicServices = z.infer<typeof musicServicesSchema>;
export type MusicServicesAny = (MusicServices | MusicServiceBase);

export const hasMusicMetadata = (meta: MusicServicesAny[] | undefined, name: MusicServiceName, idType?: string) => getMusicMetadata(meta, name, idType) !== undefined

export const getMusicMetadata = (meta: MusicServicesAny[] = [], name: MusicServiceName, idType?: string) =>
    meta.find(x => x.name === name && (idType === undefined || ('idType' in x && x.idType === idType)))

export type MBIdType = 'recording' | 'release' | 'track' | 'artist' | 'release-group';

/** Build a metadata entry for a service id. Returns undefined if there is no id so it can be passed straight to `withMetadata` */
export const serviceMeta = (name: MusicServiceName, id: string | null | undefined, idType?: string): MusicServices | undefined => {
    if (id === undefined || id === null || id === '') {
        return undefined;
    }
    return (idType === undefined ? { name, id } : { name, id, idType }) as MusicServices;
}
export const mbMeta = (id: string | null | undefined, idType: MBIdType) => serviceMeta('musicbrainz', id, idType);
export const spotifyMeta = (id: string | null | undefined, idType: 'track' | 'album' | 'artist') => serviceMeta('spotify', id, idType);

const sameMeta = (a: MusicServices, b: MusicServices) => a.name === b.name && a.idType === b.idType;

/** Add metadata entries to a credit, replacing any existing entry for the same service + idType. Undefined entries are ignored. */
export function withMetadata(credit: Credit, ...entries: (MusicServices | undefined)[]): Credit;
// eslint-disable-next-line no-redeclare
export function withMetadata(credit: Credit | undefined, ...entries: (MusicServices | undefined)[]): Credit | undefined;
// eslint-disable-next-line no-redeclare
export function withMetadata(credit: Credit | undefined, ...entries: (MusicServices | undefined)[]): Credit | undefined {
    const valid = entries.filter(x => x !== undefined);
    if (credit === undefined || valid.length === 0) {
        return credit;
    }
    const existing = (credit.metadata ?? []).filter(x => !valid.some(y => sameMeta(x, y)));
    return { ...credit, metadata: [...existing, ...valid] };
}

/** Set the image on a credit, if both exist */
export function withImage(credit: Credit, image: string | null | undefined): Credit;
// eslint-disable-next-line no-redeclare
export function withImage(credit: Credit | undefined, image: string | null | undefined): Credit | undefined;
// eslint-disable-next-line no-redeclare
export function withImage(credit: Credit | undefined, image: string | null | undefined): Credit | undefined {
    if (credit === undefined || image === undefined || image === null || image === '') {
        return credit;
    }
    return { ...credit, image };
}

/** Set album art for a play. If the play has no album the image is set on the track instead so it is not lost. */
export const withAlbumArt = <T extends Pick<TrackData, 'track' | 'album'>>(data: T, image: string | null | undefined): T => {
    if (data.album !== undefined) {
        return { ...data, album: withImage(data.album, image) };
    }
    return { ...data, track: withImage(data.track, image) };
}

/** Get the id for a service (and idType) from a credit */
export const creditId = (credit: Credit | undefined, name: MusicServiceName, idType?: string): string | undefined => {
    const m = getMusicMetadata(credit?.metadata, name, idType);
    return m !== undefined && 'id' in m ? m.id : undefined;
}
export const creditMbid = (credit: Credit | undefined, idType: MBIdType) => creditId(credit, 'musicbrainz', idType);

/** Get the ids for a service from all credits that have one */
export const creditIds = (credits: Credit[] = [], name: MusicServiceName, idType?: string): string[] =>
    credits.map(x => creditId(x, name, idType)).filter(x => x !== undefined);

/**
 * Attach service ids to credits by position.
 *
 * Ids are only attached if there is exactly one id per credit, otherwise we can't know which id belongs to which credit and they are dropped.
 */
export const creditsWithIds = (credits: Credit[], ids: (string | null | undefined)[] | undefined, name: MusicServiceName, idType?: string): Credit[] => {
    if (ids === undefined || ids.length !== credits.length) {
        return credits;
    }
    return credits.map((x, i) => withMetadata(x, serviceMeta(name, ids[i], idType)));
}

/** Combine an existing credit with a newer version of it. The newer name and image win, metadata from both is kept. */
export const mergeCredit = (base: Credit | undefined, next: Credit): Credit => {
    if (base === undefined) {
        return next;
    }
    return withImage(withMetadata({ ...base, name: next.name }, ...(next.metadata ?? [])), next.image);
}

/**
 * Replace a list of credits with a newer list, keeping metadata from any existing credit with the same name
 */
export const mergeCredits = (base: Credit[] = [], next: Credit[]): Credit[] =>
    next.map(x => mergeCredit(base.find(y => y.name === x.name), x));

/** Minimum `compareNormalizedStrings` score for two credit names to be considered the same credit */
const CREDIT_NAME_MATCH_SCORE = 90;

/**
 * Add metadata `from` credits to `base` credits without changing the names of base credits
 *
 * Metadata is only added when we know which credit it belongs to: each base credit takes metadata from the most similarly named `from` credit.
 * If no names match at all, and the lists are the same length, credits are matched by position instead.
 */
export const mergeCreditsMetadata = (base: Credit[], from: Credit[] = []): Credit[] => {
    const remaining = [...from];
    const matches = base.map(x => {
        let bestIndex = -1,
            bestScore = -1;
        remaining.forEach((y, i) => {
            const score = compareNormalizedStrings(x.name, y.name).highScore;
            if (score >= CREDIT_NAME_MATCH_SCORE && score > bestScore) {
                bestIndex = i;
                bestScore = score;
            }
        });
        // a `from` credit can only be matched to one base credit
        return bestIndex === -1 ? undefined : remaining.splice(bestIndex, 1)[0];
    });
    const byPosition = base.length === from.length && matches.every(x => x === undefined);
    return base.map((x, i) => withMetadata(x, ...((byPosition ? from[i] : matches[i])?.metadata ?? [])));
}

/** All images found on the track, album, and artists of a play */
export const playImages = (data: Pick<TrackData, 'track' | 'album' | 'artists'>): string[] =>
    [data.track, data.album, ...(data.artists ?? [])].map(x => x?.image).filter(x => x !== undefined);

/** The first image found on the track, album, or artists of a play, in that order unless otherwise specified */
export const playImage = (data: Pick<TrackData, 'track' | 'album' | 'artists'>, order: ('track' | 'album' | 'artist')[] = ['track', 'album', 'artist']): string | undefined => {
    const images = {
        track: data.track?.image,
        album: data.album?.image,
        artist: data.artists?.find(x => x.image !== undefined)?.image
    };
    return order.map(x => images[x]).find(x => x !== undefined);
}

/** Credit with only the name -- no image or metadata */
export const stripCredit = (credit: Credit): Credit => ({ name: credit.name });

/** Reduce all credits in track data to only their names */
export const stripCredits = <T extends Pick<TrackData, 'track' | 'album' | 'artists' | 'albumArtists'>>(data: T): T => {
    const stripped = { ...data };
    if (data.track !== undefined) {
        stripped.track = stripCredit(data.track);
    }
    if (data.album !== undefined) {
        stripped.album = stripCredit(data.album);
    }
    if (data.artists !== undefined) {
        stripped.artists = data.artists.map(stripCredit);
    }
    if (data.albumArtists !== undefined) {
        stripped.albumArtists = data.albumArtists.map(stripCredit);
    }
    return stripped;
}
