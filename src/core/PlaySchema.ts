/**
 * Zod schemas for PlayObject and SourcePlayerObj, the source of truth for their types (see Atomic.ts).
 *
 * Date fields use the `zDayjs` codec so one schema describes both shapes:
 *
 * * `z.output<>` = backend shape, dates are `Dayjs`
 * * `z.input<>` = JSON shape, dates are ISO8601 strings
 *
 * Use `.decode()` (JSON -> backend) and `.encode()` (backend -> JSON) to convert between them.
 *
 * * `*Schema` = strict full shape, used for types
 * * `playObjectInternalSchema` = loose version of the full shape used for (de)serializing stored/received plays so unknown keys are kept
 * * `public*Schema` = subset of full shape that is safe to expose to users (docs, payloads). Use `toPublicPlay`/`toPublicPlayer` to redact objects to this shape.
 * */
import dayjs, { type Dayjs } from "dayjs";
import * as z from "zod";
import {
    creditSchema,
    parsedFromSchema,
    type LifecycleInput,
    type PlayObject,
    type SourcePlayerObj,
    type TrackMeta,
} from "./Atomic.ts";

/** ISO8601 string <-> Dayjs */
export const zDayjs = z.codec(
    z.iso.datetime({offset: true, local: true}).meta({format: 'date-time', description: 'ISO8601 timestamp', examples: ['2026-11-13T14:05:00.000Z']}),
    // meta makes the output side describable as JSON Schema (OpenAPI responses are generated from the output side)
    z.custom<Dayjs>((v) => dayjs.isDayjs(v)).meta({type: 'string', format: 'date-time'}),
    {
        decode: (s) => dayjs(s),
        encode: (d) => d.toISOString(),
    }
);

/** ISO8601 timestamp that is a string in both JSON and backend shapes */
const isoString = z.string().meta({format: 'date-time', examples: ['2026-11-13T14:05:00.000Z']});

export const playProgressSchema = z.object({
    timestamp: zDayjs,
    position: z.number().optional().meta({description: 'Position in the track, in seconds'}),
    positionPercent: z.number().optional().meta({description: 'Position in the track, as a percentage of duration'}),
});

export const listenRangeSchema = z.object({
    start: playProgressSchema,
    end: playProgressSchema,
});

export const playDataSchema = z.object({
    track: creditSchema.optional(),
    artists: creditSchema.array().optional(),
    albumArtists: creditSchema.array().optional(),
    album: creditSchema.optional(),
    /**
     * The length of the track, in seconds
     * */
    duration: z.number().nonnegative().optional().meta({description: 'The length of the track, in seconds'}),
    // free-form, can be large
    meta: z.custom<TrackMeta>().optional(),
    /**
     * The date the track was played at
     * */
    playDate: zDayjs.optional().meta({description: 'The date the track was played at'}),
    playDateCompleted: zDayjs.optional().meta({description: 'When the track finished playing'}),
    /** Number of seconds the track was listened to */
    listenedFor: z.number().nonnegative().optional().meta({description: 'Number of seconds the track was listened to'}),
    listenRanges: listenRangeSchema.array().optional().meta({description: 'Ranges of the track that were listened to'}),
    repeat: z.boolean().optional().meta({description: 'Play was detected as a repeat of the previous play'}),
});

export const playMetaUrlStrictSchema = z.object({
    /**
     * The URL where this track can be found for the serice it was created from
     *
     * IE
     *
     * * Spotify Source <-- url to spotify track
     * * Maloja Client <--- url to specific scrobble
     */
    web: z.string().optional().meta({description: 'The URL where this track can be found for the service it was created from. IE Spotify Source = url to spotify track, Maloja Client = url to specific scrobble'}),
    /**
     * The URL where this play was originally played
     *
     * IE Frank Sinatra - My way FROM youtube.com <-- URL pointing to specific video
     */
    origin: z.string().optional().meta({description: 'The URL where this play was originally played. IE Frank Sinatra - My way FROM youtube.com = URL pointing to specific video'}),
});

export const playMetaSchema = z.object({
    source: z.string().optional().meta({description: 'Type of Source that discovered this play'}),
    sourceSOT: z.enum(['player', 'history', 'ingress']).optional(),
    seenAt: zDayjs.optional().meta({description: 'When Multi-Scrobbler first saw this play'}),
    /*
    * If applicable, the name of the Service providing the track (Spotify, Tidal, etc...)
    */
    musicService: z.string().optional().meta({description: 'If applicable, the name of the Service providing the track (Spotify, Tidal, etc...)'}),
    /**
     * Specifies from what facet/data from the source this play was parsed from IE player, backlog, now playing, etc...
     * */
    parsedFrom: parsedFromSchema.optional().meta({description: 'Specifies from what facet/data from the source this play was parsed from IE player, backlog, now playing, etc...'}),
    /**
     * Unique ID for this track, given by the Source
     * */
    trackId: z.string().optional().meta({description: 'Unique ID for this track, given by the Source'}),
    /**
     * Atomic ID for this instance of played tracked IE a unique ID for "this track played at this time"
     * */
    playId: z.string().optional().meta({description: 'Atomic ID for this instance of played tracked IE a unique ID for "this track played at this time"'}),
    newFromSource: z.boolean().optional(),
    url: playMetaUrlStrictSchema.optional(),
    user: z.string().optional(),
    mediaType: z.string().optional(),
    server: z.string().optional(),
    library: z.string().optional(),
    /**
     * The position the "player" is at in the track at the time the play was reported, in seconds
     * */
    trackProgressPosition: z.number().optional().meta({description: 'The position the "player" is at in the track at the time the play was reported, in seconds'}),
    /*
    * Name of the media player (program)
    */
    mediaPlayerName: z.string().optional().meta({description: 'Name of the media player (program)'}),
    /*
    * Version of the media player (program)
    */
    mediaPlayerVersion: z.string().optional().meta({description: 'Version of the media player (program)'}),
    /**
     * A unique identifier for the device playing this track
     * */
    deviceId: z.string().optional().meta({description: 'A unique identifier for the device playing this track'}),
    /** The ID/Key for individual sessions on a device/platform */
    sessionId: z.string().optional().meta({description: 'The ID/Key for individual sessions on a device/platform'}),
    nowPlaying: z.boolean().optional(),
    scrobbleTsSOC: z.union([z.literal(1), z.literal(2)]).optional().meta({description: 'Whether the play timestamp marks the start (1) or end (2) of the play'}),
    comment: z.string().optional(),
    /** Was the component activitely monitoring when this Play was created? */
    wasMonitored: z.boolean().optional().meta({description: 'Was the component activitely monitoring when this Play was created?'}),
    lifecycleInputs: z.custom<LifecycleInput>().array().optional(),
});

/** Full Play shape without the free-form blobs (original, scrobble, lifecycle) which are typed in Atomic.ts */
export const playObjectSchema = z.object({
    id: z.int().optional(),
    uid: z.string().optional(),
    data: playDataSchema,
    meta: playMetaSchema,
});

/** Loose version of playObjectSchema for (de)serializing so unknown keys, including the free-form blobs, are passed through as-is */
export const playObjectInternalSchema = playObjectSchema.extend({
    data: playDataSchema.loose(),
    meta: playMetaSchema.extend({url: playMetaUrlStrictSchema.loose().optional()}).loose(),
}).loose();

export const sourcePlayerSchema = z.object({
    /** unique tuple identifying user and device */
    platformId: z.string().meta({description: 'unique tuple identifying user and device'}),
    /** full play/scrobble object information */
    play: playObjectSchema.optional().meta({description: 'full play/scrobble object information'}),
    playFirstSeenAt: isoString.optional().meta({description: 'ISO8601 timestamp'}),
    /** last time play was updated in MS */
    playLastUpdatedAt: isoString.optional().meta({description: 'last time play was updated in MS'}),
    /** last time player self-reported it was updated at */
    playerLastUpdatedAt: isoString.meta({description: 'last time player self-reported it was updated at'}),
    /** when this specific play/player was created */
    createdAt: z.number().optional().meta({description: 'when this specific play/player was created'}),
    /** player poisition */
    position: z.number().optional().meta({description: 'player position, in seconds'}),
    listenedDuration: z.number().meta({description: 'Seconds the current track has been listened to'}),
    /** if player is mirroring generic now-playing (from upstream LZ/LFM client) */
    nowPlayingMode: z.boolean().optional().meta({description: 'if player is mirroring generic now-playing (from upstream LZ/LFM client)'}),
    /** status of player */
    status: z.object({
        /** what player reported: paused, playing, stopped, unknown  */
        reported: z.string().meta({description: 'what player reported: paused, playing, stopped, unknown'}),
        /** what MS has derived from watching player behavior: paused, playing, stopped, unknown  */
        calculated: z.string().meta({description: 'what MS has derived from watching player behavior: paused, playing, stopped, unknown'}),
        /** When player has not reported any new updates for N seconds */
        stale: z.boolean().meta({description: 'When player has not reported any new updates for N seconds'}),
        /** When player has not reported any new updates for N * 2 seconds */
        orphaned: z.boolean().meta({description: 'When player has not reported any new updates for N * 2 seconds'}),
    }).meta({description: 'status of player'}),
});

// Public subsets
//
// Built with pick (allowlist) so new schema keys are never public by default.
// Every schema key must be listed as either public (picked) or internal (*InternalKeys) or the key checks below fail.
//
// Must NOT contain looseObject, catchall, record, custom, or any -- encoding with these schemas is how objects are redacted and those pass through unknown keys.

type PlayDataInternalKeys = 'meta';
export const publicPlayDataSchema = playDataSchema.pick({
    track: true, artists: true, albumArtists: true, album: true, duration: true,
    playDate: true, playDateCompleted: true, listenedFor: true, listenRanges: true, repeat: true,
});

type PlayMetaInternalKeys = 'sourceSOT' | 'scrobbleTsSOC' | 'comment' | 'wasMonitored' | 'lifecycleInputs';
export const publicPlayMetaSchema = playMetaSchema.pick({
    source: true, seenAt: true, musicService: true, parsedFrom: true, trackId: true, playId: true, newFromSource: true,
    user: true, mediaType: true, server: true, library: true, trackProgressPosition: true, mediaPlayerName: true,
    mediaPlayerVersion: true, deviceId: true, sessionId: true, nowPlaying: true, url: true,
});

type PlayInternalKeys = 'id';
export const publicPlaySchema = z.object({
    uid: playObjectSchema.shape.uid,
    data: publicPlayDataSchema,
    meta: publicPlayMetaSchema,
}).meta({title: 'Play'});

type PlayerInternalKeys = 'nowPlayingMode';
export const publicPlayerSchema = sourcePlayerSchema.omit({play: true, nowPlayingMode: true}).extend({
    play: publicPlaySchema.optional(),
}).meta({title: 'Player'});

/** JSON shape of a public Play */
export type PublicPlay = z.input<typeof publicPlaySchema>;
/** JSON shape of a public Player */
export type PublicPlayer = z.input<typeof publicPlayerSchema>;

/** Redact a Play to only its public shape, as JSON. Throws if the Play does not validate. */
export const toPublicPlay = (play: PlayObject): PublicPlay => publicPlaySchema.encode(play);

/** Redact a Player (and its Play) to only its public shape, as JSON. Throws if the Player does not validate. */
export const toPublicPlayer = (player: SourcePlayerObj): PublicPlayer => publicPlayerSchema.encode(player);

// every schema key is classified as public or internal. A compile error here means a public schema needs updating.
type KeyDiff<A, B> = [Exclude<keyof A, keyof B>, Exclude<keyof B, keyof A>] extends [never, never] ? true : {missingFromPublic: Exclude<keyof A, keyof B>, notInSchema: Exclude<keyof B, keyof A>};
const keyChecks: [
    KeyDiff<z.output<typeof playDataSchema>, z.output<typeof publicPlayDataSchema> & Record<PlayDataInternalKeys, unknown>>,
    KeyDiff<z.output<typeof playMetaSchema>, z.output<typeof publicPlayMetaSchema> & Record<PlayMetaInternalKeys, unknown>>,
    KeyDiff<z.output<typeof playObjectSchema>, z.output<typeof publicPlaySchema> & Record<PlayInternalKeys, unknown>>,
    KeyDiff<z.output<typeof sourcePlayerSchema>, z.output<typeof publicPlayerSchema> & Record<PlayerInternalKeys, unknown>>,
] = [true, true, true, true];
void keyChecks;
