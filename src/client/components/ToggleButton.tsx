import React, { type ComponentProps, Fragment, useMemo, useState, useCallback } from "react"
import { Accordion, Span, Stack, Text, Box, HStack, Flex, Container, SkeletonText, Collapsible, ScrollArea, Button } from '@chakra-ui/react';

interface ToggleButtonProps {
    value?: boolean
    initialValue?: boolean
    onChange?: (val: boolean) => void
}

const noop = (_) => null;

export const ToggleButtonVariant = (props: ToggleButtonProps & ComponentProps<typeof Button>) => {

    const {
        value: propVal,
        initialValue = false,
        onChange = noop,
        children,
        variant,
        ...rest
    } = props;

    const [value, setValue] = useState(propVal ?? initialValue);

    return <Button variant={value ? 'surface' : 'outline'} onClick={() => setValue(!value)} {...rest}>{children}</Button>;
}