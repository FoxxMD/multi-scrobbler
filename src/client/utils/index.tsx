import {TrackStringOptions} from "../../core/Atomic";
import React, {ReactElement, Fragment} from "react";
import {defaultBuildTrackStringTransformers} from "../../core/StringUtils";

export const buildTrackStringReactOptions: TrackStringOptions<ReactElement> = {
    transformers: {
        ...defaultBuildTrackStringTransformers,
        reducer: arr => {
            const allFrags = arr.map((x, index) => {
                if(typeof x === 'string') {
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

const LOG_LINE_REGEX = new RegExp(/(?<timestamp>\S+)\s+(?<level>\w+)\s*:\s*(?<message>.*)/);
export const parseLogLine = (line: string) => {
    const match = line.match(LOG_LINE_REGEX);
    if (match === null) {
        return undefined;
    }
    return {
        timestamp: match.groups.timestamp,
        level: match.groups.level,
        message: match.groups.message
    }
}
