import {promises, constants, accessSync} from "fs";
import dayjs, {Dayjs} from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import {Logger} from '@foxxmd/winston';
import JSON5 from 'json5';
import { TimeoutError, WebapiError } from "spotify-web-api-node/src/response-error.js";
import Ajv, {Schema} from 'ajv';
import {
    DEFAULT_SCROBBLE_DURATION_THRESHOLD,
    lowGranularitySources,
    PlayObject, ProgressAwarePlayObject, RegExResult,
    RemoteIdentityParts, ScrobbleThresholdResult,
    TrackStringOptions
} from "./common/infrastructure/Atomic.js";
import {Request} from "express";
import pathUtil from "path";
import {ErrorWithCause} from "pony-cause";
import backoffStrategies from '@kenyip/backoff-strategies';
import {ScrobbleThresholds} from "./common/infrastructure/config/source/index.js";

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
                throw new ErrorWithCause(`No file found at given path: ${path}`, {cause: e});
            } else {
                return;
            }
        }
        throw new ErrorWithCause(`Encountered error while parsing file: ${path}`, {cause: e})
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
    await promises.writeFile(path, text, 'utf8');

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

export const longestString = (strings: any) => strings.reduce((acc: any, curr: any) => curr.length > acc ? curr.length : acc, 0);
export const truncateStringArrToLength = (length: any, truncStr = '...') => {
    const truncater = truncateStringToLength(length, truncStr);
    return (strings: any) => strings.map(truncater);
}
export const truncateStringToLength = (length: any, truncStr = '...') => (val: any = '') =>  {
    if(val === null) {
        return '';
    }
    const str = typeof val !== 'string' ? val.toString() : val;
    return str.length > length ? `${str.slice(0, length)}${truncStr}` : str;
}

const defaultTransformer = (input: any) => input;

export const buildTrackString = (playObj: PlayObject, options: TrackStringOptions = {}) => {
    const {
        include = ['time', 'artist', 'track'],
        transformers: {
            artists: artistsFunc = (a: string[]) => a.join(' / '),
            track: trackFunc = defaultTransformer,
            time: timeFunc = (t: Dayjs | undefined) => t === undefined ? 'N/A' : t.local().format(),
            timeFromNow = (t: Dayjs | undefined) => t === undefined ? undefined : t.local().fromNow(),
        } = {}
    } = options;
    const {
        data: {
            artists,
            album,
            track,
            playDate
        } = {},
        meta: {
            trackId
        } = {},
    } = playObj;

    const strParts = [];
    if(include.includes('trackId') && trackId !== undefined) {
        strParts.push(`(${trackId})`);
    }
    if(include.includes('artist')) {
        strParts.push(`${artistsFunc(artists)}`)
    }
    if(include.includes('track')) {
        if(strParts.length > 0) {
            strParts.push(`- ${trackFunc(track)}`);
        } else {
            strParts.push(`${trackFunc(track)}`);
        }
    }
    if (include.includes('time')) {
        strParts.push(`@ ${timeFunc(playDate)}`);
    }
    if (include.includes('timeFromNow')) {
        const tfn = timeFromNow(playDate);
        if(tfn !== undefined) {
            strParts.push(`(${tfn})`)
        }

    }
    return strParts.join(' ');
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
    let _intersection = new Set()
    for (let elem of setB) {
        if (setA.has(elem)) {
            _intersection.add(elem)
        }
    }
    return _intersection
}

export const unique = <T>(arr: T[]): T[] => {
    return Array.from(new Set(arr))
}

export const PUNCTUATION_WHITESPACE_REGEX = new RegExp(/[^\w\d]/g);
export const uniqueNormalizedStrArr = (arr: string[]): string[] => {
    return arr.reduce((acc: string[], curr) => {
        const normalizedCurr = normalizeStr(curr)
        if (!acc.some(x => normalizeStr(x) === normalizedCurr)) {
            return acc.concat(curr);
        }
        return acc;
    }, []);
}

// https://stackoverflow.com/a/37511463/1469797
export const normalizeStr = (str: string): string => {
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, "").replace(PUNCTUATION_WHITESPACE_REGEX, '').toLocaleLowerCase();
}

export const returnDuplicateStrings = (arr: any) => {
    const alreadySeen: any = [];
    const dupes: any = [];

    arr.forEach((str: any) => alreadySeen[str] ? dupes.push(str) : alreadySeen[str] = true);
    return dupes;
}

export const capitalize = (str: any) => {
    return str.charAt(0).toUpperCase() + str.slice(1)
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
            // @ts-expect-error TS(2525): Initializer provides no value for this binding ele... Remove this comment to see the full error message
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
    let retryAfter = Number.parseFloat(raVal);
    if (!isNaN(retryAfter)) {
        return retryAfter; // got a number!
    }
    // try to parse as date
    // @ts-ignore
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
    let s = [];
    for(r = 0; r < retries; r++) {
        s.push(((r+1) * multiplier) * 1000);
    }
    return s;
}

export const removeUndefinedKeys = <T extends Record<string, any>>(obj: T): T | undefined => {
    let newObj: any = {};
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

export const parseDurationFromTimestamp = (timestamp: any) => {
    if (timestamp === null || timestamp === undefined) {
        return undefined;
    }
    if (!(typeof timestamp === 'string')) {
        throw new Error('Timestamp must be a string');
    }
    if (timestamp.trim() === '') {
        return undefined;
    }
    const parsedRuntime = timestamp.split(':');
    let hours = '0',
        minutes = '0',
        seconds = '0',
        milli = '0';

    switch (parsedRuntime.length) {
        case 3:
            hours = parsedRuntime[0];
            minutes = parsedRuntime[1];
            seconds = parsedRuntime[2];
            break;
        case 2:
            minutes = parsedRuntime[0];
            seconds = parsedRuntime[1];
            break;
        case 1:
            seconds = parsedRuntime[0];
    }
    const splitSec = seconds.split('.');
    if (splitSec.length > 1) {
        seconds = splitSec[0];
        milli = splitSec[1];
    }
    return dayjs.duration({
        hours: Number.parseInt(hours),
        minutes: Number.parseInt(minutes),
        seconds: Number.parseInt(seconds),
        milliseconds: Number.parseInt(milli)
    });
}

export const createAjvFactory = (logger: Logger): Ajv => {
    const validator =  new Ajv({logger: logger, verbose: true, strict: "log", allowUnionTypes: true});
    // https://ajv.js.org/strict-mode.html#unknown-keywords
    validator.addKeyword('deprecationMessage');
    return validator;
}

export const validateJson = <T>(config: object, schema: Schema, logger: Logger): T => {
    const ajv = createAjvFactory(logger);
    const valid = ajv.validate(schema, config);
    if (valid) {
        return config as unknown as T;
    } else {
        logger.error('Json config was not valid. Please use schema to check validity.', {leaf: 'Config'});
        if (Array.isArray(ajv.errors)) {
            for (const err of ajv.errors) {
                let parts = [
                    `At: ${err.dataPath}`,
                ];
                let data;
                if (typeof err.data === 'string') {
                    data = err.data;
                } else if (err.data !== null && typeof err.data === 'object' && (err.data as any).name !== undefined) {
                    data = `Object named '${(err.data as any).name}'`;
                }
                if (data !== undefined) {
                    parts.push(`Data: ${data}`);
                }
                let suffix = '';
                // @ts-ignore
                if (err.params.allowedValues !== undefined) {
                    // @ts-ignore
                    suffix = err.params.allowedValues.join(', ');
                    suffix = ` [${suffix}]`;
                }
                parts.push(`${err.keyword}: ${err.schemaPath} => ${err.message}${suffix}`);

                // if we have a reference in the description parse it out so we can log it here for context
                if (err.parentSchema !== undefined && err.parentSchema.description !== undefined) {
                    const desc = err.parentSchema.description as string;
                    const seeIndex = desc.indexOf('[See]');
                    if (seeIndex !== -1) {
                        let newLineIndex: number | undefined = desc.indexOf('\n', seeIndex);
                        if (newLineIndex === -1) {
                            newLineIndex = undefined;
                        }
                        const seeFragment = desc.slice(seeIndex + 5, newLineIndex);
                        parts.push(`See:${seeFragment}`);
                    }
                }

                logger.error(`Schema Error:\r\n${parts.join('\r\n')}`, {leaf: 'Config'});
            }
        }
        throw new Error('Config schema validity failure');
    }
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

export const closePlayDate = (existingPlay: PlayObject, newPlay: PlayObject, options: { diffThreshold?: number, fuzzyDuration?: boolean} = {}): boolean => {

    const {
        meta:{
            source,
        },
        data: {
            playDate: existingPlayDate,
            duration: existingDuration,
        }
    } = existingPlay;

    const {
        data: {
            playDate: newPlayDate,
            duration: newDuration,
        }
    } = newPlay;

    const {
        diffThreshold = lowGranularitySources.some(x => x.toLocaleLowerCase() === source) ? 60 : 10,
        fuzzyDuration = false,
    } = options;

    // cant compare!
    if(existingPlayDate === undefined || newPlayDate === undefined) {
        return false;
    }

    const referenceDuration = newDuration ?? existingDuration;

    let playDiffThreshold = diffThreshold;

    let closeTime = false;
    // check if existing play time is same as new play date
    let scrobblePlayDiff = Math.abs(existingPlayDate.unix() - newPlayDate.unix());
    if (scrobblePlayDiff <= playDiffThreshold) {
        closeTime = true;
    }
    // if the source has a duration its possible one play was scrobbled at the beginning of the track and the other at the end
    // so check if the duration matches the diff between the two play dates
    if (closeTime === false && referenceDuration !== undefined && fuzzyDuration) {
        if(Math.abs(scrobblePlayDiff - newDuration) < 10) { // use finer comparison for this
            closeTime = true;
        }
    }

    return closeTime;
}

export const combinePartsToString = (parts: any[], glue: string = '-'): string | undefined => {
    const cleanParts: string[] = [];
    for (const part of parts) {
        if (part === null || part === undefined) {
            continue;
        }
        if (Array.isArray(part)) {
            const nestedParts = combinePartsToString(part, glue);
            if (nestedParts !== undefined) {
                cleanParts.push(nestedParts);
            }
        } else if (typeof part === 'object') {
            // hope this works
            cleanParts.push(JSON.stringify(part));
        } else if(typeof part === 'string') {
            if(part.trim() !== '') {
                cleanParts.push(part);
            }
        } else {
            cleanParts.push(part.toString());
        }
    }
    if (cleanParts.length > 0) {
        return cleanParts.join(glue);
    }
    return undefined;
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

export const playPassesScrobbleThreshold = (play: PlayObject, thresholds: ScrobbleThresholds): ScrobbleThresholdResult => {
    const progressed = Math.round(Math.abs(dayjs().diff(play.data.playDate, 's')));
    return timePassesScrobbleThreshold(thresholds, progressed, play.data.duration);
}

export const timePassesScrobbleThreshold = (thresholds: ScrobbleThresholds, secondsTracked: number, playDuration?: number): ScrobbleThresholdResult => {
    let durationPasses = undefined,
        durationThreshold = (thresholds.duration ?? DEFAULT_SCROBBLE_DURATION_THRESHOLD),
        percentPasses = undefined,
        percent: number | undefined = undefined;

    if (thresholds.percent !== undefined && playDuration !== undefined) {
        percent = (secondsTracked / playDuration) * 100;
        percentPasses = percent >= thresholds.percent;
    }
    if (thresholds.duration !== undefined || percentPasses === undefined) {
        durationPasses = secondsTracked >= durationThreshold;
    }

    return {
        passes: (durationPasses ?? false) || (percentPasses ?? false),
        duration: {
            passes: durationPasses,
            threshold: durationThreshold,
            value: secondsTracked
        },
        percent: {
            passes: percentPasses,
            value: percent,
            threshold: thresholds.percent
        }
    }
}

export const thresholdResultSummary = (result: ScrobbleThresholdResult) => {
    const parts: string[] = [];
    if(result.duration.passes !== undefined) {
        parts.push(`tracked time of ${result.duration.value}s (wanted ${result.duration.threshold}s)`);
    }
    if(result.percent.passes !== undefined) {
        parts.push(`tracked percent of ${(result.percent.value).toFixed(2)}% (wanted ${result.percent.threshold})`)
    }

    return `${result.passes ? 'met' : 'did not meet'} thresholds with ${parts.join(' and')}`;
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
        return usedVal === 'true';
    } else if (typeof usedVal === 'boolean') {
        return usedVal;
    }
    throw new Error('Not a boolean value.');
}

export const genGroupId = (play: PlayObject) => `${play.meta.deviceId ?? 'NoDevice'}-${play.meta.user ?? 'SingleUser'}`;

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
                    throw new ErrorWithCause(`No ${isDir ? 'directory' : 'file'} exists at ${location} and application is unable to access the parent directory due to a system error`, {cause: accessError});
                }
            }
        } else if(code === 'EACCES') {
            throw new Error(`${isDir ? 'Directory' : 'File'} exists at ${location} but application does not have permission to write to it.`);
        } else {
            throw new ErrorWithCause(`${isDir ? 'Directory' : 'File'} exists at ${location} but application is unable to access it due to a system error`, {cause: err});
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

export const SECONDARY_ARTISTS_SECTION_REGEX = new RegExp(/^(?<primary>[^(\[]*)?(?<secondarySection>[(\[]?(?<joiner>ft\.?|feat\.?|featuring|vs\.?) (?<secondaryArtists>[^)\]]*)(?:[)\]]|\s*)$)/i);
// export const SECONDARY_ARTISTS_REGEX = new RegExp(//ig);
export const parseCredits = (str: string, ignoreDelimiters?: boolean | string[]) => {
    let primary: string | undefined;
    let secondary: string[] = [];
    const results = parseRegexSingleOrFail(SECONDARY_ARTISTS_SECTION_REGEX, str);
    if(results !== undefined) {
        primary = results.named.primary !== undefined ? results.named.primary.trim() : undefined;
        let delims: string[] | undefined;
        if(Array.isArray(ignoreDelimiters)) {
            delims = ignoreDelimiters;
        } else if(ignoreDelimiters === true) {
            delims = [];
        }
        secondary = parseStringList(results.named.secondaryArtists as string, delims)
        return {
            primary,
            secondary
        };
    }
    return undefined;
}

export const parseStringList = (str: string, delimiters: string[] = [',', '&', '/', '\\']): string[] => {
    if(delimiters.length === 0) {
        return [str];
    }
    return delimiters.reduce((acc: string[], curr: string) => {
        const explodedStrings = acc.map(x => x.split(curr));
        return explodedStrings.flat(1);
    }, [str]).map(x => x.trim());
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
            throw new ErrorWithCause(`Expected Regex to match once but got ${results.length} results. Either Regex must NOT be global (using 'g' flag) or parsed value must only match regex once. Given: ${val} || Regex: ${reg.toString()}`);
        }
        return results[0];
    }
    return undefined;
}

export const containsDelimiters = (str: string) => {
    return null !== str.match(/[,&\/\\]+/i);
}

export const findDelimiters = (str: string) => {
    const found: string[] = [];
    for(const d of [',','&','\/','\\']) {
        if(str.indexOf(d) !== -1) {
            found.push(d);
        }
    }
    if(found.length === 0) {
        return undefined;
    }
    return found;
}

export const intersect = (a: Array<any>, b: Array<any>) => {
    const setA = new Set(a);
    const setB = new Set(b);
    const intersection = new Set([...setA].filter(x => setB.has(x)));
    return Array.from(intersection);
}
