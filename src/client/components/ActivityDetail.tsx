import React, { ComponentProps, useState, Fragment } from "react"
import { Accordion, For, Span, Stack, Text, Box, AbsoluteCenter, Button, Clipboard, Separator, HStack, Flex, Badge, IconButton, Container, Icon, useAccordionItemContext, Skeleton, SkeletonText, Collapsible, BadgeProps } from '@chakra-ui/react';
import { ComponentType, Second } from "../../core/Atomic";
import { PlayData } from "./PlayData";
import { ErrorAlert } from "./ErrorAlert";
import { AiOutlineExclamationCircle } from "react-icons/ai";
import { ActivityTimeline } from "./ActivityTimeline";
import { ExpandCollapse } from "./ExpandCollapse";
import { MsSseEvent, PlayApiCommon, PlayApiCommonDetailed, SortPlaysBy, SortPlaysByProps } from "../../core/Api";
import { InfiniteData, QueryFunctionContext, QueryOptions, queryOptions, SuspenseQueriesOptions, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import ky from 'ky';
import { baseUrl } from "../utils";
import { ShortDateDisplay } from "./DateDisplay";
import { TextMuted } from "./TextMuted";
import { VscDebugRestart } from "react-icons/vsc";
import { EphemeralBadge, PlayStateBadge } from "./Badges";
import { MarkOptional } from "ts-essentials";
import { QueryPlaysOpts, QueryPlaysOptsJson } from "../../backend/common/database/drizzle/repositories/PlayRepository";
import { tanQueries } from "../queries";
import { PaginatedResponse } from "../../backend/common/database/drizzle/repositories/BaseRepository";
import { LuChevronRight } from "react-icons/lu";
import { useSSEContext, useSSEEvent } from "@flamefrontend/sse-runtime-react";
import { DebugCopy, RetryButton } from "./icons/ChakraIcons";
import dayjs from "dayjs";

type UseActivityQueryOptions = {
    msQuery?: QueryPlaysOptsJson
    activity?: ActivitySummaryProps['activity']
    refetchOnMount?: boolean | 'always'
}
export function useActivityQuery(
    componentId: number,
    activityUid: string,
    options: UseActivityQueryOptions = {}
) {
    const {
        msQuery,
        activity: preloadedActivity,
        ...rest
    } = options;
    const queryClient = useQueryClient();

    const { isPending, isError, data: activity, error } = useQuery({
        ...tanQueries.activities.single(componentId, activityUid),
        ...rest,
        staleTime: Infinity,
        initialData: () => {
            if (msQuery === undefined && preloadedActivity === undefined) {
                return undefined;
            }
            if(preloadedActivity !== undefined) {
                return preloadedActivity;
            }
            const data = queryClient.getQueryData(
                tanQueries.activities.list(componentId, msQuery).queryKey
            ) as InfiniteData<PaginatedResponse<PlayApiCommonDetailed>> | undefined;

            if (data !== undefined) {
                for (const p of data.pages) {
                    const res = p.data.find(x => x.uid === activityUid);
                    if (res !== undefined) {
                        return res;
                    }
                }
                return undefined;
            }
        },
        structuralSharing(oldData: PlayApiCommonDetailed, newData: PlayApiCommonDetailed) {
            if(oldData !== undefined) {
                console.debug(`Merging new data for Activity ${activityUid} in Component ${componentId}`);
                return {...newData, isUpdated: true, updatedAt: dayjs().toISOString()};
            }
            return newData;
        },
    });

    const client = useSSEContext<MsSseEvent>();
    useSSEEvent(client, 'playUpdate', (payload) => {
        if (payload.componentId === componentId && payload.data.uid === activityUid) {
            console.debug(`Recieved playUpdate for Activity ${activityUid} in Component ${componentId}, invalidating single query`);
            queryClient.invalidateQueries({
                queryKey: tanQueries.activities.single(componentId, activityUid).queryKey,
                refetchType: 'all'
            });
        }
    });

    return { activity, isPending, isError, error };
}
export interface ActivityDetailProps {
    activity: PlayApiCommonDetailed
    componentType: ComponentType
}

export interface ActivitySummaryProps extends SortPlaysByProps {
    activity: PlayApiCommon & {isNew?: boolean | Second, isUpdated?: boolean | Second, updatedAt?: string}
    componentType: ComponentType
}

export const ActivitySummary = (props: ActivitySummaryProps) => {
    const {
        activity: {
            play,
            isNew,
            isUpdated,
            updatedAt
        } = {},
        activity,
        sortBy
    } = props;
    let ephemeralStatus: React.JSX.Element | undefined;
    if(isUpdated || isNew) {
        const eph = isUpdated ?? isNew;
        ephemeralStatus = <EphemeralBadge key={updatedAt ?? 'now'} marginLeft="2" expires={typeof eph === 'boolean' ? undefined : eph}>{isNew !== undefined ? 'New' : 'Updated'}</EphemeralBadge>;
    }
    return (
        <Flex direction="column" width="100%" truncate rowGap="0.5">
            <Flex width="100%" truncate>
                <Span truncate marginEnd="auto">{play.data.track}{ephemeralStatus}</Span>
                {/* <PlayStateBadge state={activity.state} /> */}
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
    const {isError, error, isPending, activity} = useActivityQuery(props.componentId, props.activityUid, {activity: props.activity});

    if(isError) {
        return <ErrorAlert error={error}/>
    }

    if(activity === undefined && isPending) {
        return <ActivitySummarySkeleton/>;
    }

    return <ActivitySummary {...props} activity={activity}/>
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
        <Stack gap="2">
        {/* <Flex justifyContent="flex-end">
            <HStack>
                <RetryButton/>
                <DebugCopy value={JSON.stringify(activity)}/>
            </HStack>
        </Flex> */}
        {error !== undefined && error !== null ? <ErrorAlert error={error} /> : null}
        <Accordion.Root width="full" variant="enclosed" collapsible multiple>
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
        </Stack>
    )
}

export interface ActivityDetailFetchableProps {
    uid: string
    componentId: number
    componentType: ComponentType
    activity?: ActivitySummaryProps['activity']
}

export const ActivityDetailFetchable = (props: ActivityDetailFetchableProps) => {
    const {isError, error, isPending, activity} = useActivityQuery(props.componentId, props.uid, {activity: props.activity, refetchOnMount: 'always'});

    if(isPending) {
        return <Fragment><Skeleton height="100px"/><Skeleton height="100px"/></Fragment>
    }

    if(isError) {
        return <ErrorAlert error={error}/>
    }

    return <ActivityDetails componentType={props.componentType} key={props.uid} activity={activity as PlayApiCommonDetailed}/>
}

export const ActivityStateActions = (props: {activity: PlayApiCommon}) => {
    let suffix: React.JSX.Element | null;
    let badgeProps: BadgeProps = {};
    if(props.activity.state === 'failed') {
        suffix = <RetryButton size="xs" margin="1px" variant="subtle"/>;
        badgeProps.paddingRight = 0;
    }
    return (
        <Stack>
            <HStack>
                <PlayStateBadge {...badgeProps} minH="32px" alignItems="anchor-center" size="lg" state={props.activity.state} suffix={suffix} />
            </HStack>
            <HStack justifyContent="flex-end">
                <DebugCopy variant="ghost" value={JSON.stringify(props.activity)}/>
            </HStack>
        </Stack>
    )
}

export const ActivityStateActionsFetchable = (props: ActivityDetailFetchableProps) => {
    const {isError, error, isPending, activity} = useActivityQuery(props.componentId, props.uid, {activity: props.activity});

    if(!isPending && !isError) {
        return <ActivityStateActions activity={activity}/>;
    }
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
            <HStack                     style={{
                        paddingBlock: "var(--chakra-spacing-2)",
                        paddingInline: "var(--chakra-spacing-4)"
                    }}>
                <Collapsible.Trigger
                    userSelect="text"
                    w="full"

                    display="flex"
                    gap="2"
                    alignItems="center"
                    truncate cursor="pointer"

                >
                    <Collapsible.Indicator
                        transition="transform 0.2s"
                        _open={{ transform: "rotate(90deg)" }}
                    >
                        <LuChevronRight />
                    </Collapsible.Indicator>
                    <ActivitySummaryFetchable activityUid={activity.uid} {...props}/>
                </Collapsible.Trigger>
                <ActivityStateActionsFetchable activity={activity} componentId={props.componentId} componentType={props.componentType} uid={props.activity.uid}/>
                </HStack>
            <Collapsible.Content borderTopColor="gray.border"
                style={{
                    paddingBlock: "var(--chakra-spacing-4)",
                    paddingInline: "var(--chakra-spacing-4)"
                }}>
                <ActivityDetailFetchable componentId={props.componentId} componentType={props.componentType} uid={activity.uid} activity={activity} />
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