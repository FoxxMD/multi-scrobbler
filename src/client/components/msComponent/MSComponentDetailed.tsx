import React, { ComponentProps, useMemo, forwardRef, Fragment, useEffect, useState, useCallback } from "react"
import { DataList, Badge, Grid, Spacer, Span, ButtonGroup, Button, GridItem, Text, Box, Heading, Skeleton, Wrap, Stat, Separator, HStack, Stack, Flex, Collapsible, Card, LinkOverlay, LinkBox, SkeletonText } from '@chakra-ui/react';
import { COMPONENT_STATE, ComponentClientApiJson, ComponentCommonApiJson, ComponentsApiJson, ComponentSourceApiJson, componentStateToFriendly, isComponentClientApiJson, isComponentSourceApiJson, MsSseEvent, MsSseEventPayload } from "../../../core/Api.js";
import { TextMuted } from "../TextMuted.js";
import { isClientType } from "../../../backend/common/infrastructure/Atomic.js";
import { capitalize } from "../../../core/StringUtils.js";
import { ShortDateDisplay } from "../DateDisplay.js";
import { ChevronRightButton, IdleIcon } from "../icons/ChakraIcons.js";
import { ChakraPlayer, ChakraPlayerFetchable, PlayersContainer, PlayersContainerFetchable } from "../chakraPlayer/Player.js";
import { InfoTip, ToggleTip, Tooltip } from "../ToggleTip.js";
import { QueryFunctionContext, queryOptions, useQuery, useQueryClient } from '@tanstack/react-query';
import { ErrorAlert } from "../ErrorAlert";
import {
    useSSEContext,
    useSSEEvent,
    useSSEAnyEvent
} from "@flamefrontend/sse-runtime-react";
import { isComponentTypeSource, SourcePlayerJson } from "../../../core/Atomic.js";
import { CountLiveIndicator, DateIndicator, DeadLetterIndicator, QueuedIndicator } from "./Stats.js";
import { ListContainerFetchable, ListContainerFilterable } from "../playActivity/ActivityList.js";
import { useParams } from "react-router-dom";
import { ComponentStateBadge } from "../Badges.js";
import { ActivitySummarySkeleton } from "../ActivityDetail.js";
import dayjs from "dayjs";
import { shortTodayAwareFormat } from "../../../core/TimeUtils.js";
import { durationToHuman } from "../../../backend/utils.js";
import { tanQueries } from "../../queries/index.js";
import { MSErrorBoundary } from "../ErrorBoundary.js";

export const MSComponentHeading = (props: { data?: Pick<ComponentCommonApiJson, 'name' | 'mode' | 'type'>, fetchable?: boolean }) => {
    if (props.data === undefined) {
        return (
            <Box>
                <Skeleton width="5rem" height="5rem" />
                <Skeleton width="3rem" height="1rem" />
            </Box>
        )
    }
    return (
        <Box>
            <Heading size="2xl">{props.data.name}</Heading>
            <Heading color="fg.subtle" size="lg">({props.data.mode}) {capitalize(props.data.type)}</Heading>
        </Box>
    )
}

export const MSComponentName = (props: {data?: Pick<ComponentCommonApiJson, 'name'>}) => {
    if(props.data === undefined) {
        return <Skeleton width="5rem" height="5rem" />;
    }
    return <Heading truncate size="2xl">{props.data.name}</Heading>;
}

export const MSComponentType = (props: {data?: Pick<ComponentCommonApiJson, 'mode' | 'type'>}) => {
    if(props.data === undefined) {
        return <Skeleton width="3rem" height="1rem" />;
    }
    return <Heading color="fg.subtle" size="lg">({props.data.mode}) {capitalize(props.data.type)}</Heading>;
}

export const MSComponentStats = (props: { data?: ComponentCommonApiJson, live?: boolean }) => {
    if (props.data === undefined) {
        return (
            <Box>
                <SkeletonText noOfLines={6} />
            </Box>
        )
    }
    const isClient = isComponentClientApiJson(props.data);
    return (
        <Wrap gap="6" rowGap="5" justify="flex-start" flexGrow="0">
            <CountLiveIndicator data={props.data} streamable={props.live} flexGrow="0"/>
            {isClient ? <QueuedIndicator data={props.data as ComponentClientApiJson} streamable={props.live} flexGrow="0"/> : null}
            {isClient ? <DeadLetterIndicator data={props.data as ComponentClientApiJson} streamable={props.live} flexGrow="0"/> : null}
            <DateIndicator data={props.data} streamable={props.live} flexGrow="0"/>
        </Wrap>
    )
}

const ComponentSettings = () => {
    return (
        <Stack>
            <ButtonGroup size="sm" variant="surface" attached>
                <Button disabled colorPalette="green">Start</Button>
                <Button disabled colorPalette="yellow">Mute</Button>
                <Button disabled colorPalette="red">Stop</Button>
            </ButtonGroup>
        </Stack>
    )
}

export const ComponentDetailedDesktop = (props: {data?: ComponentCommonApiJson, live?: boolean}) => {
    let sleepingRender: React.JSX.Element = null;
    const {data} = props;
    if(isComponentSourceApiJson(data)) {
        const {
            sleeping,
            wakeAt
        } = data;
        if(sleeping) {
            if(sleeping && wakeAt !== undefined) {
                const wakeDay = dayjs(wakeAt);
                const now = dayjs();
                sleepingRender = (
                    <Tooltip content={<Span>Will next poll Source for activity at {shortTodayAwareFormat(wakeDay)} (in {durationToHuman(dayjs.duration(wakeDay.diff(now, 'ms')))})</Span>}>
                        <IdleIcon animated cursor="pointer"/>
                    </Tooltip>
                )
            } else {
                sleepingRender = <IdleIcon/>;
            }
        }
    }
    return (
        <MSErrorBoundary>
        <Flex direction="column" width="100%" truncate rowGap="1">
            <Flex width="100%" truncate>
                <Box marginEnd="auto" truncate><MSComponentName data={props.data}/></Box>
                <ComponentStateBadge size="lg" maxWidth="fit-content" data={props.data} />
            </Flex>
            <Wrap>
                <Box marginEnd="auto">
                    <MSComponentType data={props.data}/>
                </Box>
                <HStack truncate>{sleepingRender}{props.data.status}</HStack>
            </Wrap>
            <Flex justifyContent="flex-end" rowGap="6" flexDirection="row-reverse" wrap="wrap">
                <Card.Root bgColor="bg.subtle" size="sm">
                <Card.Header>Actions</Card.Header>
                <Card.Body>
                    <ComponentSettings/>
                    </Card.Body>
                    </Card.Root>
                <Box marginEnd="auto"><MSComponentStats {...props}/></Box>
            </Flex>
            {props.live ? <PlayersContainerFetchable data={props.data}/> : <PlayersContainer data={props.data} live={props.live}/>}
            <Heading size="3xl">{isComponentTypeSource(props.data.mode) ? 'Plays' : 'Scrobbles'}</Heading>
            <ListContainerFilterable render="virtDynamic" componentType={props.data.mode} componentId={props.data.id}/>
        </Flex>
        </MSErrorBoundary>
    )
}

const ComponentDetailedSkeleton = () => {
    return (
        <Flex direction="column" gap="6">
            <Flex justifyContent="flex-end" rowGap="6" wrap="wrap">
                <Box marginEnd="auto"><SkeletonText noOfLines={2}/></Box>
                <Stack alignItems="flex-end">
                <Skeleton height="2"/>
                </Stack>
            </Flex>
            <Flex justifyContent="flex-end" rowGap="6" flexDirection="row-reverse" wrap="wrap">
                <Card.Root bgColor="bg.subtle" size="sm">
                <Card.Header>Actions</Card.Header>
                <Card.Body>
                    <Skeleton height="2"/>
                    </Card.Body>
                    </Card.Root>
                <Box marginEnd="auto"><SkeletonText noOfLines={2}/></Box>
            </Flex>
            <ActivitySummarySkeleton/>
        </Flex>
    )
}

export const ComponentDetailedFetchable = (props: { componentId: number }) => {
    const { isPending, isError, data, error } = useQuery({
        ...tanQueries.components.single(props.componentId),
    });

    let rendered;
    if (isPending && data === undefined) {
        rendered = <ComponentDetailedSkeleton />
    } else if (isError) {
        rendered = <ErrorAlert error={error} />
    } else {
        rendered = <ComponentDetailedDesktop data={data} live />;
    }

    const queryClient = useQueryClient();
    const client = useSSEContext<MsSseEvent>();
    useSSEAnyEvent(client, (payload) => {
        if ('componentId' in (payload.data as object) && (payload.data as Record<string, any>).componentId === props.componentId) {
            switch (payload.type) {
                case 'componentUpdate':
                    queryClient.setQueryData(tanQueries.components.single(props.componentId).queryKey, (old: ComponentCommonApiJson) => {
                        const componentData = payload.data as MsSseEventPayload<Partial<ComponentCommonApiJson>>;
                        return { ...old, ...componentData.data };
                    });
            }
        }
    });

    return rendered;
}

export const ComponentDetailedRoutable = () => {
  const params = useParams();
  if(params.componentId === undefined) {
    return <ErrorAlert error={{message: 'Component is on a route with :componentId, cannot rendering anything!'}} />
  }

  return <ComponentDetailedFetchable componentId={Number.parseInt(params.componentId)}/>
}