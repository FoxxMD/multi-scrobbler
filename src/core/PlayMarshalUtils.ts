import clone from 'clone';
import dayjs from 'dayjs';
import { Traverse, type TraverseContext } from 'neotraverse/modern';
import { type JsonPlayObject, type PlayObject, REGEX_ISO8601_LOOSE } from './Atomic.ts';
import { playObjectInternalSchema } from './PlaySchema.ts';

interface BlockPath { key: string, parent: string };
type BlockPaths = BlockPath[];

/** We know some nodes will never have data that needs to be transformed
 * and these nodes can have lots of data so we can optimize them away by not (recursively) traversing them
 */
const blockedKeys: PropertyKey[] = ['patch', 'inputs', 'payload', 'response', 'error'];
/** We know some paths/nodes will never have data that needs to be transformed
 * and these nodes can have lots of data so we can optimize them away by not (recursively) traversing them
 */
const blockedPaths: BlockPaths = [
  {
    parent: 'data',
    key: 'meta'
  },
  {
    parent: 'lifecycle',
    key: 'input'
  }
];

export const shouldBlock = (ctx: TraverseContext): boolean => {
  if (ctx.key !== undefined && blockedKeys.includes(ctx.key)) {
    return true;
  }
  return blockedPaths.some((x) => {
    let blocked = x.key === ctx.key;
    if (blocked && x.parent !== undefined) {
      blocked = ctx.parent !== undefined && ctx.parent.key === x.parent;
    }
    return blocked;
  });
};

/** Convert dates in an object, in place, by traversing it and guessing which strings are dates */
const marshalDates = (obj: object, direction: 'encode' | 'decode'): void => {
  new Traverse(obj).forEach((ctx, x) => {
    if (shouldBlock(ctx)) {
      ctx.block();
      return;
    }
    if (direction === 'encode' && dayjs.isDayjs(x)) {
      ctx.update(x.toISOString());
    } else if (direction === 'decode' && typeof x === 'string' && REGEX_ISO8601_LOOSE.test(x)) {
      ctx.update(dayjs(x), true);
    }
  });
};

// ponytail: blob traversal, replace with real schemas for original/scrobble/lifecycle in pass 2
const BLOB_KEYS = ['original', 'scrobble', 'lifecycle'] as const;

/** Convert dates in the free-form blobs of a play (not described by playObjectSchema) in place, cloning the blob first if `copy` */
const marshalBlobs = (play: Record<string, any>, direction: 'encode' | 'decode', copy: boolean): void => {
  for (const key of BLOB_KEYS) {
    if (play[key] === undefined || play[key] === null) {
      continue;
    }
    if (copy) {
      play[key] = clone(play[key]);
    }
    marshalDates(play[key], direction);
  }
};

/** Serialize a Play to its JSON shape (ISO8601 string dates). Throws if the Play does not validate. */
export const asJsonPlayObject = (play: PlayObject): JsonPlayObject => {
  const json = playObjectInternalSchema.encode(play as Parameters<typeof playObjectInternalSchema.encode>[0]);
  marshalBlobs(json, 'encode', true);
  return json as JsonPlayObject;
};

/** Deserialize a JSON Play to a Play (Dayjs dates). Throws if the data does not validate. */
export const asPlay = (data: JsonPlayObject): PlayObject => {
  const play = playObjectInternalSchema.decode(data as Parameters<typeof playObjectInternalSchema.decode>[0]);
  marshalBlobs(play, 'decode', true);
  return play as PlayObject;
};

/**
 * Deserialize a JSON Play to a Play without cloning the free-form blobs.
 *
 * Only use when the source is a throw-away object (like from drizzle fromDriver) since its blobs are mutated.
 */
export const asPlayCheap = (data: JsonPlayObject): PlayObject => {
  const play = playObjectInternalSchema.decode(data as Parameters<typeof playObjectInternalSchema.decode>[0]);
  marshalBlobs(play, 'decode', false);
  return play as PlayObject;
};

/**
 * Parse stored play JSON that may be in a legacy shape, without validating it.
 *
 * Only for app migrations, which convert plays stored before the current schema.
 */
export const asLegacyPlay = (json: string): PlayObject => {
  const play = JSON.parse(json);
  marshalDates(play, 'decode');
  return play;
};
