import { randomInt } from "crypto";
import pMap, { Mapper, Options, pMapIterable } from "p-map";
import { sleep } from "../utils.js";

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

export function staggerMapper<Element, NewElement>(options: { maxRandomStagger?: number, initialInterval?: number, concurrency: number }) {
  const {
    initialInterval = 300,
    maxRandomStagger = 300,
    concurrency
  } = options;
  let initialStagger = 0;

  return (mapper: Mapper<Element, NewElement>) => async (x: Element, index: number) => {
    if (index < concurrency) {
      sleep(initialStagger);
      initialStagger += initialInterval;
    } else {
      const s = randomInt(maxRandomStagger)
      await sleep(s);
    }
    return await mapper(x, index);
  }
}