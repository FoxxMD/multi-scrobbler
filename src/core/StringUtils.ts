import dayjs, {Dayjs} from "dayjs";
import React, {createElement, ReactElement} from "react";
import utc from "dayjs/plugin/utc.js";
import isBetween from "dayjs/plugin/isBetween.js";
import relativeTime from "dayjs/plugin/relativeTime.js";
import duration from "dayjs/plugin/duration.js";
import timezone from "dayjs/plugin/timezone.js";
import {AmbPlayObject, TrackStringOptions} from "./Atomic.js";

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
export const defaultTimeFunc = (t: Dayjs | undefined) => t === undefined ? '@ N/A' : `@ ${t.local().format()}`;
export const defaultTimeFromNowFunc = (t: Dayjs | undefined) => t === undefined ? undefined : `(${t.local().fromNow()})`;
export const defaultBuildTrackStringTransformers = {
    artists: defaultArtistFunc,
    track: defaultTrackTransformer,
    time: defaultTimeFunc,
    timeFromNow: defaultTimeFromNowFunc,
}
export const buildTrackString = <T = string>(playObj: AmbPlayObject, options: TrackStringOptions<T> = {}): T => {
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

    const pd = typeof playDate === 'string' ? dayjs(playDate) : playDate;

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
        strParts.push(timeFunc(pd));
    }
    if (include.includes('timeFromNow')) {
        const tfn = timeFromNow(pd);
        if (tfn !== undefined) {
            strParts.push(tfn)
        }

    }
    // @ts-ignore
    return reducer(strParts); //strParts.join(' ');
}