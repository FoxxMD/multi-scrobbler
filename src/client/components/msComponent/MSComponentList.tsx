import React, { ComponentProps, useMemo, useState, forwardRef, Fragment } from "react"
import { Stack, SegmentGroup, Text, Box, Center, Card, SkeletonText } from '@chakra-ui/react';
import { ComponentsApiJson } from "../../../core/Api";
import { MSComponentSummary } from "./MSComponentSummary";
import { QueryFunctionContext, queryOptions, useQuery } from '@tanstack/react-query';
import ky from 'ky';
import { baseUrl } from "../../utils";
import { ErrorAlert } from "../ErrorAlert";

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

export const MSComponentListFetchable = () => {
    const { isPending, isError, data, error } = useQuery({
        queryKey: ['components'],
        queryFn: queryFn
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

    return <MSComponentList components={data}/>
}

type ComponentListQueryKey = ['components'];
const queryFn = async (context: QueryFunctionContext<ComponentListQueryKey>) => {
    return await ky.get(`components`, { baseUrl: baseUrl }).json() as ComponentsApiJson[];
}