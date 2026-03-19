import { Collapsible, Stack, Box } from "@chakra-ui/react"
import { ComponentProps, PropsWithChildren, useState, useEffect } from "react";
import { LuChevronRight } from "react-icons/lu"

//padding="0" borderWidth="0px"

interface MSCollapsibleInternalProps {
    indicator?: string | JSX.Element
    boxProps?: object
}

export interface MSCollapsibleExternalProps {
    collapsibleOpen?: boolean
}

export type MSCollapsibleProps = PropsWithChildren<ComponentProps<typeof Collapsible.Root>> & MSCollapsibleInternalProps;

export const MSCollapsible = (props: MSCollapsibleProps) => {
    const {
        indicator = 'Details',
        boxProps = {},
        defaultOpen,
        ...rest
    } = props;

    const [open, setOpen] = useState(defaultOpen)

    useEffect(() => {
        setOpen(defaultOpen);
    }, [setOpen, defaultOpen]);

    return (
        <Collapsible.Root open={open} onOpenChange={(val) => setOpen(val.open)} {...rest}>
            <Collapsible.Trigger
                paddingY="3"
                display="flex"
                gap="2"
                alignItems="center"
            >
                <Collapsible.Indicator
                    transition="transform 0.2s"
                    _open={{ transform: "rotate(90deg)" }}
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
