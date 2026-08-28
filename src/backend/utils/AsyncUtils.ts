import type {Mapper} from "p-map";
import { sleep } from "../utils.ts";
import { nanoid } from "nanoid";

/** https://stackoverflow.com/a/63795192/1469797 */
export async function findAsyncSequential<T>(
  array: T[],
  predicate: (t: T) => Promise<boolean>,
): Promise<T | undefined> {
  const i = await findIndexAsyncSequential(array, predicate);
  if(i === undefined) {
    return undefined;
  }
  return array[i];
}

export async function findIndexAsyncSequential<T>(
  array: T[],
  predicate: (t: T) => Promise<boolean>,
): Promise<number | undefined> {
    let index = 0;
  for (const t of array) {
    if (await predicate(t)) {
      return index;
    }
    index++;
  }
  return undefined;
}

/** https://stackoverflow.com/a/55601090/1469797 */
export async function findAsync<T>(
    array: T[],
    predicate: (t: T) => Promise<boolean>): Promise<T | undefined> {
  const i = await findIndexAsync(array, predicate);
  if(i === undefined) {
    return undefined;
  }
  return array[i];
}

export async function findIndexAsync<T>(
    array: T[],
    predicate: (t: T) => Promise<boolean>): Promise<number | undefined> {
  const promises = array.map(predicate);
  const results = await Promise.all(promises);
  const index = results.findIndex(result => result);
  return index;
}

export interface StaggerOptions {
   maxRandomStagger?: number, 
   initialInterval?: number, 
   concurrency: number 
  }
export function staggerMapper<Element, NewElement>(options: StaggerOptions) {
  const {
    initialInterval = 0,
    maxRandomStagger = 0,
    concurrency
  } = options;
  let initialStagger = 0;

  return (mapper: Mapper<Element, NewElement>) => async (x: Element, index: number) => {
    if (index < concurrency) {
      await sleep(initialStagger);
      initialStagger += initialInterval;
    } else {
      const s = Math.min((Math.random() * 1000), maxRandomStagger)
      await sleep(s);
    }
    return await mapper(x, index);
  }
}

export const consumeQueueOnce = async <T>(next: () => Promise<T | undefined>, process: (item: T) => Promise<void>, opts: {
  concurrency: number;
  signal: AbortSignal;
  onError?: (e: Error) => Promise<void>, onSuccess?: () => void
}): Promise<void> => {
  const { concurrency, signal, onError } = opts;
  signal.throwIfAborted();
  const inFlight = new Set<Promise<void>>();
  try {
    while (true) {
      signal.throwIfAborted();
      if (inFlight.size >= concurrency) {
        await Promise.race(inFlight);
        continue;
      }
      const item = await next();
      if (item === undefined) break;
      const task = (async () => {
        try {
          await process(item);
        } catch (err) {
          await onError?.(err); // swallow so one bad item doesn't kill the loop
        }
      })();
      inFlight.add(task);
      void task.then(() => inFlight.delete(task));
    }
  } finally {
    await Promise.allSettled(inFlight); // drain before sleeping or rethrowing
  }
};

export const consumeQueue = async <T>(
  next: (queueId: string) => Promise<T | undefined>,
  process: (item: T, queueId: string) => Promise<T | void>,
  opts: { 
    concurrency: number;
    idleMs: number;
    signal: AbortSignal;
    onError?: (e: Error, queueId: string) => Promise<void>,
    onSuccess?: (item: T, queueId: string) => void,
    onEmpty?: () => void
  },
): Promise<never> => {
  const { concurrency, idleMs, signal, onError, onEmpty, onSuccess } = opts;
  while (true) {
    signal.throwIfAborted();
    const inFlight = new Set<Promise<void>>();
    try {
      while (true) {
        signal.throwIfAborted();
        if (inFlight.size >= concurrency) {
          await Promise.race(inFlight);
          continue;
        }
        const qId = nanoid();
        const item = await next(qId);
        if (item === undefined) break;
        const task = (async () => {
          try {
            await process(item, qId);
            onSuccess?.(item, qId);
          } catch (err) {
            await onError?.(err, qId); // swallow so one bad item doesn't kill the loop
          }
        })();
        inFlight.add(task);
        void task.then(() => inFlight.delete(task));
      }
    } finally {
      await Promise.allSettled(inFlight); // drain before sleeping or rethrowing
    }
    onEmpty?.();
    await sleep(idleMs, { signal });
  }
}