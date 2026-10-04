import { HStack, Icon, Separator, StackSeparator, type IconProps } from "@chakra-ui/react";
import { getMusicServiceIconElement } from "../icons/ChakraIcons";
import { type MusicServicesAny } from '../../../core/MusicMetadata';
import { type MusicServices } from '../../../core/MusicMetadata';
import { musicServicesSchema } from '../../../core/MusicMetadata';
import { musicServiceIdBaseSchema } from '../../../core/MusicMetadata';
import { type MusicServiceBase } from '../../../core/MusicMetadata';
import { musicServiceBaseSchema } from '../../../core/MusicMetadata';
import { type MusicServiceName } from '../../../core/MusicMetadata';
import { musicServiceName } from '../../../core/MusicMetadata';
import { capitalize } from "../../../core/StringUtils";
import { Muted } from "../Typography";
import { Tooltip } from "../ChakraTooltip";
import type React from "react";
import { LuExternalLink } from "react-icons/lu";
import type { ComponentProps } from "react";
import type { JsonPlayObject } from "../../../core/Atomic";


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

    const icon = <Icon size="sm" {...iconProps}>{getMusicServiceIconElement(type)}</Icon>;

    let content: React.JSX.Element | string;
    if (link !== undefined) {
        content = <a target='_blank' rel='noreferrer' href={link}>{icon}</a>
    } else {
        content = icon;
    }
    let visibleId: React.JSX.Element | null = null;
    if (showId && id !== undefined) {
        visibleId = <><Separator orientation="vertical" height="4" /><Muted textStyle="xs">{`${capitalize(type)}`} {id}</Muted></>
    }

    if (tooltip) {
        if(id !== undefined) {
            return <Tooltip content={`${capitalize(type)}${idHint !== undefined ? ` ${capitalize(idHint)} ` : ''}${id}`} interactive><HStack>{visibleId}{content}</HStack></Tooltip>;
        }
        return <Tooltip content={`Has ${capitalize(type)}${idHint !== undefined ? ` ${capitalize(idHint)} ` : ' ID '}`} interactive><HStack>{visibleId}{content}</HStack></Tooltip>;
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

export const playMetaIdsToMusicServices = (play: JsonPlayObject, type: 'track' | 'album'): MusicServicesAny[] => {
    const {
        data: {
            meta: {
                brainz,
                spotify
            } = {}
        } = {}
    } = play;

    const services: MusicServicesAny[] = [];
    if(type === 'track') {
        if(brainz?.track !== undefined) {
            services.push({name: 'musicbrainz', idHint: 'track', id: brainz.track});
        } else if(brainz?.recording !== undefined) {
            services.push({name: 'musicbrainz', idHint: 'recording', id: brainz.recording});
        }
        if(spotify?.track !== undefined) {
            services.push({name: 'spotify', idType: 'track', id: spotify.track});
        }
        return services;
    }
    if(type === 'album') {
        if(brainz?.album !== undefined) {
            services.push({name: 'musicbrainz', idHint: 'release', id: brainz.album});
        } else if(brainz?.releaseGroup !== undefined) {
            services.push({name: 'musicbrainz', idHint: 'release-group', id: brainz.releaseGroup});
        }
        if(spotify?.album !== undefined) {
            services.push({name: 'spotify', idType: 'album', id: spotify.album});
        }
        return services;
    }
    return services;
}