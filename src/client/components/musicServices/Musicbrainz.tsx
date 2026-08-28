import { Icon, type IconProps, Separator, HStack } from "@chakra-ui/react";
import { getMusicServiceIconElement } from "../icons/ChakraIcons";
import { capitalize } from "../../../core/StringUtils";
import { Tooltip } from "../ChakraTooltip";
import type React from "react";
import { Muted } from "../Typography";

export interface MusicbrainzInfoIconProps {
    type: 'recording' | 'release' | 'track' | 'artist',
    mbid: string,
    link?: boolean
    tooltip?: boolean
    iconProps?: IconProps
    showMbid?: boolean
}
export const MusicbrainzInfoIcon = (props: MusicbrainzInfoIconProps) => {

    const {
        iconProps = {},
        link,
        mbid,
        tooltip,
        type,
        showMbid = false,
    } = props;

    const icon = <Icon size="sm" {...iconProps}>{getMusicServiceIconElement('musicbrainz')}</Icon>;

    let content: React.JSX.Element;
    if (link) {
        content = <a target='__blank' href={`https://musicbrainz.org/${type}/${mbid}`}>{icon}</a>
    } else {
        content = icon;
    }
    let visibleMbid: React.JSX.Element = null;
    if(showMbid) {
        visibleMbid = <><Separator orientation="vertical" height="4" /><Muted textStyle="xs">{`${capitalize(type)}`} {mbid}</Muted></>
    }

    if (tooltip) {
        return <Tooltip content={`${capitalize(type)} MBID ${mbid}`} interactive><HStack>{visibleMbid}{content}</HStack></Tooltip>;
    }
    return <HStack>{visibleMbid}content</HStack>;
}