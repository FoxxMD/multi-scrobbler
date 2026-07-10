import { useState, type ComponentProps, useMemo } from "react"
import { Stack, SegmentGroup, Card, SkeletonText, Box, Flex, Field, Container } from '@chakra-ui/react';
import type {ComponentsApiJson} from "../../../core/Api";
import { MSComponentSummary, MSComponentSummaryFetchable } from "./MSComponentSummary";
import { useQuery } from '@tanstack/react-query';
import { ErrorAlert } from "../ErrorAlert";
import { tanQueries } from "../../queries";
import { MSErrorBoundary } from "../ErrorBoundary";
import { useLocalStorage } from 'usehooks-ts'
import { TextMuted } from "../TextMuted";

export interface ComponentListProps {
    components: ComponentsApiJson[]
    fetchable?: boolean
}

const gridColumns = (columns: number): ComponentProps<typeof Box>['gridTemplateColumns'] => ({
    mdDown: "repeat(1, minmax(295px, 1fr))",
    xlDown: `repeat(${columns > 1 ? 2 : 1}, minmax(295px, 1fr))`,
    //xlTo2xl: "repeat(3, minmax(295px, 1fr))",
    base: `repeat(${columns}, minmax(295px, 1fr))`
})

export const MSComponentList = (props: ComponentListProps) => {
    const [value, setValue] = useLocalStorage('pref-component-columns', 0)
    const [shownType, setShownType] = useState("All");
    const gc = useMemo(() => gridColumns(value),[value]);
    return (
        <Container boxSize="full" p="0" maxWidth={value === 1 ? '4xl' : '8xl'}>
            <Stack gap="3">
                <Flex justify="space-between" alignItems="end" mdDown={{alignItems: 'center', justifyContent: 'center'}}>
                    <SegmentGroup.Root value={shownType} onValueChange={(val) => setShownType(val.value)}>
                        <SegmentGroup.Indicator />
                        <SegmentGroup.Items items={["All", "Sources", "Clients"]} />
                    </SegmentGroup.Root>
                <Box hideBelow="md">
                    <Field.Root>
                        <Field.Label><TextMuted>Grid Max Width</TextMuted></Field.Label>
                        <SegmentGroup.Root value={value.toString()} onValueChange={(val) => setValue(Number.parseInt(val.value))}>
                                <SegmentGroup.Indicator />
                                    <SegmentGroup.Item key="list" value="1">
                                    <SegmentGroup.ItemText>1</SegmentGroup.ItemText>
                                    <SegmentGroup.ItemHiddenInput />
                                </SegmentGroup.Item>
                                <SegmentGroup.Indicator />
                                    <SegmentGroup.Item key="2" value="2">
                                    <SegmentGroup.ItemText>2</SegmentGroup.ItemText>
                                    <SegmentGroup.ItemHiddenInput />
                                </SegmentGroup.Item>
                                <SegmentGroup.Indicator />
                                    <SegmentGroup.Item key="3" value="3">
                                    <SegmentGroup.ItemText>3</SegmentGroup.ItemText>
                                    <SegmentGroup.ItemHiddenInput />
                                </SegmentGroup.Item>
                            </SegmentGroup.Root>
                    </Field.Root>
                </Box>
                </Flex>
                <Box gridColumnGap="2" gridRowGap="2" display="grid" gridTemplateColumns={gc}>
                    {props.components.filter(x => {
                        if (shownType === 'All') {
                            return true;
                        }
                        if (shownType === 'Sources') {
                            return x.mode === 'source';
                        }
                        return x.mode === 'client';
                    }).map(x => props.fetchable ? <MSErrorBoundary><MSComponentSummaryFetchable key={x.id} componentId={x.id} data={x}/></MSErrorBoundary> : <MSComponentSummary data={x} key={x.uid} />)}
                </Box>
            </Stack>
        </Container>
    )
}

export const MSComponentListFetchable = () => {
    const { isPending, isError, data, error } = useQuery({
        ...tanQueries.components.list()
    });

    if(isPending) {
        return (<Card.Root variant="subtle">
            <Card.Header>
                <SkeletonText noOfLines={2}/>
            </Card.Header>
            <Card.Footer/>
        </Card.Root>)
    }

    if(isError) {
        return <ErrorAlert error={error}/>
    }

    return <MSComponentList fetchable components={data}/>
}