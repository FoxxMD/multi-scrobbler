import { Fragment } from 'react';
import type { ArtistCredit as AC } from '../../core/Atomic';

import { HStack, Tag } from "@chakra-ui/react";
import { MusicbrainzInfoIcon } from './musicServices/Musicbrainz';

export const ArtistCredit = (props: { data: AC, showLinks?: boolean, showMbid?: boolean }) => {

    const {
        data,
        showLinks = true,
        showMbid
    } = props;

    if (!showLinks) {
        return data.name;
    }

    return <Fragment>
        <HStack>
            {data.name}
            <HStack style={{ userSelect: 'none' }}>
                {data.mbid !== undefined ? <MusicbrainzInfoIcon type="artist" mbid={data.mbid} showMbid={showMbid} link tooltip /> : null}
            </HStack>
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