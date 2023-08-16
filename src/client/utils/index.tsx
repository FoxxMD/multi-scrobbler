import {TrackStringOptions} from "../../core/Atomic.js";
import React, {ReactElement, Fragment} from "react";
import {defaultBuildTrackStringTransformers} from "../../core/StringUtils.js";

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
