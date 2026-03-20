import { Traverse, TraverseContext } from 'neotraverse/modern';
import { faker } from '@faker-js/faker';
import dayjs from 'dayjs';
import { AmbPlayObject, JsonPlayObject, LifecycleInput, LifecycleStep, ObjectPlayData, PlayMeta, PlayObject, PlayProgressAmb, REGEX_ISO8601_LOOSE, ScrobbleResult } from '../../Atomic.js';
import { ListenRange } from '../../../backend/sources/PlayerState/ListenRange.js';
import { ListenProgressPositional, ListenProgressTS } from '../../../backend/sources/PlayerState/ListenProgress.js';
import { MarkOptional } from 'ts-essentials';
import { generateBrainz, generateMbid, generatePlay, GeneratePlayOpts, generatePlays } from '../../PlayTestUtils.js';
import { lifecyclelessInvariantTransform } from '../../PlayUtils.js';
import clone from 'clone';
import { jdiff } from '../../DataUtils.js';
import { existingScrobble } from '../../../backend/utils/PlayComparisonUtils.js';
import { UpstreamError } from '../../../backend/common/errors/UpstreamError.js';
import { playToListenPayload } from '../../../backend/common/vendor/listenbrainz/lzUtils.js';

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

export interface ScrobbleMatchOptions {
  match?: boolean
  warnings?: boolean
  error?: boolean
}
export interface GeneratePlayWithLifecycleOptions {
  original?: {
    data?: ObjectPlayData,
    meta?: MarkOptional<PlayMeta, 'lifecycle'>
    opts?: GeneratePlayOpts
  }
}

export const generatePlayWithLifecycle = (opts: GeneratePlayWithLifecycleOptions = {}) => {

  const {
    original: originalOpts = {},
  } = opts;

  const original = generatePlay(originalOpts.data, originalOpts.meta, originalOpts.opts);

  const lplay: PlayObject = {
    data: {},
    meta: {
      ...original.meta
    }
  };
  lplay.meta.lifecycle.original = lifecyclelessInvariantTransform(original);
  lplay.meta.lifecycle.input = generateRandomObj();

  let steps: LifecycleStep[] = [];
  let transformedPlay = clone(original);
  const firstStep = faker.datatype.boolean(0.7) ? generateLifecycleStep(transformedPlay, {name: 'preCompare'}) : undefined;
  if(firstStep !== undefined) {
    transformedPlay = firstStep[1];
    steps.push(firstStep[0]);
    while(faker.datatype.boolean(0.2)) {
      const [pc, modified] = generateLifecycleStep(transformedPlay, {name: 'preCompare'});
      steps.push(pc);
      transformedPlay = modified;
    }
  }

  const lastStep = faker.datatype.boolean(0.5) ? generateLifecycleStep(transformedPlay, {name: 'postCompare'}) : undefined;
  if(lastStep !== undefined) {
    transformedPlay = lastStep[1];
    steps.push(lastStep[0]);
    while(faker.datatype.boolean(0.1)) {
      const [pc, modified] = generateLifecycleStep(transformedPlay, {name: 'postCompare'});
      steps.push(pc);
      transformedPlay = modified;
    }
  }

  lplay.meta.lifecycle.steps = steps;
  lplay.data = transformedPlay.data;

  return lplay;
}

export const playWithLifecycleScrobble = async (play: PlayObject, opts: ScrobbleMatchOptions = {}): Promise<PlayObject> => {
  const {
    match = false,
    warnings = false,
    error = false,
  } = opts;

  const scrobbleRes: ScrobbleResult = {};

  const existingPlays = generatePlays(2);

  if(match) {
    existingPlays.push(play);
  }

  const res = await existingScrobble(play, existingPlays);
  scrobbleRes.match = res;
  if(res.match) {
    play.meta.lifecycle.scrobble = scrobbleRes;
    return play;
  }

  scrobbleRes.payload = playToListenPayload(play);
  if(error) {
    scrobbleRes.error = new Error('Failed to scrobble to client', {cause: new UpstreamError('Client returned a 400 or something')});
    play.meta.lifecycle.scrobble = scrobbleRes;
    return play;
  }

  if(warnings) {
    scrobbleRes.warnings = faker.helpers.multiple(faker.lorem.sentence, {count: {min: 1, max: 3}});
  }

  scrobbleRes.response = generateRandomObj(2);
  scrobbleRes.mergedScrobble = lifecyclelessInvariantTransform(play);
  play.meta.lifecycle.scrobble = scrobbleRes;

  return play;
}

export const generateLifecycleInput = (typeName?: string): LifecycleInput => {
  return { type: typeName ?? `${faker.string.alpha(2)}-${faker.hacker.noun()}`, input: generateRandomObj(2) };
}

export interface GenerateLifecycleOptions {
  name?: string
  source?: string
  equal?: boolean
  inputCount?: number
}

const modifiableKeys: PropertyKey[] = ['track', 'album', 'albumArtists', 'artists', 'duration', 'meta','brainz'];
export const generateLifecycleStep = (play: PlayObject, opts: GenerateLifecycleOptions = {}): [LifecycleStep, PlayObject] => {

  const {
    name = ['preCompare', 'postCompare'][faker.number.int({ min: 0, max: 1 })],
    source = `${play.meta?.source}-${faker.word.noun()}`,
    equal = faker.datatype.boolean(0.1),
    inputCount
  } = opts;

  const inputs = faker.helpers.multiple(() => generateLifecycleInput(), { count: inputCount ?? { min: 0, max: 2 } });

  const step: LifecycleStep = {
    name,
    source,
    inputs
  }

  if (equal) {
    return [step, play];
  }

  play.data.meta = {
    ...(play.data?.meta ?? {}),
    brainz: {
      ...(play.data?.meta?.brainz ?? {})
    }
  }

  const modifiedPlay = clone(play);
  const randomPlay = generatePlay();
  let somethingModified = false;
  while (!somethingModified) {
    new Traverse(modifiedPlay).forEach((ctx, x) => {
      if (modifiableKeys.includes(ctx.key)) {
        if (faker.datatype.boolean(0.3)) {
          if(ctx.key === 'meta' && (ctx.parent === undefined || ctx.parent.key !== 'data')) {
            return;
          }
          somethingModified = true;
          if(ctx.key === 'brainz' && Object.keys(x).length === 0) {
              ctx.update(generateBrainz(play, {include: ['album', 'artist', 'track']}), true);
          } else if (ctx.parent !== undefined && ctx.parent.key === 'brainz') {
            if (Array.isArray(x)) {
              ctx.update(faker.helpers.multiple(generateMbid, { count: { min: 1, max: 3 } }));
            } else {
              ctx.update(generateMbid());
            }
          } else {
            ctx.update(randomPlay.data[ctx.key]);
          }
        }
      }
    });
  }

  step.patch = jdiff.diff(play, modifiedPlay);

  return [step, modifiedPlay];
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