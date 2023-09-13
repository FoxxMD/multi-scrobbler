import {TrackStringOptions} from "../../core/Atomic";
import React, {ReactElement, Fragment} from "react";
import {defaultBuildTrackStringTransformers} from "../../core/StringUtils";
import dayjs, {Dayjs} from 'dayjs';

export const buildTrackStringReactOptions: TrackStringOptions<ReactElement> = {
    transformers: {
        ...defaultBuildTrackStringTransformers,
        reducer: arr => {
            const allFrags = arr.map((x, index) => {
                if (typeof x === 'string') {
                    return <Fragment key={index}>{x}</Fragment>;
                } else {
                    return x;
                }
            });
            const spacedFrags = allFrags.reduce((acc, curr, index) => {
                return acc.concat([curr, <Fragment key={`${index} space`}> </Fragment>]);
            }, []);
            return <Fragment>{spacedFrags}</Fragment>
        }
    }
}

const LOG_LINE_REGEX = new RegExp(/(?<timestamp>\S+)\s+(?<level>\w+)\s*:\s*(?<message>(?:.|\n)*)/, 'm');
export const parseLogLine = (line: string) => {
    const match = line.match(LOG_LINE_REGEX);
    if (match === null) {
        return undefined;
    }
    return {
        timestamp: match[1],
        level: match[2],
        message: match[3]
    }
}

export interface DateFormatOptions {
    includeRelative?: boolean
    includeDate?: boolean
}

export const DAYJS_TIMEZ_FORMAT = 'HH:mm:ssZ';
export const DAYJS_TIME_FORMAT = 'HH:mm:ss';
export const DAYJS_DATE_FORMAT = 'YYYY-MM-DD';

export const isoToHuman = (iso: string, opts?: DateFormatOptions) => {
    const {
        includeRelative = false,
        includeDate
    } = opts;

    let parts = [];

    const date = dayjs(iso);
    let useDate = includeDate;
    let now: Dayjs;
    if(useDate === undefined) {
        now = dayjs();
        if(now.isSame(date, 'day')) {
            useDate = false;
        }
    }
    if(useDate) {
        parts.push(date.format(DAYJS_DATE_FORMAT));
    }
    parts.push(date.format(DAYJS_TIME_FORMAT));

    if(includeRelative) {
        parts.push(`(${date.fromNow()})`);
    }

    return parts.join(' ');
}
