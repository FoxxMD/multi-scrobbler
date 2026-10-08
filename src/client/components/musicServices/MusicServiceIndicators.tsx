import { HStack, Icon, Separator, StackSeparator, type IconProps, Span, Badge } from "@chakra-ui/react";
import { getMusicServiceIcon, getMusicServiceIconElement } from "../icons/ChakraIcons";
import { musicServicesSchema, musicServiceIdBaseSchema, musicServiceBaseSchema, musicServiceName, type MusicServicesAny, type MusicServices, type MusicServiceBase, type MusicServiceName } from '../../../core/Atomic';
import { capitalize } from "../../../core/StringUtils";
import { Muted } from "../Typography";
import { Tooltip } from "../ChakraTooltip";
import type React from "react";
import { LuExternalLink } from "react-icons/lu";
import type { ComponentProps } from "react";

export interface MusicServiceInfoIconProps {
    id?: string,
    link?: string
    idHint?: string
    tooltip?: boolean
    iconProps?: IconProps
    showId?: boolean
    type: MusicServiceName
}
export const MusicServiceInfoIcon = (props: MusicServiceInfoIconProps) => {

    const {
        iconProps = {},
        link,
        id,
        idHint,
        tooltip,
        type,
        showId = false,
    } = props;

    let icon: React.JSX.Element;
    if(type === 'isrc') {
        icon = <Badge marginX="0" colorPalette="purple" size="xs" variant="subtle">ISRC</Badge>
    } else {
        icon = <Icon size="sm" {...iconProps}>{getMusicServiceIconElement(type)}</Icon>;
    }

    const cappedType = type === 'isrc' ? 'ISRC' : capitalize(type);

    let content: React.JSX.Element | string;
    if (link !== undefined) {
        content = <a target='_blank' rel='noreferrer' href={link}>{icon}</a>
    } else {
        content = icon;
    }
    let visibleId: React.JSX.Element | null = null;
    if (showId && id !== undefined) {
        visibleId = <><Separator orientation="vertical" height="4" /><Muted textStyle="xs">{`${cappedType}`}{idHint !== undefined ? ` ${capitalize(idHint)}` : ''} <Span userSelect="all">{id}</Span></Muted></>
    }

    if (tooltip) {
        if(id !== undefined) {
            return <Tooltip content={`${cappedType}${idHint !== undefined ? ` ${capitalize(idHint)} ` : ' '}${id}`} interactive><HStack>{visibleId}{content}</HStack></Tooltip>;
        }
        return <Tooltip content={`Has ${cappedType}${idHint !== undefined ? ` ${capitalize(idHint)} ` : ' ID '}`} interactive><HStack>{visibleId}{content}</HStack></Tooltip>;
    }
    return <HStack>{visibleId}{content}</HStack>;
}

export const MusicServiceIndicator = (props: { data: MusicServices | MusicServiceBase, iconProps?: IconProps, showId?: boolean, link?: boolean }) => {
    const {
        data,
        link: showLink = false,
        ...rest
    } = props;

    if (musicServiceIdBaseSchema.validate(data)) {
        const res = musicServicesSchema.safeParse(data)
        if (res.success && res.data.name === musicServiceName.enum.musicbrainz) {
            const link = data.idType !== undefined && showLink ? `https://musicbrainz.org/${data.idType}/${data.id}` : undefined;
            return <MusicServiceInfoIcon type={data.name} tooltip idHint={data.idType} id={data.id} link={link} {...rest} />
        }
        return <MusicServiceInfoIcon type={data.name} id={data.id} idHint={data.idType} {...rest} tooltip/>
    }

    if (musicServiceBaseSchema.validate(data)) {
        return <MusicServiceInfoIcon type={data.name} tooltip {...rest} />
    }

    return <Icon {...rest}><LuExternalLink /></Icon>
}

export const MusicServiceIndicators = (props: {
    services: MusicServicesAny[],
    iconProps?: IconProps,
    showId?: boolean,
    link?: boolean,
    seperator?: boolean
} & Omit<ComponentProps<typeof HStack>, 'children'>) => {
    const {
        services = [],
        iconProps,
        showId,
        link,
        seperator,
        ...rest
    } = props;

    if (services.length === 0) {
        return undefined;
    }
    return (
        <HStack {...rest} separator={seperator === true ? <StackSeparator /> : undefined}>
            {services.map((x, i) => <MusicServiceIndicator key={i} data={x} iconProps={iconProps} showId={showId} link={link} />)}
        </HStack>
    )
}

export const getMusicServiceIconTooltip = (service: string) => {
    const ServiceIcon = getMusicServiceIcon(service);
    return (props: IconProps = {}) => (
        <Tooltip content={service} interactive>
            <Icon {...props}><ServiceIcon /></Icon>
        </Tooltip>
    );
}