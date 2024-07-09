import dayjs, { Dayjs } from "dayjs";
import duration from "dayjs/plugin/duration.js";
import isBetween from "dayjs/plugin/isBetween.js";
import relativeTime from "dayjs/plugin/relativeTime.js";
import timezone from "dayjs/plugin/timezone.js";
import utc from "dayjs/plugin/utc.js";
import {
    AmbPlayObject,
    SCROBBLE_TS_SOC_END,
    SCROBBLE_TS_SOC_START,
    ScrobbleTsSOC,
    TrackStringOptions
} from "./Atomic.js";

dayjs.extend(utc)
dayjs.extend(isBetween);
dayjs.extend(relativeTime);
dayjs.extend(duration);
dayjs.extend(timezone);

export const longestString = (strings: any) => strings.reduce((acc: any, curr: any) => curr.length > acc ? curr.length : acc, 0);
export const truncateStringArrToLength = (length: any, truncStr = '...') => {
    const truncater = truncateStringToLength(length, truncStr);
    return (strings: any) => strings.map(truncater);
}
export const truncateStringToLength = (length: any, truncStr = '...') => (val: any = '') => {
    if (val === null) {
        return '';
    }
    const str = typeof val !== 'string' ? val.toString() : val;
    return str.length > length ? `${str.slice(0, length)}${truncStr}` : str;
}
export const defaultTrackTransformer = (input: any, data: AmbPlayObject, hasExistingParts: boolean = false) => hasExistingParts ? `- ${input}` : input;
export const defaultReducer = (acc, curr) => `${acc} ${curr}`;
export const defaultArtistFunc = (a: string[]) => a.join(' / ');
export const defaultTimeFunc = (t: Dayjs | undefined, i?: ScrobbleTsSOC) => t === undefined ? '@ N/A' : `@ ${t.local().format()} ${i === undefined ? '' : (i === SCROBBLE_TS_SOC_START ? '(S)' : '(C)')}`;
export const defaultTimeFromNowFunc = (t: Dayjs | undefined) => t === undefined ? undefined : `(${t.local().fromNow()})`;
export const defaultCommentFunc = (c: string | undefined) => c === undefined ? undefined : `(${c})`;
export const defaultBuildTrackStringTransformers = {
    artists: defaultArtistFunc,
    track: defaultTrackTransformer,
    time: defaultTimeFunc,
    timeFromNow: defaultTimeFromNowFunc,
    comment: defaultCommentFunc
}
export const buildTrackString = <T = string>(playObj: AmbPlayObject, options: TrackStringOptions<T> = {}): T => {
    const {
        include = ['time', 'artist', 'track'],
        transformers: {
            artists: artistsFunc = defaultBuildTrackStringTransformers.artists,
            track: trackFunc = defaultBuildTrackStringTransformers.track,
            time: timeFunc = defaultBuildTrackStringTransformers.time,
            timeFromNow = defaultBuildTrackStringTransformers.timeFromNow,
            comment: commentFunc = defaultBuildTrackStringTransformers.comment,
            reducer = arr => arr.join(' ') // (acc, curr) => `${acc} ${curr}`
        } = {},
    } = options;
    const {
        data: {
            artists,
            album,
            track,
            playDate,
            playDateCompleted
        } = {},
        meta: {
            trackId,
            scrobbleTsSOC = SCROBBLE_TS_SOC_START,
            comment
        } = {},
    } = playObj;

    let pd: Dayjs;
    let usedTsSOC: ScrobbleTsSOC = scrobbleTsSOC;
    if(scrobbleTsSOC === SCROBBLE_TS_SOC_END && playDateCompleted !== undefined) {
        pd = typeof playDateCompleted === 'string' ? dayjs(playDateCompleted) : playDateCompleted;
    } else {
        usedTsSOC = SCROBBLE_TS_SOC_START;
        pd = typeof playDate === 'string' ? dayjs(playDate) : playDate;
    }

    const strParts: (T | string)[] = [];
    if (include.includes('trackId') && trackId !== undefined) {
        strParts.push(`(${trackId})`);
    }
    if (include.includes('artist')) {
        strParts.push(artistsFunc(artists))
    }
    if (include.includes('track')) {
        strParts.push(trackFunc(track, playObj, strParts.length > 0));
    }
    if (include.includes('time')) {
        strParts.push(timeFunc(pd, usedTsSOC));
    }
    if (include.includes('timeFromNow')) {
        const tfn = timeFromNow(pd);
        if (tfn !== undefined) {
            strParts.push(tfn)
        }

    }
    if (include.includes('comment')) {
        const cfn = commentFunc(comment);
        if(cfn !== undefined) {
            strParts.push(cfn);
        }
    }
    // @ts-ignore
    return reducer(strParts); //strParts.join(' ');
}

export const slice = (str: string, index: number, count: number, add?: string): string => {
    // We cannot pass negative indexes directly to the 2nd slicing operation.
    if (index < 0) {
        index = str.length + index;
        if (index < 0) {
            index = 0;
        }
    }

    return str.slice(0, index) + (add || "") + str.slice(index + count);
}
export const capitalize = (str: any) => {
    return str.charAt(0).toUpperCase() + str.slice(1)
}

/**
 * Split a string-ish variable by a list of deliminators and return the first actually split array or default to returning the string as the first element.
 *
 * Returns empty array, or user defined value, if variable is undefined / null / not a string / or an empty string.
 * */
export const splitByFirstFound = <T>(str: any, delims = [','], onNotAStringVal: T): string[] | T => {
    if(str === undefined || str === null || typeof str !== 'string' || str.trim() === '') {
        return onNotAStringVal;
    }
    for(const d of delims) {
        const split = d.split(d);
        if(split.length > 1) {
            return split;
        }
    }
    return [str];
}

/**
 * Returns value if it is a non-empty string or returns default value
 * */
export const nonEmptyStringOrDefault = <T>(str: any, defaultVal: T = undefined): string | T => {
    if (str === undefined || str === null || typeof str !== 'string' || str.trim() === '') {
        return defaultVal;
    }
    return str;
}
