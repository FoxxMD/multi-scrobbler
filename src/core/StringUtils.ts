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
export const defaultAlbumFunc = (input: any, data: AmbPlayObject, hasExistingParts: boolean = false) => hasExistingParts ? `--- ${input}` : input;
export const defaultTimeFunc = (t: Dayjs | undefined, i?: ScrobbleTsSOC) => t === undefined ? '@ N/A' : `@ ${t.local().format()} ${i === undefined ? '' : (i === SCROBBLE_TS_SOC_START ? '(S)' : '(C)')}`;
export const defaultTimeFromNowFunc = (t: Dayjs | undefined) => t === undefined ? undefined : `(${t.local().fromNow()})`;
export const defaultCommentFunc = (c: string | undefined) => c === undefined ? undefined : `(${c})`;
// TODO replace with genGroupIdStr and refactor Platform types/etc. into core Atomic
export const defaultPlatformFunc = (d: string | undefined, u: string | undefined, s: string | undefined) => combinePartsToString([d ?? 'NoDevice', u ?? 'SingleUser',s !== undefined ? `Session${s}` : undefined]);
export const defaultBuildTrackStringTransformers = {
    artists: defaultArtistFunc,
    track: defaultTrackTransformer,
    album: defaultAlbumFunc,
    time: defaultTimeFunc,
    timeFromNow: defaultTimeFromNowFunc,
    comment: defaultCommentFunc,
    platform: defaultPlatformFunc
}
export const buildTrackString = <T = string>(playObj: AmbPlayObject, options: TrackStringOptions<T> = {}): T => {
    const {
        include = ['time', 'artist', 'track'],
        transformers: {
            artists: artistsFunc = defaultBuildTrackStringTransformers.artists,
            album: albumFunc = defaultBuildTrackStringTransformers.album,
            track: trackFunc = defaultBuildTrackStringTransformers.track,
            time: timeFunc = defaultBuildTrackStringTransformers.time,
            timeFromNow = defaultBuildTrackStringTransformers.timeFromNow,
            comment: commentFunc = defaultBuildTrackStringTransformers.comment,
            platform: platformFunc = defaultBuildTrackStringTransformers.platform,
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
            comment,
            deviceId,
            user,
            sessionId
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
    if(include.includes('platform')) {
        strParts.push(platformFunc(deviceId, user, include.includes('session') ? sessionId : undefined))
    } else if(include.includes('session') && sessionId !== undefined) {
        strParts.push(`(Session ${sessionId})`);
    }
    if (include.includes('trackId') && trackId !== undefined) {
        strParts.push(`(${trackId})`);
    }
    if (include.includes('artist')) {
        strParts.push(artistsFunc(artists))
    }
    if (include.includes('track')) {
        strParts.push(trackFunc(track, playObj, strParts.length > 0));
    }
    if (include.includes('album')) {
        strParts.push(albumFunc(album, playObj, strParts.length > 0));
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
        const split = str.split(d);
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
        } else if (typeof part === 'string') {
            if (part.trim() !== '') {
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

export const arrayListOxfordAnd = (list: string[], joiner: string, finalJoiner: string, spaced: boolean = true): string => {
    if(list.length === 1) {
        return list[0];
    }
    const start = list.slice(0, list.length - 1);
    const end = list.slice(list.length - 1);

    const joinerProper = joiner === ',' ? ', ' : (spaced ? ` ${joiner} ` : joiner);
    const finalProper = spaced ? ` ${finalJoiner} ` : finalJoiner;

    return [start.join(joinerProper), end].join(joiner === ',' && spaced ? `,${finalProper}` : finalProper);
}

export const arrayListAnd = (list: string[], joiner: string, finalJoiner: string, spaced: boolean = true): string => {
    if(list.length === 1) {
        return list[0];
    }
    const start = list.slice(0, list.length - 1);
    const end = list.slice(list.length - 1);

    const joinerProper = joiner === ',' ? ', ' : (spaced ? ` ${joiner} ` : joiner);
    const finalProper = spaced ? ` ${finalJoiner} ` : finalJoiner;

    return [start.join(joinerProper), end].join(finalProper);
}