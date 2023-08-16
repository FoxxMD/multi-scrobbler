import React, {Fragment, PropsWithChildren, ReactElement} from 'react';

import {JsonPlayObject, TrackStringOptions} from "../../core/Atomic.js";
import {buildTrackString, buildTrackStringReactOptions} from "../../core/StringUtils.js";

interface PlayObjectProps {
    data: JsonPlayObject
    artistLength?: number
    trackLength?: number
    buildOptions?: TrackStringOptions<ReactElement> & {includeWeb?: boolean}
}
const PlayDisplay = (props: PlayObjectProps) => {
    const {
        data,
        artistLength,
        trackLength,
        buildOptions = {},
    } = props || {};

    const {
        transformers,
        includeWeb,
        ...restBuild
    } = buildOptions;

    const bOpts: TrackStringOptions<ReactElement> = {
        ...restBuild,
        // @ts-ignore
        transformers: {
            ...buildTrackStringReactOptions.transformers,
            ...transformers,
            track: (t, hasExistingParts) => includeWeb ? <>{hasExistingParts ? '- ' : ''}<a>${t}</a></> : <>{hasExistingParts ? '- ' : ''}t</>
        }
    }

    return buildTrackString<ReactElement>(data, bOpts);
}
export default PlayDisplay;
