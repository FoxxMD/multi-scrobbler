import dayjs from 'dayjs';
import { Traverse, type TraverseContext } from 'neotraverse/modern';
import { REGEX_ISO8601_LOOSE } from './Atomic.ts';
import type { JsonPlayObject, PlayObject, SourcePlayerJson, SourcePlayerObj } from './PlaySchema.ts';
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

/** Serialize a Play to its JSON shape (ISO8601 string dates). Throws if the Play does not validate. */
export const asJsonPlayObject = (play: PlayObject): JsonPlayObject =>
  playObjectInternalSchema.encode(play as Parameters<typeof playObjectInternalSchema.encode>[0]) as JsonPlayObject;

/** Deserialize a JSON Play to a Play (Dayjs dates). Throws if the data does not validate. */
export const asPlay = (data: JsonPlayObject): PlayObject =>
  playObjectInternalSchema.decode(data as Parameters<typeof playObjectInternalSchema.decode>[0]) as PlayObject;

/** Serialize a Player to its JSON shape. Only its Play has Dayjs dates. Throws if the Play does not validate. */
export const asJsonPlayer = (player: SourcePlayerObj): SourcePlayerJson =>
  ({...player, play: player.play === undefined ? undefined : asJsonPlayObject(player.play)});

/**
 * Parse stored play JSON that may be in a legacy shape, without validating it.
 *
 * Only for app migrations, which convert plays stored before the current schema.
 */
export const asLegacyPlay = (json: string): PlayObject => {
  const play = JSON.parse(json);
  // legacy shapes are not described by any schema so guess which strings are dates
  new Traverse(play).forEach((ctx, x) => {
    if (shouldBlock(ctx)) {
      ctx.block();
      return;
    }
    if (typeof x === 'string' && REGEX_ISO8601_LOOSE.test(x)) {
      ctx.update(dayjs(x), true);
    }
  });
  return play;
};
