import * as z from "zod";
import { SCROBBLE_TS_SOC_END, SCROBBLE_TS_SOC_START, type AmbPlayObject, type Credit, type ScrobbleTsSOC, type TrackData, type TrackStringOptions } from "./Atomic.ts";
import { compareNormalizedStrings, defaultBuildTrackStringTransformers } from "./StringUtils.ts";
import { removeUndefinedKeys } from "./DataUtils.ts";
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";

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

/** Which parts of an incoming credit should be applied to an existing credit */
export interface CreditRules {
    /** Use the incoming name */
    name: boolean
    /** Use the incoming metadata (service ids) */
    meta: boolean
    /** Use the incoming image */
    art: boolean
}

/**
 * Apply the allowed parts of an incoming credit to an existing credit
 *
 * * Existing metadata is kept unless the credit is renamed without `meta`, since the existing ids may not identify the new name
 * * Incoming metadata replaces existing metadata for the same service + idType, metadata for other services is kept
 * * Existing image is kept unless replaced by an incoming image
 */
export const resolveCredit = (existing: Credit | undefined, incoming: Credit | undefined, rules: CreditRules): Credit | undefined => {
    const { name, meta, art } = rules;
    if (incoming === undefined) {
        return name ? undefined : existing;
    }
    if (existing === undefined && !name) {
        // nothing to attach metadata or image to
        return undefined;
    }
    const renamed = name && existing !== undefined && existing.name !== incoming.name;
    let credit: Credit = { name: name ? incoming.name : existing!.name };
    if ((meta || !renamed) && existing?.metadata !== undefined) {
        credit.metadata = existing.metadata;
    }
    if (meta) {
        credit = withMetadata(credit, ...(incoming.metadata ?? []));
    }
    return withImage(withImage(credit, existing?.image), art ? incoming.image : undefined);
}

/**
 * Apply the allowed parts of incoming credits to existing credits
 *
 * * When names are not used, metadata is matched to existing credits using `mergeCreditsMetadata` and only the first credit takes an image
 * * When names are used the incoming list replaces the existing list
 *   * If the names are unchanged each credit is resolved against the existing credit in the same position
 *   * Otherwise an existing credit with the same name keeps its image, and its metadata only if `meta` is used
 */
export const resolveCredits = (existing: Credit[] | undefined, incoming: Credit[] | undefined, rules: CreditRules): Credit[] | undefined => {
    const { name, meta, art } = rules;
    if (incoming === undefined) {
        return name ? undefined : existing;
    }
    if (!name) {
        if (existing === undefined) {
            return undefined;
        }
        const credits = meta ? mergeCreditsMetadata(existing, incoming) : existing;
        return art && credits.length > 0 ? [withImage(credits[0], incoming[0]?.image), ...credits.slice(1)] : credits;
    }
    const base = existing ?? [];
    if (base.length === incoming.length && base.every((x, i) => x.name === incoming[i].name)) {
        return incoming.map((x, i) => resolveCredit(base[i], x, rules)!);
    }
    return incoming.map(x => {
        const match = base.find(y => y.name === x.name);
        return resolveCredit(meta || match === undefined ? match : { name: match.name, image: match.image }, x, rules)!;
    });
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
};

export const namesToCredits = (names: (string | Partial<Credit>)[] | undefined): Credit[] => {
    if (names === undefined) {
        throw new Error('Must pass names');
    }
    return names.map(x => nameToCredit(x)!).filter(x => x !== undefined);
};
/** Build a Credit from a name, optionally with service metadata. Empty/undefined names return undefined. */
// typing overloading here is ok

export function nameToCredit(val: string, ...metadata: (MusicServices | undefined)[]): Credit;
// eslint-disable-next-line no-redeclare
export function nameToCredit(val: string | null | undefined | Partial<Credit>, ...metadata: (MusicServices | undefined)[]): Credit | undefined;
// eslint-disable-next-line no-redeclare
export function nameToCredit(val: string | null | undefined | Partial<Credit>, ...metadata: (MusicServices | undefined)[]): Credit | undefined {
    if (val === undefined || val === null) {
        return undefined;
    }
    if (typeof val === 'string') {
        return withMetadata({ name: val }, ...metadata);
    }
    if (val.name === undefined || val.name === null) {
        return undefined;
    }
    return withMetadata(removeUndefinedKeys({ ...val }) as Credit, ...metadata);
}

export function creditToName(a: Credit): string;
// eslint-disable-next-line no-redeclare
export function creditToName(a: Credit | undefined): string | undefined;
// eslint-disable-next-line no-redeclare
export function creditToName(a: Credit | undefined): string | undefined {
    return a?.name;
}
export const creditsToNames = (a: Credit[] = []): string[] => a.map((x) => x.name);

export function buildTrackString(playObj: AmbPlayObject, options?: TrackStringOptions<string>): string;
// eslint-disable-next-line no-redeclare
export function buildTrackString<T>(playObj: AmbPlayObject, options: TrackStringOptions<T>): T;
// eslint-disable-next-line no-redeclare
export function buildTrackString<T = string>(playObj: AmbPlayObject, options: TrackStringOptions<T> = {}): T | string {
    const {
        include = ['time', 'artist', 'track'], transformers: {
            artists: artistsFunc = defaultBuildTrackStringTransformers.artists, album: albumFunc = defaultBuildTrackStringTransformers.album, track: trackFunc = defaultBuildTrackStringTransformers.track, time: timeFunc = defaultBuildTrackStringTransformers.time, timeFromNow = defaultBuildTrackStringTransformers.timeFromNow, comment: commentFunc = defaultBuildTrackStringTransformers.comment, platform: platformFunc = defaultBuildTrackStringTransformers.platform, reducer = (arr: any[]) => arr.join(' ') // (acc, curr) => `${acc} ${curr}`
        } = {},
    } = options;
    const {
        data: {
            artists, album, track, playDate, playDateCompleted
        } = {}, meta: {
            trackId, scrobbleTsSOC = SCROBBLE_TS_SOC_START, comment, deviceId, user, sessionId
        } = {},
    } = playObj;

    let pd: Dayjs | undefined;
    let usedTsSOC: ScrobbleTsSOC = scrobbleTsSOC;
    if (scrobbleTsSOC === SCROBBLE_TS_SOC_END && playDateCompleted !== undefined) {
        pd = typeof playDateCompleted === 'string' ? dayjs(playDateCompleted) : playDateCompleted;
    } else {
        usedTsSOC = SCROBBLE_TS_SOC_START;
        pd = typeof playDate === 'string' ? dayjs(playDate) : playDate;
    }

    const strParts: (T | string | undefined)[] = [];
    if (include.includes('platform')) {
        strParts.push(platformFunc(deviceId, user, include.includes('session') ? sessionId : undefined));
    } else if (include.includes('session') && sessionId !== undefined) {
        strParts.push(`(Session ${sessionId})`);
    }
    if (include.includes('trackId') && trackId !== undefined) {
        strParts.push(`(${trackId})`);
    }
    if (include.includes('artist')) {
        strParts.push(artistsFunc(creditsToNames(artists)));
    }
    if (include.includes('track')) {
        strParts.push(trackFunc(creditToName(track), playObj, strParts.length > 0));
    }
    if (include.includes('album')) {
        strParts.push(albumFunc(creditToName(album), playObj, strParts.length > 0));
    }
    if (include.includes('time')) {
        strParts.push(timeFunc(pd, usedTsSOC));
    }
    if (include.includes('timeFromNow')) {
        const tfn = timeFromNow(pd);
        if (tfn !== undefined) {
            strParts.push(tfn);
        }

    }
    if (include.includes('comment')) {
        const cfn = commentFunc(comment);
        if (cfn !== undefined) {
            strParts.push(cfn);
        }
    }

    return reducer(strParts); //strParts.join(' ');
}

