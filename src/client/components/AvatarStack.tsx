import React, { useEffect, useState, type ComponentProps, type ElementType } from "react";
import { Avatar, AvatarGroup, type SystemStyleObject } from "@chakra-ui/react";
import { Tooltip } from "./ToggleTip";
import { spreadContainerCss, spreadItemCss, useTouchSpread } from "./useTouchSpread";

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

// Avatar.Root must receive the props AvatarGroup (Group) clones onto its children (data-group-item, --group-index...)
// but Tooltip.Root renders no element, so this component takes them and puts them on Avatar.Root itself
const StackAvatar = (props: ComponentProps<typeof Avatar.Root> & { item: AvatarStackItem, tooltipOpen?: boolean }) => {
    const {item: {name, icon: Icon, src, colorPalette}, tooltipOpen, ...rest} = props;
    return (
        <Tooltip content={name} showArrow positioning={{placement: 'top'}} openDelay={0} closeDelay={0} open={tooltipOpen}>
            <Avatar.Root
                colorPalette={colorPalette}
                {...rest}
                css={[spreadItemCss, {'&[data-group-item]': {borderWidth: '1px'}}, rest.css]}
            >
                {/* icons scale with the avatar instead of its font size, so they fill most of the circle */}
                <Avatar.Fallback name={name} css={{'& svg': {width: 'calc(var(--avatar-size) * 0.65)', height: 'calc(var(--avatar-size) * 0.65)'}}}>{Icon !== undefined ? <Icon/> : undefined}</Avatar.Fallback>
                {src !== undefined ? <Avatar.Image src={src}/> : undefined}
            </Avatar.Root>
        </Tooltip>
    );
}

/**
 * AvatarGroup that spreads out while hovered and lifts the hovered avatar, with a tooltip of its name.
 * Avatars past `max` are replaced by a "+n" chip.
 *
 * Hover effects only apply to devices with a fine pointer.
 * On touch devices the first tap spreads the stack until a tap outside of it, then tapping an avatar shows its tooltip.
 * Motion is removed for prefers-reduced-motion.
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
    const touch = useTouchSpread<HTMLDivElement>();
    // avatar tapped while spread by touch, touch never opens a tooltip by itself
    const [active, setActive] = useState<number | undefined>(undefined);
    useEffect(() => {
        if (!touch.spread) {
            setActive(undefined);
        }
    }, [touch.spread]);

    return (
        <AvatarGroup stacking="first-on-top" {...rest} {...touch.containerProps} css={[spreadContainerCss(spread), rest.css]}>
            {visible.map((x, i) => (
                <StackAvatar
                    key={`${x.name}-${i}`}
                    item={x}
                    data-active={touch.spread && active === i ? '' : undefined}
                    onClick={() => setActive(i)}
                    // undefined when not spread by touch so mouse hover works as usual
                    tooltipOpen={touch.spread ? active === i : undefined}
                />
            ))}
            {remaining > 0 ? (
                // wider numbers stretch the chip into a pill
                // offset (not margin, the group's spacing overrides it) so it reads as separate from the list
                <Avatar.Root insetInlineStart="1.5" variant="solid" width="auto" minWidth="var(--avatar-size)" paddingX="1.5" aria-label={moreLabel(remainingStr)}>
                    <Avatar.Fallback aria-hidden>+{remainingStr}</Avatar.Fallback>
                </Avatar.Root>
            ) : undefined}
        </AvatarGroup>
    );
}
