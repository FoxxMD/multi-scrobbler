import { Fragment } from 'react';
import type { Credit as AC } from '../../core/Atomic';

import { HStack, Tag } from "@chakra-ui/react";
import { MusicServiceIndicators } from './musicServices/MusicServiceIndicators';
import type { MusicServicesAny } from '../../core/MusicMetadata';

export const Credit = (props: { data: AC, showLinks?: boolean, showMbid?: boolean }) => {

    const {
        data,
        showLinks = true,
        showMbid
    } = props;

    if (!showLinks) {
        return data.name;
    }

    const musicServices: MusicServicesAny[] = data.metadata ?? [];

    return <Fragment>
        <HStack>
            {data.name}
            <MusicServiceIndicators services={musicServices} showId={showMbid} link={showLinks} />
        </HStack>
    </Fragment>

}

export const ArtistCreditTags = (props: { data: AC[], showLinks?: boolean, showMbid?: boolean }) => (
    <HStack flexWrap="wrap">
        {props.data.map((x, index) => (
            <Tag.Root key={index}>
                <Tag.Label userSelect="text"><Credit data={x} showLinks={props.showLinks} showMbid={props.showMbid} /></Tag.Label>
            </Tag.Root>
        ))}
    </HStack>
)