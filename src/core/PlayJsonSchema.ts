/**
 * Zod schemas mirroring the JSON (string date) shapes of PlayObject and SourcePlayerObj.
 *
 * The TS interfaces in Atomic.ts remain the source of truth; the key checks at the bottom of this file fail compilation if the two drift apart.
 *
 * * `*JsonSchema` = full shape, internal only, used for parity with interfaces
 * * `public*Schema` = subset of full shape that is safe to expose to users (docs, payloads). Use `toPublicPlay`/`toPublicPlayer` to redact objects to this shape.
 * */
// TODO refactor PlayObject and related TS types into zod objects eventually...that's a bigger refactor
import * as z from "zod";
import {
    creditSchema,
    parsedFromSchema,
    playMetaUrlSchema,
    trackMetaSchema,
    type AmbPlayObject,
    type DateLike,
    type PlayData,
    type PlayMetaBase,
    type PlayProgressAmb,
    type SourcePlayerObj,
    type TrackData,
} from "./Atomic.ts";
import { asJsonPlayObject } from "./PlayMarshalUtils.ts";

const isoDate = z.string().meta({description: 'ISO8601 timestamp', examples: ['2026-11-13T14:05:00.000Z']});

const internalObject = (description: string) => z.looseObject({}).meta({description: `${description}. Internal to Multi-Scrobbler, shape may change.`});

export const playProgressJsonSchema = z.object({
    timestamp: isoDate,
    position: z.number().optional().meta({description: 'Position in the track, in seconds'}),
    positionPercent: z.number().optional().meta({description: 'Position in the track, as a percentage of duration'}),
});

export const playDataJsonSchema = z.object({
    track: creditSchema.optional(),
    artists: creditSchema.array().optional(),
    albumArtists: creditSchema.array().optional(),
    album: creditSchema.optional(),
    duration: z.number().nonnegative().optional().meta({description: 'Length of the track, in seconds'}),
    meta: trackMetaSchema.optional(),
    playDate: isoDate.optional().meta({description: 'When the track was played'}),
    playDateCompleted: isoDate.optional().meta({description: 'When the track finished playing'}),
    listenedFor: z.number().nonnegative().optional().meta({description: 'Number of seconds the track was listened to'}),
    listenRanges: z.object({start: playProgressJsonSchema, end: playProgressJsonSchema}).array().optional().meta({description: 'Ranges of the track that were listened to'}),
    repeat: z.boolean().optional().meta({description: 'Play was detected as a repeat of the previous play'}),
});

export const playMetaJsonSchema = z.object({
    source: z.string().optional().meta({description: 'Type of Source that discovered this play'}),
    sourceSOT: z.enum(['player', 'history', 'ingress']).optional(),
    seenAt: isoDate.optional().meta({description: 'When Multi-Scrobbler first saw this play'}),
    musicService: z.string().optional().meta({description: 'Service providing the track (Spotify, Tidal, etc...)'}),
    parsedFrom: parsedFromSchema.optional(),
    trackId: z.string().optional().meta({description: 'Unique ID for this track, given by the Source'}),
    playId: z.string().optional().meta({description: 'Unique ID for this track played at this time, given by the Source'}),
    newFromSource: z.boolean().optional(),
    url: playMetaUrlSchema.optional(),
    user: z.string().optional(),
    mediaType: z.string().optional(),
    server: z.string().optional(),
    library: z.string().optional(),
    trackProgressPosition: z.number().optional().meta({description: 'Position of the player in the track when reported, in seconds'}),
    mediaPlayerName: z.string().optional(),
    mediaPlayerVersion: z.string().optional(),
    deviceId: z.string().optional(),
    sessionId: z.string().optional(),
    nowPlaying: z.boolean().optional(),
    scrobbleTsSOC: z.union([z.literal(1), z.literal(2)]).optional().meta({description: 'Whether the play timestamp marks the start (1) or end (2) of the play'}),
    comment: z.string().optional(),
    wasMonitored: z.boolean().optional(),
    lifecycleInputs: z.object({type: z.string(), input: z.union([z.looseObject({}), z.string()])}).array().optional(),
});

export const jsonPlayObjectSchema = z.object({
    id: z.int().optional(),
    uid: z.string().optional(),
    data: playDataJsonSchema,
    meta: playMetaJsonSchema,
    original: internalObject('Original data the play was created from').optional(),
    scrobble: internalObject('Result of scrobbling this play').optional(),
    lifecycle: internalObject('Transform step').array().optional(),
});

export const sourcePlayerJsonSchema = z.object({
    platformId: z.string().meta({description: 'Unique device + user identifier for this player'}),
    play: jsonPlayObjectSchema.optional(),
    playFirstSeenAt: isoDate.optional(),
    playLastUpdatedAt: isoDate.optional().meta({description: 'Last time the play was updated in Multi-Scrobbler'}),
    playerLastUpdatedAt: isoDate.meta({description: 'Last time the player reported an update'}),
    createdAt: z.number().optional(),
    position: z.number().optional().meta({description: 'Player position in the track, in seconds'}),
    listenedDuration: z.number().meta({description: 'Seconds the current track has been listened to'}),
    nowPlayingMode: z.boolean().optional(),
    status: z.object({
        reported: z.string().meta({description: 'Status reported by the player: playing, paused, stopped, unknown'}),
        calculated: z.string().meta({description: 'Status determined by Multi-Scrobbler: playing, paused, stopped, unknown'}),
        stale: z.boolean().meta({description: 'Player has not reported updates for a while'}),
        orphaned: z.boolean().meta({description: 'Player has not reported updates for a long while'}),
    }),
});

// Public subsets
//
// Built with pick (allowlist) so new interface keys are never public by default.
// Every interface key must be listed as either public (picked) or internal (*InternalKeys) or the key checks below fail.
//
// Must NOT contain looseObject, catchall, record, or any -- parsing with these schemas is how objects are redacted and those pass through unknown keys.

type PlayDataInternalKeys = 'meta';
export const publicPlayDataSchema = playDataJsonSchema.pick({
    track: true, artists: true, albumArtists: true, album: true, duration: true,
    playDate: true, playDateCompleted: true, listenedFor: true, listenRanges: true, repeat: true,
});

type PlayMetaInternalKeys = 'sourceSOT' | 'scrobbleTsSOC' | 'comment' | 'wasMonitored' | 'lifecycleInputs';
export const publicPlayMetaSchema = playMetaJsonSchema.pick({
    source: true, seenAt: true, musicService: true, parsedFrom: true, trackId: true, playId: true, newFromSource: true,
    user: true, mediaType: true, server: true, library: true, trackProgressPosition: true, mediaPlayerName: true,
    mediaPlayerVersion: true, deviceId: true, sessionId: true, nowPlaying: true,
}).extend({
    // playMetaUrlSchema is loose, replace with strict version
    url: z.object({
        web: z.string().optional().meta({description: 'URL where this track can be found on the service it came from'}),
        origin: z.string().optional().meta({description: 'URL where this play was originally played'}),
    }).optional(),
});

type PlayInternalKeys = 'id' | 'original' | 'scrobble' | 'lifecycle';
export const publicPlaySchema = z.object({
    uid: jsonPlayObjectSchema.shape.uid,
    data: publicPlayDataSchema,
    meta: publicPlayMetaSchema,
}).meta({title: 'Play'});

type PlayerInternalKeys = 'nowPlayingMode';
export const publicPlayerSchema = sourcePlayerJsonSchema.omit({play: true, nowPlayingMode: true}).extend({
    play: publicPlaySchema.optional(),
}).meta({title: 'Player'});

export type PublicPlay = z.output<typeof publicPlaySchema>;
export type PublicPlayer = z.output<typeof publicPlayerSchema>;

/** Redact a Play to only its public shape. Throws if the Play does not validate. */
export const toPublicPlay = (play: AmbPlayObject<DateLike>): PublicPlay => publicPlaySchema.parse(asJsonPlayObject(play));

/** Redact a Player (and its Play) to only its public shape. Throws if the Player does not validate. */
export const toPublicPlayer = (player: SourcePlayerObj<DateLike>): PublicPlayer => publicPlayerSchema.parse({
    ...player,
    play: player.play === undefined ? undefined : asJsonPlayObject(player.play)
});

// key parity checks between interfaces and schemas. A compile error here means a schema needs updating.
type KeyDiff<A, B> = [Exclude<keyof A, keyof B>, Exclude<keyof B, keyof A>] extends [never, never] ? true : {missingFromSchema: Exclude<keyof A, keyof B>, notInInterface: Exclude<keyof B, keyof A>};
const keyChecks: [
    KeyDiff<PlayProgressAmb<string>, z.input<typeof playProgressJsonSchema>>,
    KeyDiff<PlayData<string> & TrackData, z.input<typeof playDataJsonSchema>>,
    KeyDiff<PlayMetaBase<string>, z.input<typeof playMetaJsonSchema>>,
    KeyDiff<AmbPlayObject<string>, z.input<typeof jsonPlayObjectSchema>>,
    KeyDiff<SourcePlayerObj<string>, z.input<typeof sourcePlayerJsonSchema>>,
    KeyDiff<SourcePlayerObj<string>['status'], z.input<typeof sourcePlayerJsonSchema>['status']>,
    // every interface key is classified as public or internal
    KeyDiff<PlayData<string> & TrackData, z.input<typeof publicPlayDataSchema> & Record<PlayDataInternalKeys, unknown>>,
    KeyDiff<PlayMetaBase<string>, z.input<typeof publicPlayMetaSchema> & Record<PlayMetaInternalKeys, unknown>>,
    KeyDiff<AmbPlayObject<string>, z.input<typeof publicPlaySchema> & Record<PlayInternalKeys, unknown>>,
    KeyDiff<SourcePlayerObj<string>, z.input<typeof publicPlayerSchema> & Record<PlayerInternalKeys, unknown>>,
] = [true, true, true, true, true, true, true, true, true, true];
void keyChecks;
