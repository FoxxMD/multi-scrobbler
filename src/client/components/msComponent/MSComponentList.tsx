import React, { ComponentProps, useMemo, useState, forwardRef, Fragment } from "react"
import { CheckboxCard, Span, Stack, SegmentGroup, Text, Box, Center, Heading, Button, Separator, HStack, Flex, Badge } from '@chakra-ui/react';
import { ComponentsApiJson } from "../../../core/Api";
import { components } from "storybook/internal/components";
import { MSComponentSummary } from "./MSComponentSummary";

export interface ComponentListProps {
    components: ComponentsApiJson[]
}

export const MSComponentList = (props: ComponentListProps) => {
    const [shownType, setShownType] = useState("All");
    return (
        <Stack gap="3">
            <Center>
                <SegmentGroup.Root value={shownType} onValueChange={(val) => setShownType(val.value)}>
                    <SegmentGroup.Indicator />
                    <SegmentGroup.Items items={["All", "Sources", "Clients"]} />
                </SegmentGroup.Root>
            </Center>
            <Stack>
                {props.components.filter(x => {
                    if (shownType === 'All') {
                        return true;
                    }
                    if (shownType === 'Sources') {
                        return x.mode === 'source';
                    }
                    return x.mode === 'client';
                }).map(x => <MSComponentSummary data={x} key={x.uid} />)}
            </Stack>
        </Stack>
    )
}