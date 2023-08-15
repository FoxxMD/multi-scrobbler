import dayjs, {Dayjs} from "dayjs";
import {PlayObject, TrackStringOptions} from "../common/infrastructure/Atomic.js";
import React, {ReactElement} from "react";
import utc from "dayjs/plugin/utc.js";
import isBetween from "dayjs/plugin/isBetween.js";
import relativeTime from "dayjs/plugin/relativeTime.js";
import duration from "dayjs/plugin/duration.js";
import timezone from "dayjs/plugin/timezone.js";

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
export const defaultTrackTransformer = (input: any, hasExistingParts: boolean = false) => hasExistingParts ? `- ${input}` : input;
export const defaultReducer = (acc, curr) => `${acc} ${curr}`;
export const defaultArtistFunc = (a: string[]) => a.join(' / ');
export const defaultTimeFunc = (t: Dayjs | undefined) => t === undefined ? '@ N/A' : `@ ${t.local().format()}`;
export const defaultTimeFromNowFunc = (t: Dayjs | undefined) => t === undefined ? undefined : `(${t.local().fromNow()})`;
export const defaultBuildTrackStringTransformers = {
    artists: defaultArtistFunc,
    track: defaultTrackTransformer,
    time: defaultTimeFunc,
    timeFromNow: defaultTimeFromNowFunc,
}
export const buildTrackString = <T = string>(playObj: PlayObject, options: TrackStringOptions<T> = {}): T => {
    const {
        include = ['time', 'artist', 'track'],
        transformers: {
            artists: artistsFunc = defaultBuildTrackStringTransformers.artists,
            track: trackFunc = defaultBuildTrackStringTransformers.track,
            time: timeFunc = defaultBuildTrackStringTransformers.time,
            timeFromNow = defaultBuildTrackStringTransformers.timeFromNow,
            reducer = arr => arr.join(' ') // (acc, curr) => `${acc} ${curr}`
        } = {},
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

    const strParts: (T | string)[] = [];
    if (include.includes('trackId') && trackId !== undefined) {
        strParts.push(`(${trackId})`);
    }
    if (include.includes('artist')) {
        strParts.push(artistsFunc(artists))
    }
    if (include.includes('track')) {
        strParts.push(trackFunc(track, strParts.length > 0));
    }
    if (include.includes('time')) {
        strParts.push(timeFunc(playDate));
    }
    if (include.includes('timeFromNow')) {
        const tfn = timeFromNow(playDate);
        if (tfn !== undefined) {
            strParts.push(tfn)
        }

    }
    // @ts-ignore
    return reducer(strParts); //strParts.join(' ');
}
export const buildTrackStringReactOptions: TrackStringOptions<ReactElement> = {
    transformers: {
        ...defaultBuildTrackStringTransformers,
        reducer: arr => {
            const allFrags = arr.map(x => typeof x === 'string' ? React.createElement("span", null, x) : x);
            return React.createElement("span", null, allFrags);
        }
    }
}
