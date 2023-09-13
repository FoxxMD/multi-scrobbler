import React, {Fragment, PropsWithChildren, ReactElement} from 'react';

import {JsonPlayObject, TrackStringOptions} from "../../core/Atomic";
import {buildTrackString} from "../../core/StringUtils";
import {buildTrackStringReactOptions} from "../utils/index";

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
        transformers: {
            ...buildTrackStringReactOptions.transformers,
            ...transformers,
            track: (t, data, hasExistingParts) => {
                const existingPartPrefix = hasExistingParts ? `- ` : '';
                if(includeWeb && data.meta.url?.web !== undefined) {
                    return <Fragment key="web">{existingPartPrefix}<a href={data.meta.url.web}>{t}</a></Fragment>
                }
                return <Fragment key="web">{existingPartPrefix}{t}</Fragment>;
            }
        }
    }

    return buildTrackString<ReactElement>(data, bOpts);
}
export default PlayDisplay;
