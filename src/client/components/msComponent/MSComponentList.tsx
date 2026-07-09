import { useState } from "react"
import { Stack, SegmentGroup, Center, Card, SkeletonText } from '@chakra-ui/react';
import { type ComponentsApiJson } from "../../../core/Api";
import { MSComponentSummary, MSComponentSummaryFetchable } from "./MSComponentSummary";
import { useQuery } from '@tanstack/react-query';
import { ErrorAlert } from "../ErrorAlert";
import { tanQueries } from "../../queries";
import { MSErrorBoundary } from "../ErrorBoundary";

export interface ComponentListProps {
    components: ComponentsApiJson[]
    fetchable?: boolean
}

export const MSComponentList = (props: ComponentListProps) => {
    console.log('rendering component list');
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
                }).map(x => props.fetchable ? <MSErrorBoundary><MSComponentSummaryFetchable key={x.id} componentId={x.id} data={x}/></MSErrorBoundary> : <MSComponentSummary data={x} key={x.uid} />)}
            </Stack>
        </Stack>
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