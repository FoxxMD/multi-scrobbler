import React, { Fragment } from 'react';
import { ArtistCredit as AC } from '../../core/Atomic';

import { HStack, Tag } from "@chakra-ui/react"
import { SiMusicbrainz } from "react-icons/si";
import { Tooltip } from './ChakraTooltip';

export const ArtistCredit = (props: { data: AC, showIdLink?: boolean }) => {

    const {
        data,
        showIdLink = true
    } = props;

    if (!showIdLink || Object.keys(data).length === 1) {
        return data.name;
    }

    return <Fragment>
        <HStack>
            {data.name}
            <HStack style={{ userSelect: 'none' }}>
                {data.mbid !== undefined ? <Tooltip content={`MBID ${data.mbid}`} interactive><a target='__blank' href={`https://musicbrainz.org/artist/${data.mbid}`}><SiMusicbrainz /></a></Tooltip> : null}
            </HStack>
        </HStack>
    </Fragment>

}

export const ArtistCreditTags = (props: { data: AC[], showIdLink?: boolean }) => {
    return <HStack>{props.data.map((x, index) => {
        return (
            <Tag.Root key={index}>
                <Tag.Label userSelect="all"><ArtistCredit data={x} showIdLink={props.showIdLink} /></Tag.Label>
            </Tag.Root>
        );
    })}</HStack>
}