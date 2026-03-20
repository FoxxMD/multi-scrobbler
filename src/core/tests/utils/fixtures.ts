import { Traverse, TraverseContext } from 'neotraverse/modern';
import { faker } from '@faker-js/faker';
import dayjs from 'dayjs';
import { AmbPlayObject, JsonPlayObject, ObjectPlayData, PlayMeta, PlayObject, PlayProgressAmb, REGEX_ISO8601_LOOSE } from '../../Atomic.js';
import { ListenRange } from '../../../backend/sources/PlayerState/ListenRange.js';
import { ListenProgressPositional, ListenProgressTS } from '../../../backend/sources/PlayerState/ListenProgress.js';
import { clone } from 'jsondiffpatch';
import { MarkOptional } from 'ts-essentials';

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
]

const shouldBlock = (ctx: TraverseContext): boolean => {
  if (blockedKeys.includes(ctx.key)) {
    return true;
  }
  return blockedPaths.some((x) => {
    let blocked = x.key === ctx.key;
    if (blocked && x.parent !== undefined) {
      blocked = ctx.parent !== undefined && ctx.parent.key === x.parent;
    }
    return blocked;
  })
}

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
}

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
      })
      ctx.update(ranges, true);
    }
  });
  return cloned as unknown as PlayObject;
}

export interface GeneratePlayWithLifecycleOptions {
  original: {
    data?: ObjectPlayData,
    meta?: MarkOptional<PlayMeta, 'lifecycle'>
  }
}
export const generatePlayWithLifecycle = (opts: GeneratePlayWithLifecycleOptions) => {

}

export interface RandomObjOptions {
  maxObjSize?: number
  maxKeyLength?: number
  keyCount?: number
  maxDepth?: number
}

const generateRandomVal = (depth: number = 0, opt: RandomObjOptions = {}, typeId?: number) => {
  const i = typeId ?? faker.number.int({ min: 1, max: depth > (opt.maxDepth ?? 3) ? 6 : 8 });
  switch (i) {
    case 1:
      return undefined;
    case 2:
      return faker.datatype.boolean();
    case 3:
      return faker.date.recent().toISOString();
    case 4:
      return faker.lorem.word();
    case 5:
      return faker.lorem.sentences({ min: 0, max: 5 });
    case 6:
      return faker.helpers.arrayElement([faker.number.int({ min: 1, max: 1000 }), faker.number.float()]);
    case 7:
      return generateRandomObj(depth + 1, opt);
    case 8:
      const typeId = faker.number.int({ min: 4, max: depth > (opt.maxDepth ?? 3) ? 6 : 7 });
      return faker.helpers.multiple(() => generateRandomVal(depth + 1, opt, typeId), { count: { min: 1, max: opt.maxObjSize ?? 7 } })
  }
}

export const generateRandomObj = (depth: number = 0, opt: RandomObjOptions = {}) => {
  const tgrt: any = {}

  const keyCount = opt.keyCount ?? faker.number.int({ min: 1, max: 13 });

    for (let i = 0; i < keyCount; i++) {
      const key = faker.lorem.slug({ min: 1, max: 3 })
      if (tgrt[key] === undefined) {
        tgrt[key] = generateRandomVal(depth + 1, opt)
      }
    }
  return tgrt
}