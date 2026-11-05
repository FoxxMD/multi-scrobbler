import React, { Fragment, type ComponentProps } from 'react';
import type { Credit as AC, MusicServicesAny } from '../../core/Atomic';

import { HStack, Span, Tag } from "@chakra-ui/react";
import { MusicServiceIndicators, MusicServiceIndicatorStack } from './musicServices/MusicServiceIndicators';

export const Credit = (props: { data: AC, showLinks?: boolean, showMbid?: boolean, stack?: false | Omit<ComponentProps<typeof MusicServiceIndicatorStack>, 'services'> }) => {

    const {
        data,
        showLinks = true,
        showMbid,
        stack = {}
    } = props;

    if (!showLinks) {
        return data.name;
    }

    const musicServices: MusicServicesAny[] = data.metadata ?? [];

    let indicatorContent: React.JSX.Element | undefined = undefined;
    if(musicServices.length > 0) {
        if(stack !== false) {
            indicatorContent = <MusicServiceIndicatorStack services={musicServices} showId={showMbid} link={showLinks} {...stack}/>
        } else {
            indicatorContent = <MusicServiceIndicators services={musicServices} showId={showMbid} link={showLinks}/>
        }
    }

    return <Fragment>
        <HStack minWidth="0">
            {/* truncate only the name, the indicators must not be clipped (they lift on hover) */}
            {/* nudge down: the font keeps more space below the letters (descenders) than above, so centered text looks high next to a centered icon.
                ponytail: tuned for the app font at ~0.75px/12px, text-box-trim would fix it for any font but clips descenders with truncate's overflow: hidden */}
            <Span truncate position="relative" top="0.0625em">{data.name}</Span>
            {indicatorContent}
        </HStack>
    </Fragment>

}

export const ArtistCreditTags = (props: { data: AC[], showLinks?: boolean, showMbid?: boolean, stack?: Omit<ComponentProps<typeof Credit>['stack'], 'services'> }) => (
    <HStack flexWrap="wrap">
        {props.data.map((x, index) => (
            <Tag.Root key={index}>
                {/* recipe lineClamp sets overflow: hidden, which clips the indicator stack when it lifts. Credit truncates the name instead */}
                <Tag.Label userSelect="text" display="flex" minWidth="0" overflow="visible"><Credit data={x} showLinks={props.showLinks} showMbid={props.showMbid} stack={props.stack ?? {ring: false}} /></Tag.Label>
            </Tag.Root>
        ))}
    </HStack>
)