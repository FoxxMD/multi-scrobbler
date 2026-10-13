import { Box, Collapsible, IconButton, useBreakpointValue } from "@chakra-ui/react";
import { type ComponentProps, type PropsWithChildren, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { LuChevronDown, LuChevronRight, LuChevronUp } from "react-icons/lu";
import { MSErrorBoundary } from "./ErrorBoundary";

//padding="0" borderWidth="0px"

interface MSCollapsibleInternalProps {
    indicator?: string | React.JSX.Element
    boxProps?: object
    triggerProps?: object
    indicatorProps?: object
    /** Show a CodeBlock-style gradient overlay trigger on top of closed content. Use with `collapsedHeight`. */
    overlay?: boolean | string | React.JSX.Element
    overlayProps?: object
    timeline?: boolean
    disableUntil?: string
}

export interface MSCollapsibleExternalProps {
    collapsibleOpen?: boolean
}

export const timelineCollapsibleProps = {
    indicatorProps: {  },
    triggerProps: { paddingBlockStart: "0.3em" },
    triggerPropsClosed: {
         //paddingBlockStart: "0.3em",
         paddingBlock: 'initial' 
        },
    triggerPropsOpen: {
        paddingBlock: 'initial',
        paddingBlockEnd: "var(--chakra-spacing-3)"
    }
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
        overlay = false,
        overlayProps = {},
        timeline = false,
        defaultOpen,
        collapsedHeight,
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
        // disabled for every breakpoint below disableUntil
        for(const b of breakpoints) {
            if(b === disableUntil) {
                found = true;
            }
            breaks[b] = !found;
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

    // when the content is no taller than collapsedHeight there is nothing to expand: show it fully and hide overlay/toggle
    const overlayMode = Boolean(overlay) && collapsedHeight !== undefined;
    const contentRef = useRef<HTMLDivElement>(null);
    // hidden element sized to collapsedHeight so any css unit resolves to px
    const probeRef = useRef<HTMLDivElement>(null);
    const [fits, setFits] = useState(false);

    useLayoutEffect(() => {
        const content = contentRef.current;
        const probe = probeRef.current;
        if (!overlayMode || content === null || probe === null) {
            setFits(false);
            return;
        }
        const measure = () => setFits(content.offsetHeight <= probe.offsetHeight);
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(content);
        observer.observe(probe);
        return () => observer.disconnect();
    }, [overlayMode, collapsedHeight]);

    const iProps = { ...(timeline ? timelineCollapsibleProps.indicatorProps : {}), ...indicatorProps };
    if (isDisabled) {
        // @ts-ignore
        iProps.display = 'none';
    }

    const tProps = { ...(timeline ? (open? timelineCollapsibleProps.triggerPropsOpen : timelineCollapsibleProps.triggerPropsClosed) : {}), ...triggerProps }

    return (
        <Collapsible.Root open={open || fits} onOpenChange={(val) => setOpen(val.open)} flexGrow="1" disabled={isDisabled} collapsedHeight={collapsedHeight} position={overlay ? 'relative' : undefined} {...rest}>
            {overlayMode ? (
                // re-implementation of chakra's CodeBlockHeader/Title/Control (styles from its slot recipe), minus the code-block padding vars
                <Box as="header" display="flex" alignItems="center" gap="2" position="relative" minH="10" {...tProps}>
                    <Box display="inline-flex" alignItems="center" gap="1.5" flex="1" color="fg.muted">{indicator}</Box>
                    {!isDisabled && !fits && (
                        <Collapsible.Trigger asChild>
                            <IconButton variant="ghost" size="2xs" aria-label={open ? 'Collapse' : 'Expand'} {...iProps}>
                                {open ? <LuChevronUp /> : <LuChevronDown />}
                            </IconButton>
                        </Collapsible.Trigger>
                    )}
                </Box>
            ) : (
            <Collapsible.Trigger
                cursor={isDisabled ? 'initial' : 'pointer'}
                userSelect="text"
                paddingY="3"
                display="flex"
                gap="2"
                alignItems="anchor-center"
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
            )}
            <Collapsible.Content>
                <Box ref={contentRef} {...boxProps}>
                    <MSErrorBoundary>
                    {props.children}
                    </MSErrorBoundary>
                </Box>
            </Collapsible.Content>
            {overlayMode && <Box ref={probeRef} style={{ height: collapsedHeight }} position="absolute" visibility="hidden" pointerEvents="none" />}
            {/* re-implementation of chakra's CodeBlockOverlay */}
            {overlay && !open && !isDisabled && !fits && (
                <Box
                    as="button"
                    onClick={() => setOpen(true)}
                    cursor="pointer"
                    display="flex"
                    alignItems="flex-end"
                    justifyContent="center"
                    padding="4"
                    bgImage="linear-gradient(0deg, {colors.black/50} 25%, transparent 100%)"
                    color="white"
                    minH="5rem"
                    pos="absolute"
                    bottom="0"
                    insetInline="0"
                    zIndex="1"
                    fontWeight="medium"
                    {...overlayProps}
                >
                    {overlay === true ? 'Show more' : overlay}
                </Box>
            )}
        </Collapsible.Root>
    )
}