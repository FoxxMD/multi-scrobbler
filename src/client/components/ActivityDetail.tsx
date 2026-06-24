import React, { ComponentProps, useState, Fragment } from "react"
import { Accordion, For, Span, Stack, Text, Box, AbsoluteCenter, Button, Separator, HStack, Flex, Badge, IconButton, Container, Icon, useAccordionItemContext, Skeleton, SkeletonText, Collapsible } from '@chakra-ui/react';
import { ComponentType, Second } from "../../core/Atomic";
import { PlayData } from "./PlayData";
import { ErrorAlert } from "./ErrorAlert";
import { AiOutlineExclamationCircle } from "react-icons/ai";
import { ActivityTimeline } from "./ActivityTimeline";
import { ExpandCollapse } from "./ExpandCollapse";
import { MsSseEvent, PlayApiCommon, PlayApiCommonDetailed, SortPlaysBy, SortPlaysByProps } from "../../core/Api";
import { InfiniteData, QueryFunctionContext, queryOptions, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import ky from 'ky';
import { baseUrl } from "../utils";
import { ShortDateDisplay } from "./DateDisplay";
import { TextMuted } from "./TextMuted";
import { VscDebugRestart } from "react-icons/vsc";
import { NewBadge, PlayStateBadge } from "./Badges";
import { MarkOptional } from "ts-essentials";
import { QueryPlaysOpts, QueryPlaysOptsJson } from "../../backend/common/database/drizzle/repositories/PlayRepository";
import { tanQueries } from "../queries";
import { PaginatedResponse } from "../../backend/common/database/drizzle/repositories/BaseRepository";
import { LuChevronRight } from "react-icons/lu";
import { useSSEContext, useSSEEvent } from "@flamefrontend/sse-runtime-react";

export interface ActivityDetailProps {
    activity: PlayApiCommonDetailed
    componentType: ComponentType
}

export interface ActivitySummaryProps extends SortPlaysByProps {
    activity: PlayApiCommon & {isNew?: boolean | Second}
    componentType: ComponentType
}

export const ActivitySummary = (props: ActivitySummaryProps) => {
    const {
        activity: {
            play,
            isNew
        } = {},
        activity,
        sortBy
    } = props;
    return (
        <Flex direction="column" width="100%" truncate rowGap="0.5">
            <Flex width="100%" truncate>
                <Span truncate marginEnd="auto">{play.data.track}{isNew !== undefined ? <NewBadge marginLeft="2" expires={typeof isNew === 'boolean' ? undefined : isNew}/> : null}</Span>
                <PlayStateBadge state={activity.state} />
            </Flex>
            <TextMuted textAlign="left" truncate>{play.data.artists.map(x => x.name).join(' / ')}</TextMuted>
            <HStack gap="1">
                <ShortDateDisplay date={sortBy === 'played' ? play.data.playDate : play.meta?.seenAt} prefix={sortBy === 'played' ? 'Played' : 'Seen'} /><Separator orientation="vertical" height="4" />
                <TextMuted>{play.meta?.source}</TextMuted>
            </HStack>
        </Flex>
    );
}

export const ActivitySummaryFetchable = (props: MarkOptional<ActivitySummaryProps, 'activity'> & { componentId: number, activityUid: string, query: QueryPlaysOptsJson}) => {
        const queryClient = useQueryClient();
        const { isPending, isError, data, error } = useSuspenseQuery({
        ...tanQueries.activities.single(props.componentId, props.activityUid),
        staleTime: Infinity,
        initialData: () => {
            const data = queryClient.getQueryData(tanQueries.activities.list(props.componentId, props.query).queryKey) as InfiniteData<PaginatedResponse<PlayApiCommonDetailed>> | undefined;
            if(data !== undefined) {
                for(const p of data.pages) {
                    const res = p.data.find(x => x.uid === props.activityUid);
                    if(res !== undefined) {
                        return res;
                    }
                }
                return undefined;
            }
        }
    });

    const client = useSSEContext<MsSseEvent>();
    useSSEEvent(client, 'playUpdate', (payload) => {
        if(payload.componentId === props.componentId && payload.data.uid === props.activityUid) {
            queryClient.invalidateQueries({
                queryKey: tanQueries.activities.single(props.componentId, props.activityUid).queryKey,
                refetchType: "all"
            });
        }
    });

    if(isError) {
        return <ErrorAlert error={error}/>
    }

    return <ActivitySummary {...props} activity={data}/>
}

export const ActivityDetails = (props: ActivityDetailProps) => {
    const {
        activity,
        componentType,
        activity: {
            error,
            input: {
                play: original,
            } = {}
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
                        Timeline  {error !== undefined && error !== null ? (<Icon size="sm" color="red.focusRing">
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
        {error !== undefined && error !== null ? <ErrorAlert error={error} /> : null}
        </Box>
    )
}

export interface ActivityDetailFetchableProps {
    uid: string
    componentId: number
    componentType: ComponentType
    query: QueryPlaysOptsJson
}

export const ActivityDetailFetchable = (props: ActivityDetailFetchableProps) => {
    const { isPending, isError, data, error } = useQuery({
        ...tanQueries.activities.single(props.componentId, props.uid)
    });

    const queryClient = useQueryClient();
    const client = useSSEContext<MsSseEvent>();
    useSSEEvent(client, 'playUpdate', (payload) => {
        if(payload.componentId === props.componentId && payload.data.uid === props.uid) {
            queryClient.invalidateQueries({
                queryKey: tanQueries.activities.single(props.componentId, props.uid).queryKey
            });
        }
    });

    if(isPending) {
        return <Fragment><Skeleton height="100px"/><Skeleton height="100px"/></Fragment>
    }

    if(isError) {
        return <ErrorAlert error={error}/>
    }

    return <ActivityDetails componentType={props.componentType} key={data?.uid} activity={data}/>
}

export const ActivityCollapsible = (props: ActivitySummaryProps & { key?: string, live?: boolean, componentId: number, query: QueryPlaysOptsJson }) => {
    const {
        activity: {
            play
        } = {},
        activity,
        sortBy,
        live = false
    } = props;
    return (
        <Collapsible.Root key={props.key} unmountOnExit

            lazyMount
            _open={{
                background: "var(--chakra-colors-bg-subtle)"
            }}
            style={{
                borderColor: "var(--chakra-colors-border)",
                borderWidth: '1px',
            }}
        >
                <Collapsible.Trigger
                    userSelect="text"
                    w="full"
                    paddingY="3"
                    display="flex"
                    gap="2"
                    alignItems="center"
                    truncate cursor="pointer"
                    style={{
                        paddingBlock: "var(--chakra-spacing-2)",
                        paddingInline: "var(--chakra-spacing-4)"
                    }}
                >
                    <Collapsible.Indicator
                        transition="transform 0.2s"
                        _open={{ transform: "rotate(90deg)" }}
                    >
                        <LuChevronRight />
                    </Collapsible.Indicator>
                    {live ? <ActivitySummaryFetchable activityUid={activity.uid} {...props} /> : <ActivitySummary componentType={props.componentType} activity={activity} sortBy={sortBy} />}
                </Collapsible.Trigger>
            <Collapsible.Content borderTopColor="gray.border"
                style={{
                    paddingBlock: "var(--chakra-spacing-4)",
                    paddingInline: "var(--chakra-spacing-4)"
                }}>
                {live ? <ActivityDetailFetchable componentId={props.componentId} componentType={props.componentType} query={props.query} uid={activity.uid} /> : <ActivityDetails  {...props} activity={activity as PlayApiCommonDetailed} />}
            </Collapsible.Content>
        </Collapsible.Root>
    )
}

export const ActivitySummarySkeleton = () => {
    return (
        <Collapsible.Root key="skeleton" disabled>
            <Collapsible.Trigger
                userSelect="text"
                w="full"
                paddingY="3"
                display="flex"
                gap="2"
                alignItems="center"
                truncate cursor="pointer"
                style={{
                    paddingBlock: "var(--chakra-spacing-2)",
                    paddingInline: "var(--chakra-spacing-4)"
                }}
            >
                <Collapsible.Indicator
                    transition="transform 0.2s"
                    _open={{ transform: "rotate(90deg)" }}
                >
                    <LuChevronRight />
                </Collapsible.Indicator>
                <Stack>
                    <Skeleton height="2rem" width="20rem" />
                    <SkeletonText noOfLines={3} />
                </Stack>
            </Collapsible.Trigger>
            <Collapsible.Content borderTopColor="gray.border"
                style={{
                    paddingBlock: "var(--chakra-spacing-4)",
                    paddingInline: "var(--chakra-spacing-4)"
                }}>
                <SkeletonText noOfLines={2} />
            </Collapsible.Content>
        </Collapsible.Root>
    );
}