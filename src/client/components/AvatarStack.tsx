import React, { type ComponentProps, type ElementType } from "react";
import { Avatar, AvatarGroup, type SystemStyleObject } from "@chakra-ui/react";
import { Tooltip } from "./ToggleTip";

export interface AvatarStackItem {
    /** shown in the tooltip, and as initials when there is no icon/image */
    name: string
    /** an IconType (getMusicServiceIcon) or Chakra icon component (getMusicServiceChakraIcon) */
    icon?: ElementType
    src?: string
    colorPalette?: string
}

export interface AvatarStackProps extends Omit<ComponentProps<typeof AvatarGroup>, 'children'> {
    items: AvatarStackItem[]
    /** avatars shown before the overflow chip. Default 5 */
    max?: number
    /** total used for the overflow chip (shows count - max). Default items.length */
    count?: number
    /** gap between avatars while the stack is hovered. Default '1' */
    spread?: SystemStyleObject['spaceX']
    /** locale for the overflow number */
    locale?: string
    /** screen reader text for the overflow chip. Default `and ${n} others` */
    moreLabel?: (n: string) => string
}

const finePointer = '@media (hover: hover) and (pointer: fine)';

// Avatar.Root must receive the props AvatarGroup (Group) clones onto its children (data-group-item, --group-index...)
// but Tooltip.Root renders no element, so this component takes them and puts them on Avatar.Root itself
const StackAvatar = (props: ComponentProps<typeof Avatar.Root> & { item: AvatarStackItem }) => {
    const {item: {name, icon: Icon, src, colorPalette}, ...rest} = props;
    return (
        <Tooltip content={name} showArrow positioning={{placement: 'top'}} openDelay={0} closeDelay={0}>
            <Avatar.Root
                colorPalette={colorPalette}
                {...rest}
                css={[{
                    _motionSafe: {transitionProperty: 'margin, transform', transitionDuration: 'moderate', transitionTimingFunction: 'ease-out'},
                    [finePointer]: {
                        _hover: {zIndex: 'docked', _motionSafe: {transform: 'translateY(-0.25rem)'}},
                    },
                }, rest.css]}
            >
                <Avatar.Fallback name={name}>{Icon !== undefined ? <Icon/> : undefined}</Avatar.Fallback>
                {src !== undefined ? <Avatar.Image src={src}/> : undefined}
            </Avatar.Root>
        </Tooltip>
    );
}

/**
 * AvatarGroup that spreads out while hovered and lifts the hovered avatar, with a tooltip of its name.
 * Avatars past `max` are replaced by a "+n" chip.
 *
 * Hover effects only apply to devices with a fine pointer, motion is removed for prefers-reduced-motion.
 * Inspired by https://moonarc.dev/components/avatar-stack/
 * */
export const AvatarStack = (props: AvatarStackProps) => {
    const {
        items,
        max = 5,
        count = items.length,
        spread = '1',
        locale,
        moreLabel = (n) => `and ${n} others`,
        ...rest
    } = props;
    const visible = items.slice(0, max);
    const remaining = count - visible.length;
    const remainingStr = remaining.toLocaleString(locale);

    return (
        <AvatarGroup {...rest} css={[{[finePointer]: {_hover: {spaceX: spread}}}, rest.css]}>
            {visible.map((x, i) => <StackAvatar key={`${x.name}-${i}`} item={x}/>)}
            {remaining > 0 ? (
                // wider numbers stretch the chip into a pill
                <Avatar.Root variant="solid" width="auto" minWidth="var(--avatar-size)" paddingX="1.5" aria-label={moreLabel(remainingStr)}>
                    <Avatar.Fallback aria-hidden>+{remainingStr}</Avatar.Fallback>
                </Avatar.Root>
            ) : undefined}
        </AvatarGroup>
    );
}
