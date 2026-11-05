import { Box, HStack, Icon, StackSeparator, type IconProps, Span, Badge, Tag, Popover, Portal, Stack, Link, Float, Circle, chakra } from "@chakra-ui/react";
import { EditIcon, getMusicServiceIconElement, getMusicServiceIconOrDefault, XIcon } from "../icons/ChakraIcons";
import { musicServicesSchema, musicServiceBaseSchema, type MusicServicesAny, type MusicServices, type MusicServiceBase, type MusicServiceIdBase } from '../../../core/Atomic';
import { capitalize, capitalizeWords } from "../../../core/StringUtils";
import { Muted } from "../Typography";
import { Tooltip } from "../ChakraTooltip";
import type React from "react";
import { LuExternalLink } from "react-icons/lu";
import { useId, useState, type ComponentProps } from "react";
import { linkFromMusicService } from "../../../core/MusicMetadata";
import { MusicServiceInput } from "./MusicServiceEditable";
import { spreadContainerCss, spreadItemCss, useTouchSpread } from "../useTouchSpread";

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
        return <Tooltip positioning={{ placement: "top-start" }} content={toolTipContent} interactive><HStack>{content}</HStack></Tooltip>
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
                <Tooltip positioning={{ placement: "top-start" }} interactive contentProps={{ userSelect: "all" }} closeDelay={300} content={data.id}><Span userSelect="all" maxW="200px" truncate>{data.id}</Span></Tooltip>
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
    /** false shows only the summary tooltip, no popover */
    interactive?: boolean
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
            return <MusicServiceInput value={data} useWith={useWith} onSubmit={(newVals) => { onChange(newVals); setEditing(false); }} onCancel={() => setEditing(false)} />
        }
        return <MusicServiceInfoDisplay editable={editable} tooltip onEdit={() => setEditing(true)} onRemove={() => onRemove()} data={data} {...rest} />
    }

    if (musicServiceBaseSchema.validate(data)) {
        return <MusicServiceIndicatorPopover services={[data]} iconProps={rest.iconProps} link={rest.link} interactive={rest.interactive}/>
    }

    return <Icon tooltip {...rest}><LuExternalLink /></Icon>
}

/**
 * Group services by name, keeping first seen order.
 * The same service with different idTypes (ie musicbrainz release + release-group) becomes one merged indicator.
 * */
export const groupMusicServices = (services: MusicServicesAny[]): MusicServicesAny[][] => {
    const groups = new Map<string, MusicServicesAny[]>();
    for (const x of services) {
        const group = groups.get(x.name);
        if (group === undefined) {
            groups.set(x.name, [x]);
        } else {
            group.push(x);
        }
    }
    return Array.from(groups.values());
}

const serviceLabel = (name: string) => name === 'isrc' ? 'ISRC' : capitalize(name);
const idTypeLabel = (x: MusicServicesAny): string | undefined => 'idType' in x && x.idType !== undefined ? capitalizeWords(x.idType.replaceAll('-', ' ')) : undefined;

export interface MusicServiceIndicatorPopoverProps {
    /** services with the same name, more than one is shown as one merged indicator */
    services: MusicServicesAny[]
    iconProps?: IconProps
    link?: boolean | string
    /** false shows only the summary tooltip, no popover. Default true */
    interactive?: boolean
    /** show the number of merged services as a badge on the icon, for when there is no ring to show it. Default false */
    countBadge?: boolean
}

/**
 * Service icon with a summary tooltip (service + id types) on hover.
 * Click/tap opens a popover with each id and its link, so merged services keep a link per id type.
 * */
export const MusicServiceIndicatorPopover = (props: MusicServiceIndicatorPopoverProps) => {
    const {
        services,
        iconProps = {},
        link = true,
        interactive = true,
        countBadge = false,
    } = props;
    const triggerId = useId();
    const [open, setOpen] = useState(false);

    const name = services[0].name;
    const label = serviceLabel(name);
    const types = services.map(idTypeLabel).filter(x => x !== undefined);
    const summary = types.length > 0 ? `${label}: ${types.join(', ')}` : label;
    const withIds = services.filter((x): x is MusicServices => 'id' in x);

    const icon = name === 'isrc'
        ? <Badge marginX="0" colorPalette="purple" size="xs" variant="subtle">ISRC</Badge>
        : <Icon size="sm" {...iconProps}>{getMusicServiceIconElement(name)}</Icon>;
    const badge = countBadge && services.length > 1 ? (
        <Float placement="bottom-end" offset="1">
            <Circle size="4" bg="fg" color="bg" fontSize="2xs" fontWeight="bold" lineHeight="1" outline="1.5px solid" outlineColor="bg" aria-hidden>{services.length}</Circle>
        </Float>
    ) : undefined;

    // nothing to show in a popover
    if (!interactive || withIds.length === 0) {
        return (
            <Tooltip positioning={{ placement: "top-start" }} content={summary}>
                <Span display="inline-flex" position="relative" lineHeight="0">{icon}{badge}</Span>
            </Tooltip>
        );
    }

    return (
        // popover content is portaled but still bubbles through the React tree, stop it here so a parent (ie a combobox item) does not act on it
        // Escape is let through, the popover closes on it from a document listener
        <Span display="contents" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => { if (e.key !== 'Escape') { e.stopPropagation(); } }}>
            <Popover.Root ids={{ trigger: triggerId }} open={open} onOpenChange={(e) => setOpen(e.open)} lazyMount unmountOnExit positioning={{ placement: "top-start" }}>
                {/* shared trigger id so tooltip and popover use the same element, tooltip is hidden while the popover is open */}
                <Tooltip ids={{ trigger: triggerId }} positioning={{ placement: "top-start" }} content={summary} open={open ? false : undefined}>
                    <Popover.Trigger asChild>
                        <chakra.button
                            type="button"
                            aria-label={services.length > 1 ? `${label}, ${services.length} IDs` : `${label} ${types[0] ?? 'ID'}`}
                            display="inline-flex"
                            position="relative"
                            lineHeight="0"
                            cursor="pointer"
                            borderRadius="full"
                            focusVisibleRing="outside"
                        >
                            {icon}{badge}
                        </chakra.button>
                    </Popover.Trigger>
                </Tooltip>
                <Portal>
                    <Popover.Positioner>
                        <Popover.Content width="auto" maxWidth="xs">
                            <Popover.Arrow />
                            <Popover.Body padding="3">
                                <Stack gap="2" textStyle="sm">
                                    <Popover.Title fontWeight="semibold">{label}</Popover.Title>
                                    {withIds.map((x, i) => {
                                        const type = idTypeLabel(x) ?? 'ID';
                                        const href = getMusicServiceLinkFromProps(link, x);
                                        return (
                                            <HStack key={i} gap="4" justify="space-between">
                                                {href !== undefined
                                                    ? <Link href={href} target="_blank" rel="noreferrer" fontWeight="medium" colorPalette="blue">{type} <LuExternalLink /></Link>
                                                    : <Span fontWeight="medium">{type}</Span>}
                                                <Span userSelect="all" fontFamily="mono" textStyle="xs" color="fg.muted" maxWidth="40" truncate>{x.id}</Span>
                                            </HStack>
                                        );
                                    })}
                                </Stack>
                            </Popover.Body>
                        </Popover.Content>
                    </Popover.Positioner>
                </Portal>
            </Popover.Root>
        </Span>
    );
}

export const MusicServiceIndicators = (props: {
    services: MusicServicesAny[],
    iconProps?: IconProps,
    showId?: boolean,
    link?: boolean,
    seperator?: boolean
    /** false shows only the summary tooltips, no popovers */
    interactive?: boolean
} & Omit<ComponentProps<typeof HStack>, 'children'>) => {
    const {
        services = [],
        iconProps,
        showId,
        link,
        seperator,
        interactive,
        ...rest
    } = props;

    if (services.length === 0) {
        return undefined;
    }
    return (
        <HStack {...rest} separator={seperator === true ? <StackSeparator /> : undefined}>
            {groupMusicServices(services).map((x, i) => <MusicServiceIndicatorPopover key={i} services={x} iconProps={iconProps} link={link} interactive={interactive} countBadge/>)}
        </HStack>
    )
}

/**
 * MusicServiceIndicators that overlap into a compact stack, spreading out while hovered and lifting the hovered icon (like AvatarStack).
 * On touch devices the first tap spreads the stack until a tap outside of it, then tapping an icon opens its popover.
 * Services with the same name are merged into one indicator, shown as stacked rings (or a count badge without rings).
 * Icons past `max` are replaced by a "+n" chip.
 * */
export const MusicServiceIndicatorStack = (props: {
    services: MusicServicesAny[],
    iconProps?: IconProps,
    showId?: boolean,
    link?: boolean,
    /** gap between icons while the stack is hovered. Default '1' */
    spread?: ComponentProps<typeof HStack>['spaceX']
    /** gap between icons while the stack is spread by touch, wider so a finger can hit them. Default '2' */
    touchSpread?: ComponentProps<typeof HStack>['spaceX']
    /** false shows only the summary tooltips, no popovers */
    interactive?: boolean
    /** icons shown before the overflow chip. Default 5 */
    max?: number
    /** total used for the overflow chip (shows count - max). Default number of indicators (after merging) */
    count?: number
    /** locale for the overflow number */
    locale?: string
    /** screen reader text for the overflow chip. Default `and ${n} others` */
    moreLabel?: (n: string) => string
    /** color of the cutout ring around each icon, should match the background the stack is on (ie a card). Default 'bg' */
    outlineColor?: ComponentProps<typeof Box>['outlineColor']
    /** filled circle with a cutout ring behind each icon. Default true */
    ring?: boolean
    /** Force stack even when there is only one service */
    force?: boolean
} & Omit<ComponentProps<typeof HStack>, 'children' | 'outlineColor'>) => {
    const {
        services = [],
        iconProps,
        showId,
        link,
        spread = '1',
        touchSpread = '2',
        interactive,
        max = 5,
        count: countProp,
        locale,
        moreLabel = (n) => `and ${n} others`,
        outlineColor = 'bg',
        ring = true,
        force = false,
        ...rest
    } = props;
    const groups = groupMusicServices(services);
    const count = countProp ?? groups.length;
    const visible = groups.slice(0, max);
    const remaining = count - visible.length;
    const remainingStr = remaining.toLocaleString(locale);
    const touch = useTouchSpread<HTMLDivElement>(visible.length > 1);

    if (groups.length === 0) {
        return undefined;
    }
    if(groups.length === 1 && force !== true) {
        return <Box display={props.display}><MusicServiceIndicatorPopover services={groups[0]} iconProps={iconProps} link={link} interactive={interactive} countBadge/></Box>
    }
    return (
        <HStack
            gap="0"
            spaceX="-1"
            {...rest}
            {...touch.containerProps}
            // the gaps between icons are part of the stack too, a parent (ie a combobox item) should not act on them
            onClick={(e) => e.stopPropagation()}
            css={[spreadContainerCss(spread, touchSpread), rest.css]}
        >
            {visible.map((x, i) => (
                <Box
                    key={i}
                    position="relative"
                    display="inline-flex"
                    alignItems="center"
                    justifyContent="center"
                    // inline content (link, svg) would otherwise add line box height and stretch the circle into an oval
                    lineHeight="0"
                    // like AvatarGroup: a filled circle with a cutout ring in the page background. outline takes no space so the stack stays compact
                    {...(ring ? {padding: '1', borderRadius: 'full', bg: 'bg.emphasized', outline: '2px solid', outlineColor} : {})}
                    // merged: a second filled circle peeking out behind, like a stack of cards. the outline cutout separates the two
                    boxShadow={ring && x.length > 1 ? '5px -2px 0 1px var(--chakra-colors-border-emphasized)' : undefined}
                    marginX={ring && x.length > 1 ? 'var(--chakra-spacing-1\\.5)' : undefined}
                    css={spreadItemCss}
                >
                    <MusicServiceIndicatorPopover services={x} iconProps={iconProps} link={link} interactive={interactive} countBadge={!ring}/>
                </Box>
            ))}
            {remaining > 0 ? (
                <Badge position="relative" size="xs" variant="solid" borderRadius="full" aria-label={moreLabel(remainingStr)}>
                    <Span aria-hidden>+{remainingStr}</Span>
                </Badge>
            ) : undefined}
        </HStack>
    )
}

export const getMusicServiceIconTooltip = (service: string) => {
    const ServiceIcon = getMusicServiceIconOrDefault(service);
    return (props: IconProps = {}) => (
        <Tooltip content={service} interactive>
            <Icon {...props}><ServiceIcon /></Icon>
        </Tooltip>
    );
}