import { Collapsible, Stack, Box, useBreakpointValue } from "@chakra-ui/react"
import { diff } from "jsondiffpatch";
import { ComponentProps, PropsWithChildren, useState, useEffect, useMemo } from "react";
import { LuChevronRight } from "react-icons/lu"

//padding="0" borderWidth="0px"

interface MSCollapsibleInternalProps {
    indicator?: string | JSX.Element
    boxProps?: object
    triggerProps?: object
    indicatorProps?: object
    timeline?: boolean
    disableUntil?: string
}

export interface MSCollapsibleExternalProps {
    collapsibleOpen?: boolean
}

export const timelineCollapsibleProps = {
    indicatorProps: { paddingBottom: '4px' },
    triggerProps: { paddingBlockStart: "0.3em" }
}

export type MSCollapsibleProps = PropsWithChildren<ComponentProps<typeof Collapsible.Root>> & MSCollapsibleInternalProps;

const breakpoints = ['base','sm','md','lg','xl'];

export const MSCollapsible = (props: MSCollapsibleProps) => {
    const {
        indicator = 'Details',
        disabled,
        disableUntil,
        boxProps = {},
        triggerProps = {},
        indicatorProps = {},
        timeline = false,
        defaultOpen,
        ...rest
    } = props;

    const breakObj = useMemo(() => {
        if(disableUntil === undefined) {
            return {
                base: false,
                sm: false,
                md: false,
                lg: false,
                xl: false
            };
        }
        const breaks: Record<string, boolean> = {};
        let found = false;
        for(const b of breakpoints) {
            if(!found && disableUntil !== b) {
                breaks[b] = true;
                found = true;
            } else {
                breaks[b] = false;
            }
        }
        return breaks;
    }, [disableUntil])

    const disableByBreakpoint = useBreakpointValue(
        {
            '2xl': false,
            ...breakObj,
        }, {
        fallback: '2xl'
    });

        const currBreakpoint = useBreakpointValue(
        {
            base: "base",
            sm: "sm",
            md: "md",
            lg: "lg",
            xl: "xl",
            ["2xl"]: "2xl"
        }, {
        fallback: '2xl'
    });

    const [open, setOpen] = useState(defaultOpen);
    const [isDisabled, setDisabled] = useState(disabled);

    useEffect(() => {
        setOpen(defaultOpen);
    }, [setOpen, defaultOpen]);

    useEffect(() => {
        if (disabled !== undefined) {
            setDisabled(disabled);
        } else {
            setDisabled(disableByBreakpoint);
        }
    }, [disableByBreakpoint, disabled])

    const iProps = { ...(timeline ? timelineCollapsibleProps.indicatorProps : {}), ...indicatorProps };
    if (isDisabled) {
        // @ts-ignore
        iProps.display = 'none';
    }

    const tProps = { ...(timeline ? timelineCollapsibleProps.triggerProps : {}), ...triggerProps }

    return (
        <Collapsible.Root open={open} onOpenChange={(val) => setOpen(val.open)} flexGrow="1" disabled={isDisabled} {...rest}>
            <Collapsible.Trigger
                cursor={isDisabled ? 'initial' : 'pointer'}
                userSelect="text"
                paddingY="3"
                display="flex"
                gap="2"
                alignItems="flex-start"
                {...tProps}
            >
                <Collapsible.Indicator
                    transition="transform 0.2s"
                    _open={{ transform: "rotate(90deg)" }}
                    {...iProps}
                >
                    <LuChevronRight />
                </Collapsible.Indicator>
                {indicator}
            </Collapsible.Trigger>
            <Collapsible.Content>
                <Box {...boxProps}>
                    {props.children}
                </Box>
            </Collapsible.Content>
        </Collapsible.Root>
    )
}