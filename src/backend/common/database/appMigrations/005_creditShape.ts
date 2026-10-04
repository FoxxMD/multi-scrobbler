import type { SqliteDatabase, Migration } from 'sqlite-up';
import type { MigrateBaseContext } from '../appMigrator.ts';
import { playEvents, playInputs, plays as drizzlePlays, playsHistorical } from '../drizzle/schema/schema.ts';
import { asc, eq } from 'drizzle-orm';
import { PLAY_EVENT_TYPE } from '../../../../core/PlayEvent.ts';
import type { Credit, LifecycleStep, PlayObject } from '../../../../core/Atomic.ts';
import { creditsWithIds, mbMeta, spotifyMeta, withAlbumArt, withImage, withMetadata } from '../../../../core/MusicMetadata.ts';
import { nameToCredit } from "../../../../core/MusicMetadata.ts";
import { diffObjects, patchObject } from '../../../../core/DataUtils.ts';
import { playContentBasicInvariantTransform, playMbidIdentifier } from '../../../utils/PlayComparisonUtils.ts';
import { hashObject } from '../../../utils/StringUtils.ts';
import { runTransaction } from '../drizzle/drizzleUtils.ts';

/**
 * Converts Plays stored before track/album/artists were Credit objects.
 *
 * Previously these were plain strings (or name + mbid for artists) with external ids stored separately in data.meta.brainz/spotify
 * and art stored in meta.art. This migration folds ids and art into the Credit they belong to.
 *
 * This file is the only place that still knows about the legacy shape.
 */

interface LegacyArtist {
    name: string
    mbid?: string
    spotifyId?: string
}

interface LegacyArt {
    album?: string
    track?: string
    artist?: string
}

interface LegacyData {
    track?: string | Credit
    album?: string | Credit
    artists?: (string | LegacyArtist | Credit)[]
    albumArtists?: (string | LegacyArtist | Credit)[]
    meta?: {
        brainz?: {
            artist?: string[]
            albumArtist?: string[]
            album?: string
            recording?: string
            releaseGroup?: string
            track?: string
            trackNumber?: number
            additionalInfo?: object
        }
        spotify?: {
            artist?: string[]
            albumArtist?: string[]
            album?: string
            track?: string
        }
    }
    [key: string]: unknown
}

const LEGACY_BRAINZ_ID_KEYS = ['artist', 'albumArtist', 'album', 'recording', 'releaseGroup', 'track'];

const isLegacyArtist = (x: unknown) => typeof x === 'string' || (x !== null && typeof x === 'object' && ('mbid' in x || 'spotifyId' in x));

export const isLegacyData = (data: LegacyData = {}): boolean =>
    typeof data.track === 'string'
    || typeof data.album === 'string'
    || (data.artists ?? []).some(isLegacyArtist)
    || (data.albumArtists ?? []).some(isLegacyArtist)
    || data.meta?.spotify !== undefined
    || LEGACY_BRAINZ_ID_KEYS.some(x => x in (data.meta?.brainz ?? {}));

const legacyArtistsToCredits = (artists: LegacyData['artists'], mbids?: string[], spotifyIds?: string[]): Credit[] | undefined => {
    if (artists === undefined) {
        return undefined;
    }
    // ids from the parallel id lists are only used if they line up with artists
    const named = creditsWithIds(
        creditsWithIds(artists.map(x => nameToCredit(typeof x === 'string' ? x : x.name)).filter(x => x !== undefined), mbids, 'musicbrainz', 'artist'),
        spotifyIds, 'spotify', 'artist');
    // ids that were stored on the artist itself are always correct
    return named.map((x, i) => {
        const legacy = artists[i];
        if (typeof legacy === 'string') {
            return x;
        }
        const { metadata = [], image } = legacy as Credit;
        const { mbid, spotifyId } = legacy as LegacyArtist;
        return withImage(withMetadata(x, ...metadata, mbMeta(mbid, 'artist'), spotifyMeta(spotifyId, 'artist')), image);
    });
}

const legacyToCredit = (val: string | Credit | undefined): Credit | undefined => typeof val === 'string' ? nameToCredit(val) : val;

/** Convert legacy play data (and art from play meta) to data using Credits. Data that is already converted is returned as-is. */
export const legacyDataToCredits = <T extends LegacyData>(data: T, art: LegacyArt = {}): PlayObject['data'] => {
    if (!isLegacyData(data) && Object.keys(art).length === 0) {
        return data as PlayObject['data'];
    }
    const {
        track,
        album,
        artists,
        albumArtists,
        meta: {
            brainz: {
                artist: mbArtists,
                albumArtist: mbAlbumArtists,
                album: mbRelease,
                recording: mbRecording,
                releaseGroup: mbReleaseGroup,
                track: mbTrack,
                ...brainzRest
            } = {},
            spotify = {},
            ...metaRest
        } = {},
        ...rest
    } = data;

    const artistCredits = legacyArtistsToCredits(artists, mbArtists, spotify.artist);
    if (artistCredits !== undefined && artistCredits.length > 0) {
        artistCredits[0] = withImage(artistCredits[0], art.artist);
    }

    const converted: Record<string, unknown> = {
        ...rest,
        ...withAlbumArt({
            track: withImage(withMetadata(legacyToCredit(track), mbMeta(mbTrack, 'track'), mbMeta(mbRecording, 'recording'), spotifyMeta(spotify.track, 'track')), art.track),
            album: withMetadata(legacyToCredit(album), mbMeta(mbRelease, 'release'), mbMeta(mbReleaseGroup, 'release-group'), spotifyMeta(spotify.album, 'album')),
        }, art.album),
        artists: artistCredits,
        albumArtists: legacyArtistsToCredits(albumArtists, mbAlbumArtists, spotify.albumArtist),
    };

    const meta: Record<string, unknown> = { ...metaRest };
    if (Object.keys(brainzRest).length > 0) {
        meta.brainz = brainzRest;
    }
    if (Object.keys(meta).length > 0) {
        converted.meta = meta;
    }

    for (const k of Object.keys(converted)) {
        if (converted[k] === undefined) {
            delete converted[k];
        }
    }
    return converted as PlayObject['data'];
}

type LegacyPlay = { data?: LegacyData | PlayObject['data'], meta?: { art?: LegacyArt, [key: string]: unknown }, [key: string]: any };

/** Convert a legacy play, and any plays embedded in it, to use Credits. Does not convert lifecycle patches, see `rebuildLifecycle` */
export const legacyPlayToCredits = <T extends LegacyPlay | undefined>(play: T): T => {
    if (play === undefined || play === null || play.data === undefined) {
        return play;
    }
    const { art, ...meta } = play.meta ?? {};
    const converted: LegacyPlay = {
        ...play,
        data: legacyDataToCredits(play.data as LegacyData, art),
        meta
    };
    if (converted.original?.play !== undefined) {
        converted.original = { ...converted.original, play: legacyPlayToCredits(converted.original.play) };
    }
    if (converted.scrobble !== undefined) {
        converted.scrobble = legacyScrobbleResultToCredits(converted.scrobble);
    }
    return converted as T;
}

const legacyMatchResultToCredits = <T extends Record<string, any>>(match: T): T => {
    const converted: Record<string, any> = { ...match };
    for (const key of ['closestMatchedPlay', 'transformedPlay']) {
        if (converted[key] !== undefined && converted[key] !== null) {
            converted[key] = legacyPlayToCredits(converted[key]);
        }
    }
    return converted as T;
}

const legacyScrobbleResultToCredits = <T extends Record<string, any>>(scrobble: T): T => {
    const converted: Record<string, any> = { ...scrobble };
    if (converted.mergedScrobble !== undefined && converted.mergedScrobble !== null) {
        converted.mergedScrobble = legacyPlayToCredits(converted.mergedScrobble);
    }
    if (converted.match !== undefined && converted.match !== null) {
        converted.match = legacyMatchResultToCredits(converted.match);
    }
    return converted as T;
}

export const isLegacyPlay = (play: LegacyPlay): boolean => isLegacyData(play.data as LegacyData) || play.meta?.art !== undefined;

const jsonClone = <T>(val: T): T => JSON.parse(JSON.stringify(val));

/**
 * Lifecycle steps (stored as transform events) store their changes as a patch against the play data from the previous step, starting with the Play input.
 * These patches were generated using the legacy shape so they need to be regenerated.
 *
 * Replay patches using legacy data, convert each intermediate state, and then diff the converted states to get the new patches.
 *
 * If patches cannot be replayed (no input data, or a patch fails) they are removed as they cannot be applied to converted data.
 */
export const rebuildLifecycle = (steps: LifecycleStep[], input: LegacyPlay | undefined, finalArt?: LegacyArt): LifecycleStep[] => {
    const lastPatchIndex = steps.findLastIndex(x => x.patch !== undefined);
    if (lastPatchIndex === -1) {
        return steps;
    }
    let legacyState: LegacyData | undefined = input?.data !== undefined ? jsonClone(input.data as LegacyData) : undefined;
    const inputArt = input?.meta?.art;

    return steps.map((step, index) => {
        if (step.patch === undefined) {
            return step;
        }
        const { patch, ...rest } = step;
        if (legacyState === undefined) {
            return rest;
        }
        try {
            const legacyNext: LegacyData = patchObject(legacyState, patch);
            // art was not part of patches so we only know what it was for the input and what it ended up as
            const newPatch = diffObjects(
                jsonClone(legacyDataToCredits(legacyState, inputArt)),
                jsonClone(legacyDataToCredits(legacyNext, index === lastPatchIndex ? (finalArt ?? inputArt) : inputArt))
            );
            legacyState = legacyNext;
            return newPatch.length > 0 ? { ...rest, patch: newPatch } : rest;
        } catch (e) {
            // can't replay any patches after this one
            legacyState = undefined;
            return rest;
        }
    });
}

export const up: Migration<MigrateBaseContext>['up'] = async (db: SqliteDatabase, ctx: MigrateBaseContext | undefined): Promise<void> => {
    if(ctx === undefined) {
        throw new Error('Context must be defined');
    }
    ctx.logger.info('Converting Plays to use Credits for track/album/artists. This may take some time...');

    let more = true;
    let offset = 0,
        processed = 0,
        updated = 0;

    // Plays must be converted before Inputs because we need legacy Input data to regenerate lifecycle patches
    while (more) {
        const playsRows = await ctx.db.select().from(drizzlePlays).limit(100).offset(offset);
        for (const row of playsRows) {
            processed++;
            try {
                const legacyPlay = row.play as unknown as LegacyPlay;
                const play = legacyPlayToCredits(legacyPlay) as unknown as PlayObject;
                if(!isLegacyPlay(legacyPlay)) {
                    // already converted, patches and events for this play are also already converted
                    continue;
                }
                // events and the play must be converted together, otherwise a failure part way through leaves
                // already converted patches that would be replayed against legacy data on the next run
                await runTransaction(ctx.db, async () => {
                    const [input] = await ctx.db.select().from(playInputs).where(eq(playInputs.playId, row.id)).limit(1);
                    const legacyInput = input?.play as unknown as LegacyPlay | undefined;
                    if(play.lifecycle !== undefined && play.lifecycle.length > 0) {
                        play.lifecycle = rebuildLifecycle(play.lifecycle, legacyInput, legacyPlay.meta?.art);
                    }

                    // Lifecycle steps, and results that include plays, are also stored as events
                    const events = await ctx.db.select().from(playEvents).where(eq(playEvents.playId, row.id)).orderBy(asc(playEvents.id));

                    // steps from all transform events are one continuous chain of patches starting from input
                    const transformEvents = events.filter(x => x.eventName === PLAY_EVENT_TYPE.transform && Array.isArray(x.data));
                    const rebuiltSteps = rebuildLifecycle(transformEvents.flatMap(x => x.data as LifecycleStep[]), legacyInput, legacyPlay.meta?.art);
                    for(const ev of transformEvents) {
                        const data = rebuiltSteps.splice(0, (ev.data as LifecycleStep[]).length);
                        await ctx.db.update(playEvents).set({ data }).where(eq(playEvents.id, ev.id));
                    }
                    for(const ev of events) {
                        if(ev.data === null || typeof ev.data !== 'object') {
                            continue;
                        }
                        if(ev.eventName === PLAY_EVENT_TYPE.dupeCheck) {
                            await ctx.db.update(playEvents).set({ data: legacyMatchResultToCredits(ev.data) }).where(eq(playEvents.id, ev.id));
                        } else if(ev.eventName === PLAY_EVENT_TYPE.scrobbleResult) {
                            await ctx.db.update(playEvents).set({ data: legacyScrobbleResultToCredits(ev.data) }).where(eq(playEvents.id, ev.id));
                        }
                    }
                    await ctx.db.update(drizzlePlays).set({
                        play,
                        playHash: hashObject(playContentBasicInvariantTransform(play).data),
                        mbidIdentifier: playMbidIdentifier(play) ?? null
                    }).where(eq(drizzlePlays.id, row.id));
                });
                updated++;
            } catch (e) {
                ctx.logger.warn(new Error(`Failed to convert Play ${row.id} (${row.uid})`, { cause: e }));
            }
        }
        offset += 100;
        ctx.logger.verbose(`Play Conversion Progress: Processed ${processed} | Updated ${updated}`);
        if (playsRows.length < 100) {
            more = false;
        }
    }

    ctx.logger.info('Converting Play Inputs...');
    offset = 0;
    processed = 0;
    updated = 0;
    more = true;
    while (more) {
        const inputRows = await ctx.db.select().from(playInputs).limit(100).offset(offset);
        for (const row of inputRows) {
            processed++;
            try {
                const play = legacyPlayToCredits(row.play as unknown as LegacyPlay) as unknown as PlayObject;
                await ctx.db.update(playInputs).set({
                    play,
                    playHash: hashObject(playContentBasicInvariantTransform(play).data)
                }).where(eq(playInputs.id, row.id));
                updated++;
            } catch (e) {
                ctx.logger.warn(new Error(`Failed to convert Play Input ${row.id}`, { cause: e }));
            }
        }
        offset += 100;
        ctx.logger.verbose(`Play Input Conversion Progress: Processed ${processed} | Updated ${updated}`);
        if (inputRows.length < 100) {
            more = false;
        }
    }

    ctx.logger.info('Converting Historical Plays...');
    offset = 0;
    processed = 0;
    updated = 0;
    more = true;
    while (more) {
        const historicalRows = await ctx.db.select().from(playsHistorical).limit(100).offset(offset);
        for (const row of historicalRows) {
            processed++;
            try {
                const play = legacyPlayToCredits(row.play as unknown as LegacyPlay) as unknown as PlayObject;
                await ctx.db.update(playsHistorical).set({
                    play,
                    playHash: hashObject(playContentBasicInvariantTransform(play).data),
                    mbidIdentifier: playMbidIdentifier(play) ?? null
                }).where(eq(playsHistorical.id, row.id));
                updated++;
            } catch (e) {
                ctx.logger.warn(new Error(`Failed to convert Historical Play ${row.id} (${row.uid})`, { cause: e }));
            }
        }
        offset += 100;
        ctx.logger.verbose(`Historical Play Conversion Progress: Processed ${processed} | Updated ${updated}`);
        if (historicalRows.length < 100) {
            more = false;
        }
    }

    ctx.logger.info('Done.');
};

export const down: Migration<MigrateBaseContext>['down'] = async (db: SqliteDatabase, ctx: MigrateBaseContext | undefined): Promise<void> => {
    // Rollback code here
    // context is passed as ctx
};
