import backoffStrategies from '@kenyip/backoff-strategies';
import { replaceResultTransformer, stripIndentTransformer, TemplateTag, trimResultTransformer } from 'common-tags';
import dayjs, { Dayjs } from 'dayjs';
import { Duration } from "dayjs/plugin/duration.js";
import utc from 'dayjs/plugin/utc.js';
import { Request } from "express";
import { accessSync, constants, promises } from "fs";
import JSON5 from 'json5';
// https://github.com/jfromaniello/url-join#in-nodejs
import pathUtil from "path";
import { TimeoutError, WebapiError } from "spotify-web-api-node/src/response-error.js";
import { PlayObject } from "../core/Atomic.js";
import {
    asPlayerStateDataMaybePlay,
    NO_DEVICE,
    NO_USER,
    numberFormatOptions,
    PlayerStateDataMaybePlay,
    PlayPlatformId,
    ProgressAwarePlayObject,
    RegExResult,
    RemoteIdentityParts,
    ScrobbleThresholdResult,
} from "./common/infrastructure/Atomic.js";

//const { default: Ajv } = AjvNS;
dayjs.extend(utc);

export async function readJson(this: any, path: any, {throwOnNotFound = true} = {}) {
    try {
        await promises.access(path, constants.R_OK);
        const data = await promises.readFile(path);
        return JSON5.parse(data as unknown as string);
    } catch (e) {
        const {code} = e;
        if (code === 'ENOENT') {
            if (throwOnNotFound) {
                throw new Error(`No file found at given path: ${path}`, {cause: e});
            } else {
                return;
            }
        }
        throw new Error(`Encountered error while parsing file: ${path}`, {cause: e})
    }
}

export async function readText(path: any) {
    await promises.access(path, constants.R_OK);
    const data = await promises.readFile(path);
    return data.toString();

    // return new Promise((resolve, reject) => {
    //     fs.readFile(path, 'utf8', function (err, data) {
    //         if (err) {
    //             reject(err);
    //         }
    //         resolve(JSON.parse(data));
    //     });
    // });
}

export async function writeFile(path: any, text: any) {
    // await promises.access(path, constants.W_OK | constants.O_CREAT);
    try {
        await promises.writeFile(path, text, 'utf8');
    } catch (e) {
        throw e;
    }

    // return new Promise((resolve, reject) => {
    //     fs.readFile(path, 'utf8', function (err, data) {
    //         if (err) {
    //             reject(err);
    //         }
    //         resolve(JSON.parse(data));
    //     });
    // });
}


export function sleep(ms: any) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// sorts playObj formatted objects by playDate in ascending (oldest first) order
export const sortByOldestPlayDate = (a: PlayObject, b: PlayObject) => {
    const {
        data: {
            playDate: aPlayDate
        } = {}
    } = a;
    const {
        data: {
            playDate: bPlayDate
        } = {}
    } = b;
    if(aPlayDate === undefined && bPlayDate === undefined) {
        return 0;
    }
    if(aPlayDate === undefined) {
        return 1;
    }
    if(bPlayDate === undefined) {
        return -1;
    }
    return aPlayDate.isAfter(bPlayDate) ? 1 : -1
};

export const sortByNewestPlayDate = (a: PlayObject, b: PlayObject) => {
    const {
        data: {
            playDate: aPlayDate
        } = {}
    } = a;
    const {
        data: {
            playDate: bPlayDate
        } = {}
    } = b;
    if(aPlayDate === undefined && bPlayDate === undefined) {
        return 0;
    }
    if(aPlayDate === undefined) {
        return 1;
    }
    if(bPlayDate === undefined) {
        return -1;
    }
    return aPlayDate.isBefore(bPlayDate) ? 1 : -1
};

export const setIntersection = (setA: any, setB: any) => {
    const _intersection = new Set()
    for (const elem of setB) {
        if (setA.has(elem)) {
            _intersection.add(elem)
        }
    }
    return _intersection
}

export const unique = <T>(arr: T[]): T[] => {
    return Array.from(new Set(arr))
}

export const returnDuplicateStrings = (arr: any) => {
    const alreadySeen: any = [];
    const dupes: any = [];

    arr.forEach((str: any) => alreadySeen[str] ? dupes.push(str) : alreadySeen[str] = true);
    return dupes;
}

const sentenceLengthWeight = (length: number) => {
    // thanks jordan :')
    // constants are black magic
    return (Math.log(length) / 0.20) - 5;
}

/**
 * Check if two play objects are the same by comparing non time-related data using most-to-least specific/confidence
 *
 * Checks sources and source ID's (unique identifiers) first then
 * Checks track, album, and artists in that order
 * */
export const playObjDataMatch = (a: PlayObject, b: PlayObject) => {
    const {
        data: {
            artists: aArtists = [],
            album: aAlbum,
            track: aTrack,
        } = {},
        meta: {
            source: aSource,
            trackId: atrackId,
        } = {},
    } = a;

    const {
        data: {
            artists: bArtists = [],
            album: bAlbum,
            track: bTrack,
        } = {},
        meta: {
            source: bSource,
            trackId: btrackId,
        } = {},
    } = b;

    // if sources are the same and both plays have source ids then we can just compare by id
    if(aSource === bSource && atrackId !== undefined && btrackId !== undefined) {
        if(atrackId !== btrackId) {
            return false;
        }
    }

    if (aTrack !== bTrack) {
        return false;
    }
    if (aAlbum !== bAlbum) {
        return false;
    }
    if (aArtists.length !== bArtists.length) {
        return false;
    }
    // check if every artist from either playObj matches (one way or another) with the artists from the other play obj
    if (!aArtists.every((x: any) => bArtists.includes(x)) && bArtists.every((x: any) => aArtists.includes(x))) {
        return false
    }

    return true;
}

export const parseRetryAfterSecsFromObj = (err: any) => {

    let raVal;

    if (err instanceof TimeoutError) {
        return undefined;
    }

    if (err instanceof WebapiError || 'headers' in err) {
        const {headers = {}} = err;
        raVal = headers['retry-after']
    }
    // if (err instanceof Response) {
    //     const {headers = {}} = err;
    //     raVal = headers['retry-after']
    // }
    const {
        response: {
            // @ts-expect-error
            headers, // returned in superagent error
        } = {},
        retryAfter: ra // possible custom property we have set
    } = err;

    if (ra !== undefined) {
        raVal = ra;
    } else if (headers !== null && typeof headers === 'object') {
        raVal = headers['retry-after'];
    }

    if (raVal === undefined || raVal === null) {
        return raVal;
    }

    // first try to parse as float
    let retryAfter: number | Dayjs = Number.parseFloat(raVal);
    if (!isNaN(retryAfter)) {
        return retryAfter; // got a number!
    }
    // try to parse as date
    retryAfter = dayjs(retryAfter);
    if (!dayjs.isDayjs(retryAfter)) {
        return undefined; // could not parse string if not in ISO 8601 format
    }
    // otherwise we got a date! now get the difference the specified retry-after date and now in seconds
    const diff = retryAfter.diff(dayjs(), 'second');

    if (diff <= 0) {
        // if diff is in the past returned undefined as its irrelevant now
        return undefined;
    }

    return diff;
}

export const spreadDelay = (retries: any, multiplier: any) => {
    if(retries === 0) {
        return [];
    }
    let r;
    const s = [];
    for(r = 0; r < retries; r++) {
        s.push(((r+1) * multiplier) * 1000);
    }
    return s;
}

export const removeUndefinedKeys = <T extends Record<string, any>>(obj: T): T | undefined => {
    const newObj: any = {};
    Object.keys(obj).forEach((key) => {
        if(Array.isArray(obj[key])) {
            newObj[key] = obj[key];
        } else if (obj[key] === Object(obj[key])) {
            newObj[key] = removeUndefinedKeys(obj[key]);
        } else if (obj[key] !== undefined) {
            newObj[key] = obj[key];
        }
    });
    if(Object.keys(newObj).length === 0) {
        return undefined;
    }
    Object.keys(newObj).forEach(key => {
        if(newObj[key] === undefined || (null !== newObj[key] && typeof newObj[key] === 'object' && Object.keys(newObj[key]).length === 0)) {
            delete newObj[key]
        }
    });
    //Object.keys(newObj).forEach(key => newObj[key] === undefined || newObj[key] && delete newObj[key])
    return newObj;
}

export const remoteHostIdentifiers = (req: Request): RemoteIdentityParts => {
    const remote = req.connection.remoteAddress;
    const proxyRemote = Array.isArray(req.headers["x-forwarded-for"]) ? req.headers["x-forwarded-for"][0] : req.headers["x-forwarded-for"];
    const ua = req.headers["user-agent"];

    return {host: remote, proxy: proxyRemote, agent: ua};
}

export const remoteHostStr = (req: Request): string => {
    const {host, proxy, agent} = remoteHostIdentifiers(req);

    return `${host}${proxy !== undefined ? ` (${proxy})` : ''}${agent !== undefined ? ` (UA: ${agent})` : ''}`;
}

/**
 * Remove duplicates based on trackId, deviceId, and play date
 * */
export const removeDuplicates = (plays: PlayObject[]): PlayObject[] => {
    return plays.reduce((acc: PlayObject[], currPlay: PlayObject) => {
        if(currPlay.meta.trackId !== undefined && currPlay.meta.deviceId !== undefined && currPlay.data.playDate !== undefined) {
            if(acc.some((x: PlayObject) => x.meta.trackId === currPlay.meta.trackId && x.meta.deviceId === currPlay.meta.deviceId && x.data.playDate.isSame(currPlay.data.playDate, 'minute'))) {
                // don't add current play to list if we find an existing that matches track, device, and play date
                return acc;
            }
        }
        return acc.concat(currPlay);
    }, []);
}

export const toProgressAwarePlayObject = (play: PlayObject): ProgressAwarePlayObject => {
    return {...play, meta: {...play.meta, initialTrackProgressPosition: play.meta.trackProgressPosition}};
}

export const getProgress = (initial: ProgressAwarePlayObject, curr: PlayObject): number | undefined => {
    if(initial.meta.initialTrackProgressPosition !== undefined && curr.meta.trackProgressPosition !== undefined) {
        return Math.round(Math.abs(curr.meta.trackProgressPosition - initial.meta.initialTrackProgressPosition));
    }
    return undefined;
}

export const thresholdResultSummary = (result: ScrobbleThresholdResult) => {
    const parts: string[] = [];
    if(result.duration.passes !== undefined) {
        parts.push(`tracked time of ${result.duration.value.toFixed(2)}s (wanted ${result.duration.threshold}s)`);
    }
    if(result.percent.passes !== undefined) {
        parts.push(`tracked percent of ${(result.percent.value).toFixed(2)}% (wanted ${result.percent.threshold}%)`)
    }

    return `${result.passes ? 'met' : 'did not meet'} thresholds with ${parts.join(' and ')}`;
}

export function parseBool(value: any, prev: any = false): boolean {
    let usedVal = value;
    if (value === undefined || value === '') {
        usedVal = prev;
    }
    if(usedVal === undefined || usedVal === '') {
        return false;
    }
    if (typeof usedVal === 'string') {
        return ['1','true','yes'].includes(usedVal.toLocaleLowerCase().trim());
    } else if (typeof usedVal === 'boolean') {
        return usedVal;
    }
    throw new Error(`'${value.toString()}' is not a boolean value.`);
}

export const genGroupIdStrFromPlay = (play: PlayObject) => {
    const groupId = genGroupId(play);
    return genGroupIdStr(groupId);
};
export const genGroupIdStr = (id: PlayPlatformId) => {
    return `${id[0]}-${id[1]}`;
}
export const genGroupId = (play: PlayObject): PlayPlatformId => [play.meta.deviceId ?? NO_DEVICE, play.meta.user ?? NO_USER];

export const getPlatformIdFromData = (data: PlayObject | PlayerStateDataMaybePlay) => {
    if(asPlayerStateDataMaybePlay(data)) {
        return data.platformId;
    }
    return genGroupId(data);
}

export const fileOrDirectoryIsWriteable = (location: string) => {
    const pathInfo = pathUtil.parse(location);
    const isDir = pathInfo.ext === '';
    try {
        accessSync(location, constants.R_OK | constants.W_OK);
        return true;
    } catch (err: any) {
        const {code} = err;
        if (code === 'ENOENT') {
            // file doesn't exist, see if we can write to directory in which case we are good
            try {
                accessSync(pathInfo.dir, constants.R_OK | constants.W_OK)
                // we can write to dir
                return true;
            } catch (accessError: any) {
                if(accessError.code === 'EACCES') {
                    // also can't access directory :(
                    throw new Error(`No ${isDir ? 'directory' : 'file'} exists at ${location} and application does not have permission to write to the parent directory`);
                } else {
                    throw new Error(`No ${isDir ? 'directory' : 'file'} exists at ${location} and application is unable to access the parent directory due to a system error`, {cause: accessError});
                }
            }
        } else if(code === 'EACCES') {
            throw new Error(`${isDir ? 'Directory' : 'File'} exists at ${location} but application does not have permission to write to it.`);
        } else {
            throw new Error(`${isDir ? 'Directory' : 'File'} exists at ${location} but application is unable to access it due to a system error`, {cause: err});
        }
    }
}

export const mergeArr = (objValue: [], srcValue: []): (any[] | undefined) => {
    if (Array.isArray(objValue)) {
        return objValue.concat(srcValue);
    }
}

export const pollingBackoff = (attempt: number, scaleFactor: number = 1): number => {

    const backoffStrat = backoffStrategies({
        delay: 1000,
        strategy: "exponential",
        jitter: true,
        minimumDelay: 1000,
        scaleFactor
    });

    // first attempt delay is never enough so always add + 1
    return Math.round(backoffStrat(attempt + 1) / 1000);
}

export const parseRegex = (reg: RegExp, val: string): RegExResult[] | undefined => {

    if (reg.global) {
        const g = Array.from(val.matchAll(reg));
        if (g.length === 0) {
            return undefined;
        }
        return g.map(x => {
            return {
                match: x[0],
                index: x.index,
                groups: x.slice(1),
                named: x.groups || {},
            } as RegExResult;
        });
    }

    const m = val.match(reg)
    if (m === null) {
        return undefined;
    }
    return [{
        match: m[0],
        index: m.index as number,
        groups: m.slice(1),
        named: m.groups || {}
    }];
}

export const parseRegexSingleOrFail = (reg: RegExp, val: string): RegExResult | undefined => {
    const results = parseRegex(reg, val);
    if (results !== undefined) {
        if (results.length > 1) {
            throw new Error(`Expected Regex to match once but got ${results.length} results. Either Regex must NOT be global (using 'g' flag) or parsed value must only match regex once. Given: ${val} || Regex: ${reg.toString()}`);
        }
        return results[0];
    }
    return undefined;
}

export const intersect = (a: Array<any>, b: Array<any>) => {
    const setA = new Set(a);
    const setB = new Set(b);
    const intersection = new Set([...setA].filter(x => setB.has(x)));
    return Array.from(intersection);
}

export const difference = (a: Array<any>, b: Array<any>) => {
    const setA = new Set(a);
    const setB = new Set(b);
    const diff = new Set([...setA].filter(x => !setB.has(x)));
    return Array.from(diff);
}

/**
 * https://github.com/Mw3y/Text-ProgressBar/blob/master/ProgressBar.js
 * */
export const progressBar = (value: number, maxValue: number, size: number) => {
    const percentage = value / maxValue; // Calculate the percentage of the bar
    const progress = Math.round((size * percentage)); // Calculate the number of square caracters to fill the progress side.
    const emptyProgress = size - progress; // Calculate the number of dash caracters to fill the empty progress side.

    const progressText = '▇'.repeat(progress); // Repeat is creating a string with progress * caracters in it
    const emptyProgressText = '—'.repeat(emptyProgress); // Repeat is creating a string with empty progress * caracters in it
    const percentageText = Math.round(percentage * 100) + '%'; // Displaying the percentage of the bar

    const bar = `[${progressText}${emptyProgressText}]${percentageText}`;
    return bar;
};

export const formatNumber = (val: number | string, options?: numberFormatOptions) => {
    const {
        toFixed = 2,
        defaultVal = null,
        prefix = '',
        suffix = '',
        round,
    } = options || {};
    let parsedVal = typeof val === 'number' ? val : Number.parseFloat(val);
    if (Number.isNaN(parsedVal)) {
        return defaultVal;
    }
    if(!Number.isFinite(val)) {
        return 'Infinite';
    }
    let prefixStr = prefix;
    const {enable = false, indicate = true, type = 'round'} = round || {};
    if (enable && !Number.isInteger(parsedVal)) {
        switch (type) {
            case 'round':
                parsedVal = Math.round(parsedVal);
                break;
            case 'ceil':
                parsedVal = Math.ceil(parsedVal);
                break;
            case 'floor':
                parsedVal = Math.floor(parsedVal);
        }
        if (indicate) {
            prefixStr = `~${prefix}`;
        }
    }
    const localeString = parsedVal.toLocaleString(undefined, {
        minimumFractionDigits: toFixed,
        maximumFractionDigits: toFixed,
    });
    return `${prefixStr}${localeString}${suffix}`;
};

export const durationToNormalizedTime = (dur: Duration): { hours: number, minutes: number, seconds: number } => {
    const totalSeconds = dur.asSeconds();

    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds - (hours * 3600)) / 60);
    const seconds = totalSeconds - (hours * 3600) - (minutes * 60);

    return {
        hours,
        minutes,
        seconds
    };
}

// https://github.com/zspecza/common-tags/issues/176#issuecomment-1650242734
export const doubleReturnNewline = new TemplateTag(
    stripIndentTransformer('all'),
    // remove instances of single line breaks
    replaceResultTransformer(/(?<=.)\n(?!\n+)/g, ''),
    // replace instances of two or more line breaks with one line break
    replaceResultTransformer(/(?<=.)\n{2,}/g, '\n'),
    trimResultTransformer(),
);

export const durationToTimestamp = (dur: Duration): string => {
    const nTime = durationToNormalizedTime(dur);

    const parts: string[] = [];
    if (nTime.hours !== 0) {
        parts.push(nTime.hours.toString().padStart(2, "0"));
    }
    parts.push(nTime.minutes.toString().padStart(2, "0"));
    parts.push(nTime.seconds.toString().padStart(2, "0"));
    return parts.join(':');
}

export const durationToHuman = (dur: Duration): string => {
    const nTime = durationToNormalizedTime(dur);

    const parts: string[] = [];
    if (nTime.hours !== 0) {
        parts.push(`${nTime.hours}hr`);
    }
    parts.push(`${nTime.minutes}min`);
    parts.push(`${nTime.seconds}sec`);
    return parts.join(' ');
}

export const comparingMultipleArtists = (existing: PlayObject, candidate: PlayObject): boolean => {
    const {
        data: {
            artists: eArtists = [],
        } = {}
    } = existing;
    const {
        data: {
            artists: cArtists = [],
        } = {}
    } = candidate;

    return eArtists.length > 1 || cArtists.length > 1;
}

export const getFirstNonEmptyVal = <T = unknown>(values: unknown[], options: {ofType?: string, test?: (val: T) => boolean} = {}): NonNullable<T> | undefined => {
    for(const v of values) {
        if(v === undefined || v === null) {
            continue;
        }
        if(options.ofType !== undefined && typeof v !== options.ofType) {
            continue;
        }
        if(options.test !== undefined && options.test(v as T) === false) {
            continue;
        }
        return v as T;
    }
    return undefined;
}

export const getFirstNonEmptyString = (values: unknown[]) => getFirstNonEmptyVal<string>(values, {ofType: 'string', test: (v) => v.trim() !== ''});

  /**
 * Runs the function `fn`
 * and retries automatically if it fails.
 *
 * Tries max `1 + retries` times
 * with `retryIntervalMs` milliseconds between retries.
 *
 * From https://mtsknn.fi/blog/js-retry-on-fail/
 */
export const retry = async <T>(
    fn: () => Promise<T> | T,
    { retries, retryIntervalMs }: { retries: number; retryIntervalMs: number }
  ): Promise<T> => {
    try {
      return await fn()
    } catch (error) {
      if (retries <= 0) {
        throw error
      }
      await sleep(retryIntervalMs)
      return retry(fn, { retries: retries - 1, retryIntervalMs })
    }
  }

export const isDebugMode = (): boolean => process.env.DEBUG_MODE === 'true';