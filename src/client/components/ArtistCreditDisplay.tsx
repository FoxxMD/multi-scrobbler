import { Fragment } from 'react';
import type { ArtistCredit as AC } from '../../core/Atomic';

import { HStack, Tag } from "@chakra-ui/react";
import { MusicServiceIndicators } from './musicServices/MusicServiceIndicators';
import type { MusicServicesAny } from './musicServices/musicServiceTypes';

export const ArtistCredit = (props: { data: AC, showLinks?: boolean, showMbid?: boolean }) => {

    const {
        data,
        showLinks = true,
        showMbid
    } = props;

    if (!showLinks) {
        return data.name;
    }

    const musicServices: MusicServicesAny[] = [];
    if(data.mbid) {
        musicServices.push({name: 'musicbrainz', idHint: 'artist', id: data.mbid});
    }

    return <Fragment>
        <HStack>
            {data.name}
            <MusicServiceIndicators services={musicServices} showId={showMbid} link={showLinks} />
        </HStack>
    </Fragment>

}

export const ArtistCreditTags = (props: { data: AC[], showLinks?: boolean, showMbid?: boolean }) => (
    <HStack>
        {props.data.map((x, index) => (
            <Tag.Root key={index}>
                <Tag.Label userSelect="all"><ArtistCredit data={x} showLinks={props.showLinks} showMbid={props.showMbid} /></Tag.Label>
            </Tag.Root>
        ))}
    </HStack>
)