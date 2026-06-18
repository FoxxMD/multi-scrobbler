import React, { ComponentProps, useState, Fragment } from "react"
import { Accordion, For, Span, Stack, Text, Box, AbsoluteCenter, Button, Separator, HStack, Flex, Badge, IconButton, Container, Icon, useAccordionItemContext, Skeleton } from '@chakra-ui/react';
import { ErrorLike, PlayActivity } from "../../core/Atomic";
import { PlayData } from "./PlayData";
import { ErrorAlert } from "./ErrorAlert";
import { AiOutlineExclamationCircle } from "react-icons/ai";
import { ActivityTimeline } from "./ActivityTimeline";
import { ExpandCollapse } from "./ExpandCollapse";
import { PlayApiCommon, PlayApiCommonDetailed } from "../../core/Api";
import { QueryFunctionContext, queryOptions, useQuery } from '@tanstack/react-query';
import ky from 'ky';
import { baseUrl } from "../utils";

export interface ActivityDetailProps {
    activity: PlayApiCommonDetailed
    componentType: 'source' | 'client'
}

export const ActivityDetails = (props: ActivityDetailProps) => {
    const {
        activity,
        componentType,
        activity: {
            error,
            input: {
                play: original,
            }
        }
    } = props;

    console.log(`Rendering ActivityDetails for ${activity.play.data.track}`);

    const ExpandCollapseContext = () => {
        const item = useAccordionItemContext();
        return <ExpandCollapse hideBelow="sm" display={useAccordionItemContext()?.expanded ? 'flex' : 'none'} onClick={(val) => setCollapsibleOpen(val)} />
    }

    const [collapsibleOpen, setCollapsibleOpen] = useState(undefined);

    return (
        <Box>
        <Accordion.Root variant="enclosed" collapsible multiple>
            <Accordion.Item value="info">
                <Accordion.ItemTrigger>
                    <Accordion.ItemIndicator />
                    Play Data
                </Accordion.ItemTrigger>
                <Accordion.ItemContent>
                    <Accordion.ItemBody>
                        <PlayData play={original ?? activity.play} final={activity.play} />
                    </Accordion.ItemBody>
                </Accordion.ItemContent>
            </Accordion.Item>
            <Accordion.Item value="timeline">
                <Flex justify="flex-start">
                    <Accordion.ItemTrigger>
                        <Accordion.ItemIndicator />
                        Timeline  {error !== undefined ? (<Icon size="sm" color="red.focusRing">
                            <AiOutlineExclamationCircle />
                        </Icon>) : null}
                    </Accordion.ItemTrigger>
                    <Stack style={{
                        paddingBlock: "var(--accordion-padding-y)",
                        paddingInline: "var(--accordion-padding-x)"
                    }} justify="flex-start" alignItems="flex-end">
                    </Stack>
                    <ExpandCollapseContext/>
                </Flex>
                <Accordion.ItemContent>
                    <Accordion.ItemBody>
                        <ActivityTimeline activity={activity} collapsibleOpen={collapsibleOpen} componentType={componentType} />
                    </Accordion.ItemBody>
                </Accordion.ItemContent>
            </Accordion.Item>
        </Accordion.Root>
        {error !== undefined ? <ErrorAlert error={error} /> : null}
        </Box>
    )
}

export interface ActivityDetailFetchableProps {
    uid: string
    componentType: 'source' | 'client'
}

export const ActivityDetailFetchable = (props: ActivityDetailFetchableProps) => {
    const { isPending, isError, data, error } = useQuery({
        queryKey: ['plays', props.uid],
        queryFn: queryFn
    });

    if(isPending) {
        return <Fragment><Skeleton height="100px"/><Skeleton height="100px"/></Fragment>
    }

    if(isError) {
        return <ErrorAlert error={error}/>
    }

    return <ActivityDetails componentType={props.componentType} key={data?.uid} activity={data}/>
}

type PlayQueryKey = ['plays', string];
const queryFn = async (context: QueryFunctionContext<PlayQueryKey>) => {
    return await ky.get(`plays/${context.queryKey[1]}`, { baseUrl }).json() as PlayApiCommonDetailed;
}