import { creditSchema, playTrackDataSchema, COMPONENT_AUTH_TYPE, componentTypeSchema, MONITORING_ORIGIN_SYSTEM, MONITORING_ORIGIN_USER, sourceSotTypes, PLAY_STATES, QUEUE_NAMES, QUEUE_STATUSES, queueContextSchema, type QueueStatus, type ClientType, creditBaseSchema, trackSearchHash, albumSearchHash, artistSearchHash } from "./Atomic.ts"
import type { LogEvent, SourceType, TrackData } from "./Atomic.ts"
import type { ComponentType, DateLike, ErrorLike, PlayState, QueueName } from "./Atomic.ts"
import type { JsonPlayObject, SourcePlayerJson, DateSide } from "./PlaySchema.ts"
import { playObjectSchema, sourcePlayerSchema, zDayjs, zDayjsStrict } from "./PlaySchema.ts"
import type { Dayjs } from "dayjs"
import type { ErrorIsh } from "./ErrorUtils.ts"
import { playEventSchema } from "./PlayEvent.ts"
import * as z from "zod"
import type { ErrorObject } from "serialize-error";
import { serializeError } from "serialize-error";

const errorLikeSchema = z.custom<ErrorLike>();

export const playApiCommonSchema = z.object({
    uid: z.string().meta({description: 'unique id for a Play'}),
    componentId: z.int().nullable().meta({description: 'id of the Source/Client Play was created in'}),
    state: z.enum(PLAY_STATES as [PlayState, ...PlayState[]]),
    play: playObjectSchema,
    /** dash-joined list of Play properties removed by retention compaction, IE 'input-transform' */
    compacted: z.string().nullable().meta({description: "dash-joined list of Play properties removed by retention compaction, IE 'input-transform'"}),
    playedAt: zDayjs.nullable(),
    seenAt: zDayjs.nullable().meta({description: 'when the Source/Client created this Play, can be different than playedAt'}),
    updatedAt: zDayjs,
});

export const playInputApiSchema = z.object({
    id: z.int(),
    /** raw data the Play was built from */
    data: z.custom<object>().nullable().meta({description: 'raw data the Play was built from'}),
    play: playObjectSchema.meta({description: 'the original play before any transforms were applied'}),
    createdAt: zDayjs.nullable(),
});

export const queueStateApiSchema = z.object({
    id: z.int(),
    queueName: z.string(),
    queueStatus: z.enum(QUEUE_STATUSES as [QueueStatus, ...QueueStatus[]]),
    retries: z.int(),
    error: errorLikeSchema.nullable(),
    updatedAt: zDayjs,
    createdAt: zDayjs,
    context: queueContextSchema.loose().nullable(),
});

export const playApiCommonDetailedSchema = playApiCommonSchema.extend({
    error: errorLikeSchema.nullable(),
    input: playInputApiSchema.optional(),
    queueStates: queueStateApiSchema.array(),
    events: playEventSchema.array().optional(),
});

export type PlayApiCommon<D extends DateLike = string> = DateSide<D, typeof playApiCommonSchema>;
export type PlayInputApi<D extends DateLike = string> = DateSide<D, typeof playInputApiSchema>;
export type QueueStateApi<D extends DateLike = string> = DateSide<D, typeof queueStateApiSchema>;
export type PlayApiCommonDetailed<D extends DateLike = string> = DateSide<D, typeof playApiCommonDetailedSchema>;

const serializeIfError = <E>(e: E) => e instanceof Error ? serializeError(e) : e;

/** Serialize Errors so they survive JSON.stringify */
export const asSerializablePlaySelect = <T extends Partial<Pick<PlayApiCommonDetailed<DateLike>, 'error' | 'queueStates'>>>(data: T): T => {
  const {
    error,
    queueStates,
    ...rest
  } = data;
  return {
    ...rest,
    error: serializeIfError(error),
    queueStates: queueStates?.map(x => ({...x, error: serializeIfError(x.error)}))
  } as T;
}

export type ComponentState = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export const COMPONENT_STATE = {
    RUNNING: 1,
    IGNORED: 2,
    IDLE: 3,
    STOPPED: 4,
    INITIALIZING: 5,
    NOT_READY: 6,
    ERROR: 7,
} as const satisfies Record<string, ComponentState>;

export const componentStateToFriendly = (state: ComponentState) => {
    switch(state) {
        case 1:
            return 'Running';
        case 2:
            return 'Ignored';
        case 3:
            return 'Idle';
        case 4:
            return 'Stopped';
        case 5:
            return 'Initializing';
        case 6:
            return 'Not Ready';
        case 7:
            return 'Error';
    }
}

const errorIshSchema = z.custom<ErrorIsh>();

export const componentCommonApiSchema = z.object({
    id: z.int(),
    uid: z.string(),
    mode: componentTypeSchema,
    type: z.custom<SourceType | ClientType>(),
    name: z.string(),
    /** General state of the component like Idle, Stopped, Running, Error */
    state: z.literal([1, 2, 3, 4, 5, 6, 7]).meta({description: 'General state of the component like Idle, Stopped, Running, Error'}),
    /** More specific, live activity state like "sleeping", "hydrating historical scrobbles", "processing dead scrobbles", etc... */
    status: z.string().optional().meta({description: 'More specific, live activity state like "sleeping", "hydrating historical scrobbles", "processing dead scrobbles", etc...'}),
    players: z.record(z.string(), sourcePlayerSchema),
    errors: errorIshSchema.array().optional(),
    warnings: errorIshSchema.array().optional(),
    monitoringStatus: z.object({
        monitoring: z.boolean(),
        origin: z.enum([MONITORING_ORIGIN_USER, MONITORING_ORIGIN_SYSTEM]),
    }).optional(),
    deadLetterPlays: z.int(),
    deadLetterPlaysTotal: z.int(),
    queued: z.int(),
    /** number of discovered/scrobbled plays found in real time */
    countLive: z.int().meta({description: 'number of discovered/scrobbled plays found in real time'}),
    /** number of discovered/scrobbled plays from backlog/jobs */
    countNonLive: z.int().meta({description: 'number of discovered/scrobbled plays from backlog/jobs'}),
    /** seconds of discovered plays (sources only) */
    listenedLive: z.int().meta({description: 'seconds of discovered plays (sources only)'}),
    createdAt: zDayjsStrict.optional(),
    lastReadyAt: zDayjsStrict.optional(),
    lastActiveAt: zDayjsStrict.optional(),
});
export type ComponentCommonApiJson = z.input<typeof componentCommonApiSchema>;

export const componentHistoricalApiSchema = z.object({
    synced: z.boolean(),
    syncedReason: z.string().nullable().optional(),
    syncError: errorIshSchema.nullable().optional(),
    lastImport: zDayjsStrict.optional(),
    lastImportSuccess: zDayjsStrict.optional(),
});
export type ComponentHistoricalApiJson = z.input<typeof componentHistoricalApiSchema>;

const componentDetailedApiSchema = componentCommonApiSchema.extend({
    hasAuth: z.boolean(),
    hasAuthInteraction: z.boolean(),
    authed: z.boolean(),
    authType: z.enum(Object.values(COMPONENT_AUTH_TYPE)),
    initialized: z.boolean(),
}).extend(componentHistoricalApiSchema.partial().shape);

export const componentClientApiSchema = componentDetailedApiSchema.extend({
    tracksScrobbled: z.int(),
    supportsNowPlaying: z.boolean(),
    players: z.record(z.string(), sourcePlayerSchema.extend({
        /** when a now playing that is not realtime is cleared */
        expiration: zDayjsStrict.optional().meta({description: 'when a now playing that is not realtime is cleared'}),
    })),
});
export type ComponentClientApiJson = z.input<typeof componentClientApiSchema>;

export const componentSourceApiSchema = componentDetailedApiSchema.extend({
    sot: z.enum(sourceSotTypes),
    supportsUpstreamRecentlyPlayed: z.boolean(),
    tracksDiscovered: z.int(),
    wakeAt: zDayjsStrict.optional(),
    sleeping: z.boolean(),
});
export type ComponentSourceApiJson = z.input<typeof componentSourceApiSchema>;

export type SubsonicSourceApiJson = ComponentSourceApiJson & { playbackReporting?: boolean }

export type ComponentsApiJson = ComponentSourceApiJson | ComponentClientApiJson;

export const isComponentSourceApiJson = (data: ComponentCommonApiJson): data is ComponentSourceApiJson => {
    return data.mode === 'source';
}
export const isComponentClientApiJson = (data: ComponentCommonApiJson): data is ComponentClientApiJson => {
    return data.mode === 'client';
}

export type MsSseEventPayload<T extends object = Record<string, any>> = {
    type: SourceType | ClientType
    name: string
    componentId: number
    from: ComponentType
    data: T
    event: string
}

export type MsSseEvent = {
    playerUpdate: MsSseEventPayload<SourcePlayerJson>
    discovered: MsSseEventPayload
    scrobbleQueued: MsSseEventPayload
    scrobbleDequeued: MsSseEventPayload
    componentUpdate: MsSseEventPayload<ComponentCommonApiJson>
    playInsert: MsSseEventPayload<PlayApiCommonDetailed>
    playUpdate: MsSseEventPayload<Partial<PlayApiCommonDetailed>>
    log: LogEvent
}

export type SortPlaysBy = 'played' | 'seen';
export interface SortPlaysByProps {
    sortBy: SortPlaysBy
}

export type PlayStateUI = PlayState | 'failed TBR';
export type QueryPlaysOptsJsonRefreshable = Omit<QueryPlaysOptsJson, 'state'> & {nonce?: string, state?: PlayStateUI[]};


/** Query string values are always strings so numbers are coerced */
const zQueryInt = z.coerce.number<number>().int();
/** boolean in a JSON body, 'true'/'false' in a query string */
const zQueryBool = z.union([z.boolean(), z.stringbool()]);

export const compareDateSchema = z.discriminatedUnion('type', [
    z.object({
        type: z.enum(['eq', 'ne', 'gt', 'gte', 'lt', 'lte']),
        date: zDayjsStrict,
    }),
    z.object({
        type: z.literal('between'),
        range: z.tuple([zDayjsStrict, zDayjsStrict]),
        /** include the range boundaries, defaults to true */
        inclusive: zQueryBool.optional().meta({description: 'include the range boundaries, defaults to true'}),
    }),
]);
export type CompareDateOp<D extends DateLike = Dayjs> = DateSide<D, typeof compareDateSchema>;
export type CompareDateSingle<D extends DateLike = Dayjs> = Exclude<CompareDateOp<D>, {type: 'between'}>;
export type CompareDateBetween<D extends DateLike = Dayjs> = Extract<CompareDateOp<D>, {type: 'between'}>;

const playStateEnum = z.enum(PLAY_STATES as [PlayState, ...PlayState[]]);
const queueStatusEnum = z.enum(QUEUE_STATUSES as [QueueStatus, ...QueueStatus[]]);

export const queueCriteriaSchema = z.object({
    queueName: z.enum(QUEUE_NAMES as [QueueName, ...QueueName[]]),
    queueStatus: z.union([queueStatusEnum, queueStatusEnum.array()]),
    /** only match queue states with retries less than or equal to this */
    retries: zQueryInt.optional().meta({description: 'only match queue states with retries less than or equal to this'}),
});

export const playWhereOptsSchema = z.object({
    state: playStateEnum.array().optional(),
    stateNot: playStateEnum.array().optional(),
    componentId: zQueryInt.optional(),
    seenAt: compareDateSchema.optional(),
    playedAt: compareDateSchema.optional(),
    queues: queueCriteriaSchema.array().optional(),
    uid: z.string().array().optional(),
    /** match text in track title, artists or album name */
    text: z.string().array().optional().meta({description: 'match text in track title, artists or album name'}),
});

export const WITH_PLAY_RELATIONS = ['input', 'parent', 'parent-input', 'queues', 'events', 'children'] as const;

export const queryPlaysOptsSchema = playWhereOptsSchema.extend({
    sort: z.enum(['seenAt', 'playedAt']).optional(),
    order: z.enum(['asc', 'desc']).optional(),
    with: z.enum(WITH_PLAY_RELATIONS).array().optional(),
    limit: zQueryInt.optional(),
    offset: zQueryInt.optional(),
});

/** Plays query from an API request. The Component comes from the route, never the request. */
export const queryPlaysRequestSchema = queryPlaysOptsSchema.omit({componentId: true});

export type QueryPlaysOptsJson = z.input<typeof queryPlaysRequestSchema>;

export interface PaginatedQueryResponse {
    limit: number;
    offset: number;
    total?: number;
}
export interface PaginatedResponse<T> {
    data: T[];
    meta: PaginatedQueryResponse;
}

export type CacheClearType = 'external-api' | 'transforms';

export const componentStateBodySchema = z.object({
    state: z.enum(["stop","start","restart","ignore","monitor"]),
    reason: z.string().optional()
});

export type ComponentStateBody = z.infer<typeof componentStateBodySchema>;

export const playStateBodySchema = z.object({
    state: z.enum(["discarded"]),
    reason: z.string().optional()
});

export type PlayStateBody = z.infer<typeof playStateBodySchema>;

export const metadataResultBaseSchema = z.object({
        id: z.string()
});
export type MetadataResultBase = z.infer<typeof metadataResultBaseSchema>;

export const metadataResultServiceScoreSchema = z.object({
    service: z.string(),
    score: z.int().nonnegative().optional(),
})
export type MetadataResultServiceScore = z.infer<typeof metadataResultServiceScoreSchema>;

export const metadataResultImageSchema = z.object({
    image: z.string().optional()
})
export type MetadataResultImage = z.infer<typeof metadataResultImageSchema>;

export const metadataResultAlbumTypeSchema = z.object({
    /** The kind of release the album is (album, single, ep...) */
    albumType: z.string().optional(),
    albumTypeHint: z.string().optional()
})

/** An error from a single metadata provider, serialized with serializeError */
export const metadataSearchErrorSchema = z.object({
    service: z.string(),
    error: z.looseObject({
        name: z.string().optional(),
        message: z.string().optional(),
        stack: z.string().optional(),
    })
});
export type MetadataSearchError = {service: string, error: ErrorObject};

/** Media type a client sends in the Accept header to get metadata search results as a stream of lines instead of one JSON response */
export const NDJSON_MEDIA_TYPE = 'application/x-ndjson';

/** One line of a streamed metadata search response. A stream that ends without a 'done' line was cut short. */
export type MetadataSearchStreamLine<T> =
    | {type: 'result', service: string, data: T[]}
    | ({type: 'error'} & MetadataSearchError)
    | {type: 'done'};

/** A Credit for an artist with the service it was found on */
export const artistSearchResultSchema = z.object({
    ...creditSchema.shape,
    ...metadataResultBaseSchema.shape,
    ...metadataResultServiceScoreSchema.shape,
});
export type ArtistSearchResult = z.infer<typeof artistSearchResultSchema>;

export const artistSearchResultResponseSchema = z.object({
    data: artistSearchResultSchema.array(),
    errors: metadataSearchErrorSchema.array()
});
export type ArtistSearchResultResponse = z.infer<typeof artistSearchResultResponseSchema>;

/** A Credit for an album with the service it was found on */
export const albumSearchResultSchema = z.object({
    ...creditSchema.shape,
    ...metadataResultBaseSchema.shape,
    ...metadataResultServiceScoreSchema.shape,
    ...metadataResultAlbumTypeSchema.shape,
    date: z.string().optional(),
    country: z.string().optional(),
    artists: artistSearchResultSchema.array().optional(),
});
export type AlbumSearchResult = z.infer<typeof albumSearchResultSchema>;

export const albumSearchResultResponseSchema = z.object({
    data: albumSearchResultSchema.array(),
    errors: metadataSearchErrorSchema.array()
});
export type AlbumSearchResultResponse = z.infer<typeof albumSearchResultResponseSchema>;

/** TrackData with the service it was found on. Artists and album are results from the same service. */
export const trackSearchResultSchema = z.object({
    ...playTrackDataSchema.shape,
    ...metadataResultBaseSchema.shape,
    ...metadataResultServiceScoreSchema.shape,
    artists: artistSearchResultSchema.array().optional(),
    albumArtists: artistSearchResultSchema.array().optional(),
    album: albumSearchResultSchema.optional(),
    /** Number of albums the track was found on */
    albumCount: z.int().nonnegative().optional(),
});
export type TrackSearchResult = z.infer<typeof trackSearchResultSchema>;

export const trackSearchResultResponseSchema = z.object({
    data: trackSearchResultSchema.array(),
    errors: metadataSearchErrorSchema.array()
});
export type TrackSearchResultResponse = z.infer<typeof trackSearchResultResponseSchema>;

export const trackDataCreditBaseSchema = z.object({
    track: creditBaseSchema.optional().meta({
        description: `a track credit to search by`
    }),
    artists: creditBaseSchema.array().optional().meta({
        description: 'a list of artist Credits'
    }),
    album: creditBaseSchema.optional().meta({
        description: 'an album credit'
    })
})
export type TrackDataCreditBase = z.infer<typeof trackDataCreditBaseSchema>;

export const trackSearchSimpleRequestQuerySchema = z.object(
    {
        track: z.union([trackSearchHash, z.string()]).meta({
            description: `the track name or prefix:id to search for`
        }),
        artists: z.string().array().optional().meta({
            description: 'a list of plain artist strings associated with the track'
        }),
        album: z.string().optional().meta({
            description: 'a plain album name string associated with the track'
        })
    }
);
export type TrackSearchSimpleRequestQuery = z.infer<typeof trackSearchSimpleRequestQuerySchema>;

export const albumSearchSimpleRequestQuerySchema = z.object(
    {                
        album: z.union([albumSearchHash, z.string()]).meta({
            description: 'the album name or prefix:id to search for'
        }),
        artists: z.string().array().optional().meta({
            description: 'a list of plain artist strings associated with the album'
        }),

    }
);

export type AlbumSearchSimpleRequestQuery = z.infer<typeof albumSearchSimpleRequestQuerySchema>;

export const artistSearchSimpleRequestQuerySchema = z.object({
    artist: z.union([artistSearchHash, z.string()]).meta({
        description: 'a plain artist name or prefix:id to search for'
    }),
});
export type ArtistSearchSimpleRequestQuery = z.infer<typeof artistSearchSimpleRequestQuerySchema>;

export const EXTERNAL_ART_URL_REGEX = new RegExp(/api\/components\/\d+\/art/);

export interface ComponentStat {
    count: number;
    types?: (SourceType | ClientType)[];
}

export interface PublicDashboardData {
    /** Total count of successfuly scrobbed Plays from all components for a user.
     * 
     * This is equivalent to the sum of the `countLive` property on all `client` type drizzle entities */
    scrobbles?: number;
    /** Total count of discovered Plays from all components for a user.
     * 
     * This is equivalent to the sum of the `countLive` property on all `source` type drizzle entities */
    plays?: number;
    /** Total number of seconds for all discovered Plays for all components for a user.
     * 
     * This uses `listenedFor` on a Play if present, otherwise falls back to full `duration`, or the Play is skipped during summation. */
    listened?: number;
    /** Data about all `source` type components for a User
     * 
     * * `count` is the total number of components
     * * `types` is an array of unique component types
     **/
    sources?: ComponentStat;
    /** Data about all `client` type components for a User
     * 
     * * `count` is the total number of components
     * * `types` is an array of unique component types
     **/
    clients?: ComponentStat;
    /** A list of unique, recently scrobbled Plays.
     * 
     * Unique in that they all have distinct PlayData, rather than the same Discovered Play sent to 3x clients (but its all the same data)
     **/
    recent?: PublicPlay[]
    /** The currently playing Play, null when nothing is playing. undefined = Now Playing is not enabled
     *
     * `meta.source` is the type of the component it came from (spotify, jellyfin...), never its name
     * */
    nowPlaying?: PublicPlay | null
}

/** A Source or client that can be picked as the public dashboard's Now Playing (publicDashboardSettings.nowPlaying) */
export interface NowPlayingOption {
    from: 'source' | 'client'
    uid: string
    name: string
    type: string
}

export type PublicPlay = {
    data: TrackData & Pick<JsonPlayObject['data'], 'listenedFor' | 'repeat'>,
    meta: Pick<JsonPlayObject['meta'], 'source' | 'musicService' | 'url'>,
}