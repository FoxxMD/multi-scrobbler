import { Traverse, TraverseContext } from 'neotraverse/modern';
import { faker } from '@faker-js/faker';
import { LifecycleInput, LifecycleStep, ObjectPlayData, PlayMeta, PlayObject, ScrobbleResult } from '../../Atomic.js';
import { MarkOptional } from 'ts-essentials';
import { generateBrainz, generateMbid, generatePlay, GeneratePlayOpts, generatePlays } from '../../PlayTestUtils.js';
import { lifecyclelessInvariantTransform } from '../../PlayUtils.js';
import clone from 'clone';
import { diffObjects } from '../../DataUtils.js';
import { existingScrobble } from '../../../backend/utils/PlayComparisonUtils.js';
import { UpstreamError } from '../../../backend/common/errors/UpstreamError.js';
import { playToListenPayload } from '../../../backend/common/vendor/listenbrainz/lzUtils.js';
import { mergeSimpleError, SimpleError, SkipTransformStageError, StagePrerequisiteError } from '../../../backend/common/errors/MSErrors.js';

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
  },
  lifecycleSteps?: {
    preCompare?: number | (boolean | 'prereq' | 'skipped' | 'stop' | 'continuewitherror')[]
    postCompare?: number | (boolean | 'prereq' | 'skipped'| 'stop' | 'continuewitherror')[]
  }
}

export const generatePlayWithLifecycle = (opts: GeneratePlayWithLifecycleOptions = {}) => {

  const {
    original: originalOpts = {},
    lifecycleSteps: {
      preCompare,
      postCompare,
    } = {}
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

  if(preCompare !== undefined) {
    if(typeof preCompare === 'number') {
      for(let i = 0; i < preCompare; i++) {
        const step = generateLifecycleStep(transformedPlay, {name: 'preCompare'});
        steps.push(step[0]);
        transformedPlay = step[1];
      }
    } else {
      for (const prec of preCompare) {
        const [step, modified] = generateLifecycleStep(transformedPlay, { name: 'preCompare', error: prec === true ? undefined : prec === false ? true : prec })
        steps.push(step);
        if (step.flowResult === 'continue') {
          transformedPlay = modified;
        } else {
          break;
        }
      }
    }
  }

  if(postCompare !== undefined) {
    if (typeof postCompare === 'number') {
      for (let i = 0; i < postCompare; i++) {
        const step = generateLifecycleStep(transformedPlay, { name: 'postCompare' });
        steps.push(step[0]);
        transformedPlay = step[1];
      }
    } else {
      for (const postc of postCompare) {
        const [step, modified] = generateLifecycleStep(transformedPlay, { name: 'preCompare', error: postc === true ? undefined : postc === false ? true : postc })
        steps.push(step);
        if (step.flowResult === 'continue') {
          transformedPlay = modified;
        } else {
          break;
        }
      }
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
  error?: boolean | 'prereq' | 'skipped' | 'stop' | 'continuewitherror'
  inputCount?: number
}

const modifiableKeys: PropertyKey[] = ['track', 'album', 'albumArtists', 'artists', 'duration', 'meta','brainz'];
export const generateLifecycleStep = (play: PlayObject, opts: GenerateLifecycleOptions = {}): [LifecycleStep, PlayObject] => {

  const {
    name = ['preCompare', 'postCompare'][faker.number.int({ min: 0, max: 1 })],
    source = `${play.meta?.source}-${faker.word.noun()}`,
    equal = faker.datatype.boolean(0.1),
    error = false,
    inputCount
  } = opts;

  const inputs = faker.helpers.multiple(() => generateLifecycleInput(), { count: inputCount ?? { min: 0, max: 2 } });

  const step: LifecycleStep = {
    name,
    source,
    flowResult: 'continue',
    inputs
  }

  if (equal) {
    return [step, play];
  }

  if(error !== false) {
    if(error === true) {
      step.flowResult = 'stop';
      step.flowReason = 'Error encountered while transforming';
      step.error = new Error('Failed to do something', {cause: new Error('Oops it borked.')});
    } else if(error === 'prereq') {
      step.flowResult = 'stop';
      step.flowKnownState = 'prereq';
      step.flowReason = 'Transform could not be completed due to prerequisite failure';
      step.error = mergeSimpleError(new StagePrerequisiteError('No matches returned from Musicbrainz API', {shortStack: true, cause: new SimpleError('Results were empty')}));
    } else if(error === 'stop') {
      step.flowResult = 'stop';
    } else if(error === 'continuewitherror') {
      step.flowResult = 'continue';
      step.flowReason = 'Transform encountered an error but continuing due to onFailure: continue';
      step.error = mergeSimpleError(new SkipTransformStageError('An error that was an okay to continue with'));
    } else {
      step.flowResult = 'continue';
      step.flowKnownState = 'skip';
      step.flowReason = `Stage ${name} was skipped`;
      step.error = mergeSimpleError(new SkipTransformStageError('No desired MBIDs were missing', {shortStack: true}));
    }

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
          if(ctx.key === 'brainz' && Object.keys(x ?? {}).length === 0) {
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

  step.patch = diffObjects(play.data, modifiedPlay.data);// jdiff.diff(play, modifiedPlay);

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