import clone from 'clone';
import dayjs from 'dayjs';
import { Traverse, TraverseContext } from 'neotraverse/modern';
import { ListenRange } from '../backend/sources/PlayerState/ListenRange.js';
import { AmbPlayObject, JsonPlayObject, PlayObject, PlayProgressAmb, REGEX_ISO8601_LOOSE } from './Atomic.js';
import { ListenProgressPositional, ListenProgressTS } from '../backend/sources/PlayerState/ListenProgress.js';

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
  if (blockedKeys.includes(ctx.key)) {
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

export const asJsonPlayObject = (play: AmbPlayObject): JsonPlayObject => {
  const cloned = clone(play);
  new Traverse(cloned).forEach((ctx, x) => {
    if (shouldBlock(ctx)) {
      ctx.block();
      return;
    }

    if (dayjs.isDayjs(x)) {
      ctx.update(x.toISOString());
    } else if (x instanceof ListenRange) {
      ctx.update(x.toJSON(), true);
    }
  });
  return cloned as unknown as JsonPlayObject;
};

export const asPlay = (data: JsonPlayObject): PlayObject => {
  const cloned = clone(data);
  new Traverse(cloned).forEach((ctx, x) => {
    if (shouldBlock(ctx)) {
      ctx.block();
      return;
    }

    if (typeof x === 'string' && REGEX_ISO8601_LOOSE.test(x)) {
      ctx.update(dayjs(x), true);
    } else if (ctx.key === 'listenRanges') {
      const ranges = x[0].map((y: PlayProgressAmb<string>) => {
        if (y.positionPercent === undefined) {
          return new ListenProgressPositional({ timestamp: dayjs(y.timestamp), position: y.position });
        } else {
          return new ListenProgressTS({ timestamp: dayjs(y.timestamp), positionPercent: y.positionPercent });
        }
      });
      ctx.update(ranges, true);
    }
  });
  return cloned as unknown as PlayObject;
};

