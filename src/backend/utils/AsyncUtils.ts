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