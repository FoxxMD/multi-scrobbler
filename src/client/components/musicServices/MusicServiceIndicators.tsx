import { HStack, Icon, Separator, StackSeparator, type IconProps, Span, Badge, Tag } from "@chakra-ui/react";
import { EditButton, EditIcon, EditIconRaw, getMusicServiceIcon, getMusicServiceIconElement, XButton, XIcon } from "../icons/ChakraIcons";
import { musicServicesSchema, musicServiceIdBaseSchema, musicServiceBaseSchema, musicServiceName, type MusicServicesAny, type MusicServices, type MusicServiceBase, type MusicServiceName, type MusicServiceIdBase } from '../../../core/Atomic';
import { capitalize } from "../../../core/StringUtils";
import { Muted } from "../Typography";
import { Tooltip } from "../ChakraTooltip";
import type React from "react";
import { LuExternalLink } from "react-icons/lu";
import { useState, type ComponentProps } from "react";
import { linkFromMusicService } from "../../../core/MusicMetadata";
import { MusicServiceInput } from "./MusicServiceEditable";

const getMusicServiceLinkFromProps = (link: boolean | string, val: MusicServicesAny): string | undefined => {
    if (typeof link === 'string') {
        return link;
    }
    if (link === false) {
        return undefined;
    }
    return linkFromMusicService(val);
}

export interface MusicServiceInfoIconProps {
    link?: boolean | string
    tooltip?: boolean
    iconProps?: IconProps
    data: MusicServices | MusicServiceIdBase | MusicServiceBase
}
export const MusicServiceInfoIcon = (props: MusicServiceInfoIconProps) => {

    const {
        iconProps = {},
        link = true,
        tooltip,
        data,
    } = props;

    let icon: React.JSX.Element;
    if (data.name === 'isrc') {
        icon = <Badge marginX="0" colorPalette="purple" size="xs" variant="subtle">ISRC</Badge>
    } else {
        icon = <Icon size="sm" {...iconProps}>{getMusicServiceIconElement(data.name)}</Icon>;
    }

    const cappedType = data.name === 'isrc' ? 'ISRC' : capitalize(data.name);

    let content: React.JSX.Element | string;
    const derivedLink = link === undefined ? undefined : getMusicServiceLinkFromProps(link, data);
    if (derivedLink !== undefined) {
        content = <a target='_blank' rel='noreferrer' href={derivedLink}>{icon}</a>
    } else {
        content = icon;
    }

    let toolTipContent: string | React.JSX.Element;
    if (tooltip) {
        if (('id' in data)) {
            toolTipContent = data.id !== undefined ?
                `${cappedType}${data.idType !== undefined ? ` ${capitalize(data.idType)} ` : ' '}${data.id}` :
                `Has ${cappedType}${data.idType !== undefined ? ` ${capitalize(data.idType)} ` : ' ID '}`;
        } else {
            toolTipContent = data.name;
        }
        return <Tooltip content={toolTipContent} interactive><HStack>{content}</HStack></Tooltip>
    }
    return content;
}

export interface MusicServiceInfoDisplayProps {
    link?: boolean | string
    tooltip?: boolean
    iconProps?: IconProps
    data: MusicServices
    editable?: boolean
    onEdit?: () => void
    onRemove?: () => void
}

export const MusicServiceInfoDisplay = (props: MusicServiceInfoDisplayProps) => {

    const {
        data,
        onEdit = () => console.log(data, 'triggered edit'),
        onRemove = () => console.log(data, 'triggered remove'),
        editable,
    } = props;

    const icon = <MusicServiceInfoIcon iconProps={{ verticalAlign: 'baseline' }} {...props} tooltip />

    const idHintContent = data.idType !== undefined ? capitalize(data.idType) : '';

    return (<Tag.Root size="lg" variant="outline">
        <Tag.StartElement width="fit-content">
            {icon}
        </Tag.StartElement>
        <Tag.Label>
            <HStack>
                <Muted textStyle="xs">{idHintContent}</Muted>
                <Tooltip interactive contentProps={{ userSelect: "all" }} closeDelay={300} content={data.id}><Span userSelect="all" maxW="200px" truncate>{data.id}</Span></Tooltip>
            </HStack>
        </Tag.Label>
        {editable === true ? (
            <Tag.EndElement width="fit-content">
                <HStack gapX="3">
                    <EditIcon size="sm" cursor="pointer" onClick={() => onEdit()} />
                    <XIcon cursor="pointer" onClick={() => onRemove()} />
                </HStack>
            </Tag.EndElement>
        ) : undefined}
    </Tag.Root>);
}

export interface MusicServiceIndicatorProps {
    data: MusicServices | MusicServiceBase,
    iconProps?: IconProps,
    showId?: boolean,
    link?: string | boolean
    editable?: boolean
    onChange?: (val: MusicServices) => void
    onRemove?: () => void
    useWith?: string[]
    tooltip?: boolean
}

export const MusicServiceIndicator = (props: MusicServiceIndicatorProps) => {
    const {
        editable = false,
        useWith,
        data,
        onRemove = () => console.log(data, 'Triggered remove'),
        onChange = () => console.log(data, 'Triggered onchange'),
        ...rest
    } = props;

    const [editing, setEditing] = useState<boolean>(false);

    if (editable && musicServicesSchema.validate(data)) {
        if (editing) {
            return <MusicServiceInput value={data} useWith={useWith} onSubmit={(newVals) => onChange(newVals)} onCancel={() => setEditing(false)} />
        }
        return <MusicServiceInfoDisplay editable={editable} tooltip onEdit={() => setEditing(true)} onRemove={() => onRemove()} data={data} {...rest} />
    }

    if (musicServiceBaseSchema.validate(data)) {
        return <MusicServiceInfoIcon tooltip {...props} />
    }

    return <Icon tooltip {...rest}><LuExternalLink /></Icon>
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