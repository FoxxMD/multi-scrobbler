import { Accordion, Alert, Box, Code, Collapsible, Flex, HStack, Separator, Skeleton, SkeletonText, Span, Stack, useAccordionItemContext, type BadgeProps } from '@chakra-ui/react';
import { useSSEContext, useSSEEvent } from "@flamefrontend/sse-runtime-react";
import { useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import React, { Fragment, useEffect, useState } from "react";
import { LuChevronRight } from "react-icons/lu";
import type { MarkOptional } from "ts-essentials";
import type { MsSseEvent, PaginatedResponse, PlayApiCommonDetailed, QueryPlaysOptsJson, SortPlaysByProps } from "../../core/Api";
import { CLIENT_DEAD_QUEUE, type ComponentType, type Second } from "../../core/Atomic";
import { tanQueries } from "../queries";
import { activityTimelineHasIssue } from "../utils/ComponentUtils";
import { ActivityTimeline } from "./ActivityTimeline";
import { EphemeralElement, PlayStateBadge } from "./Badges";
import { ShortDateDisplay } from "./DateDisplay";
import { ErrorAlert } from "./ErrorAlert";
import { ExpandCollapse } from "./ExpandCollapse";
import { DebugCopy, ExclamationCircleIcon, ExclamationTriangleIcon, InsertedIcon, RetryButton, UpdatedIcon } from "./icons/ChakraIcons";
import { PlayData } from "./PlayData";
import { TextMuted } from "./TextMuted";

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
        // structuralSharing(oldData: PlayApiCommonDetailed, newData: PlayApiCommonDetailed) {
        //     if(oldData !== undefined) {
        //         console.debug(`Merging new data for Activity ${activityUid} in Component ${componentId}`);
        //         return {...newData, isUpdated: true, updatedAt: dayjs().toISOString()};
        //     }
        //     return newData;
        // },
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
    activity: PlayApiCommonDetailed & {isNew?: boolean | Second}
    componentType: ComponentType
}

export const ActivitySummary = (props: ActivitySummaryProps) => {
    const {
        activity: {
            play,
            isNew,
            updatedAt
        } = {},
        activity,
        sortBy
    } = props;
    const [updated, setUpdated] = useState<{lastUpdated: string, updated: boolean}>({lastUpdated: updatedAt, updated: false});
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setUpdated((old) => {
            if(old.lastUpdated === activity.updatedAt) {
                return {lastUpdated: activity.updatedAt, updated: false};
            }
            return {lastUpdated: activity.updatedAt, updated: true};
        });
    },[setUpdated, activity]);
    let ephemeralStatus: React.JSX.Element | undefined;
    if(isNew) {
        ephemeralStatus = <EphemeralElement key={updatedAt ?? 'now'} expires={isNew}><InsertedIcon size="xl" /></EphemeralElement>;
    } else if(updated.updated) {
        ephemeralStatus = <EphemeralElement key={updatedAt ?? 'now'} expires={true}><UpdatedIcon colorPalette="green" color="colorPalette.focusRing" size="sm" /></EphemeralElement>;
    }
    return (
        <Flex direction="column" width="100%" truncate rowGap="0.5">
            <Flex width="100%" truncate>
                <Span truncate marginEnd="auto"><HStack>{play.data.track}{ephemeralStatus}</HStack></Span>
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

export const ActivityErrorSummary = (props: {activity: ActivityDetailProps['activity']}) => {
        const {
        activity: {
            queueStates = [],
            play: {
                lifecycle = [],
                scrobble,
            } = {},
            error,
        }
    } = props;
    if(error !== undefined && error !== null) {
        return <ErrorAlert error={error} />;
    }
    const lifecycleError = lifecycle.find(x => x.error !== undefined && x.error !== null && Object.keys(x.error).length > 0);
    if(lifecycleError !== undefined) {
        return (
        <Alert.Root status="error">
            <Alert.Indicator />
            <Alert.Content>
                <Alert.Title>Error occurred during Play Transform in <Span color="fg.muted">Stage </Span>{lifecycleError.stageType}-{lifecycleError.stageName}<Span color="fg.muted"> in Hook </Span>{lifecycleError.hook} <Span color="fg.muted">from</Span> {lifecycleError.source}</Alert.Title>
                <Alert.Description>
                    <Stack gap="0.5">
                        <Code width="fit-content" my="2" variant="surface">{lifecycleError.error.message}</Code>                        
                        <Box>Open the <strong>Timeline</strong> to find the error specifics.</Box>
                    </Stack>                    
                </Alert.Description>
            </Alert.Content>
        </Alert.Root>
        );
    }
    if(scrobble?.error !== undefined) {
        return (
        <Alert.Root status="error">
            <Alert.Indicator />
            <Alert.Content>
                <Alert.Title>Error occurred during while trying to scrobble</Alert.Title>
                <Alert.Description>
                    <Stack gap="0.5">
                        <Code width="fit-content" my="2" variant="surface">{scrobble.error.message}</Code>                        
                        <Box>Open the <strong>Timeline</strong> to find the error specifics.</Box>
                    </Stack>  
                </Alert.Description>
            </Alert.Content>
        </Alert.Root>
        );
    }
    if(scrobble?.warnings !== undefined) {
        return (
        <Alert.Root status="warning">
            <Alert.Indicator />
            <Alert.Content>
                <Alert.Title>There were warnings while scrobbling</Alert.Title>
                <Alert.Description>
                    <Stack gap="0.5">
                        <Box>Open the <strong>Timeline</strong> to find warning specifics.</Box>
                    </Stack>  
                </Alert.Description>
            </Alert.Content>
        </Alert.Root>
        )
    }
    return null;
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

    let timelineStatusIcon: React.JSX.Element | undefined;
    const timelineIssue = activityTimelineHasIssue(activity);
    if(timelineIssue === 'error') {
        timelineStatusIcon = <ExclamationCircleIcon size="sm" color="red.focusRing"/>;
    } else if(timelineIssue === 'warn') {
        timelineStatusIcon = <ExclamationTriangleIcon size="sm" color="yellow.focusRing"/>;
    }

    return (
        <Stack gap="2">
        {/* <ActivityErrorSummary activity={props.activity}/> */}
        {error !== undefined && error !== null ? <ErrorAlert error={error}/> : null}
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
                        Timeline  {timelineStatusIcon}
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

    return <ActivityDetails componentType={props.componentType} key={props.uid} activity={activity}/>
}

export const ActivityStateActions = (props: {activity: PlayApiCommonDetailed}) => {
    let suffix: React.JSX.Element | null;
    const badgeProps: BadgeProps = {};
    const {
        activity: {
            queueStates = []
        } = {}
    } = props;
    if(props.activity.state === 'failed') {
        suffix = <RetryButton size="xs" margin="1px" variant="subtle"/>;
        badgeProps.paddingRight = 0;
    }
    const hasDeadQueue = queueStates.some(x => x.queueName === CLIENT_DEAD_QUEUE && x.queueStatus === 'queued');
    return (
        <Stack>
            <HStack>
                <PlayStateBadge {...badgeProps} minH="32px" alignItems="anchor-center" size="lg" hasDeadQueue={hasDeadQueue} state={props.activity.state} suffix={suffix} />
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