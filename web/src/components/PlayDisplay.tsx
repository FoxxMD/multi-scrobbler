import React, {Fragment, PropsWithChildren, ReactElement} from 'react';
import SkeletonTitle from "./skeleton/SkeletonTitle.js";
import SkeletonParagraph from "./skeleton/SkeletonParagraph.js";
import StatusCardSkeleton, {StatusCardSkeletonData} from "./statusCard/StatusCardSkeleton.js";
import {PlayData, PlayObject, TrackStringOptions} from "../../../src/common/infrastructure/Atomic.js";

import {buildTrackString, buildTrackStringReactOptions} from "../../../src/utils/StringUtils.js";

interface PlayObjectProps {
    data: PlayObject
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
