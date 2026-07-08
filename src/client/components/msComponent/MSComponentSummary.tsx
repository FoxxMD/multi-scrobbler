import React, { type ComponentProps, useMemo, forwardRef, Fragment, useEffect, useState, useCallback } from "react"
import { Accordion, For, Span, Stack, Stat, Text, Box, Heading, AbsoluteCenter, Button, Separator, HStack, Flex, Badge, IconButton, Container, Collapsible, Card,  LinkOverlay, LinkBox } from '@chakra-ui/react';
import { COMPONENT_STATE, type ComponentClientApiJson, type ComponentCommonApi, type ComponentCommonApiJson, type ComponentSourceApiJson, componentStateToFriendly, isComponentClientApiJson, isComponentSourceApiJson, type MsSseEvent, type MsSseEventPayload } from "../../../core/Api.js";
import { Link } from "react-router";
import { TextMuted } from "../TextMuted.js";
import { isClientType } from "../../../backend/common/infrastructure/Atomic.js";
import { capitalize } from "../../../core/StringUtils.js";
import { ChevronRightButton, IdleIcon } from "../icons/ChakraIcons.js";
import { PlayersContainer, PlayersContainerFetchable } from "../chakraPlayer/Player.js";
import { type QueryFunctionContext, useQuery, useQueryClient } from '@tanstack/react-query';
import { ErrorAlert } from "../ErrorAlert";
import {
  useSSEContext,
  useSSEEvent,
  useSSEAnyEvent
} from "@flamefrontend/sse-runtime-react";
import { CountLiveIndicator, DeadLetterIndicator, QueuedIndicator } from "./Stats.js";
import { ComponentStateBadge } from "../Badges.js";
import { MSErrorBoundary } from "../ErrorBoundary.js";

const presentPlayersContainerProps: ComponentProps<typeof Stack> = {
//paddingTop: '2',
//borderTopWidth: '1px'
};

export const MSComponentSummary = (props: { data: ComponentCommonApiJson, fetchable?: boolean }) => {
        const {
        data,
        fetchable
    } = props;
    let sleepingRender: React.JSX.Element = null;

    let body = <Card.Footer/>;
    let cardHeaderProps: Card.HeaderProps = {};
    const isClient = isComponentClientApiJson(data);
    if(isComponentSourceApiJson(data)) {
        const {
            sleeping
        } = data;
        if(sleeping) {
           sleepingRender = <IdleIcon animated/>;
        }
    }
    body = (<Card.Body px="3" py="2" paddingTop="3">
        {fetchable ? <PlayersContainerFetchable data={data} nowPlaying={isClient} stack={presentPlayersContainerProps}/> : <PlayersContainer data={data} nowPlaying={isClient} live={fetchable} stack={presentPlayersContainerProps}/>}
    </Card.Body>);

    return (
    <MSErrorBoundary>
    <Card.Root variant="subtle">
        <LinkBox>
        <Card.Header {...cardHeaderProps}>
            <Flex justify="space-between">
                <Heading>{data.name}</Heading>
                <Stack justify="flex-start" alignItems="flex-end">
                    <HStack gap="2">
                    {sleepingRender}
                    <ComponentStateBadge maxWidth="fit-content" componentId={props.data.id} live data={props.data} />
                    <Separator orientation="vertical" height="4" />
                    <LinkOverlay asChild>
                    <Link to={`components/${props.data.id}`}>
                    <ChevronRightButton variant="ghost" size="xs"/>
                    </Link>
                    </LinkOverlay>
                    </HStack>
                    {/* <Text textStyle="sm" textAlign="end">{props.data.status}</Text> */}
                </Stack>
            </Flex>
            <TextMuted textStyle="md">{capitalize(data.type)} <Badge color={data.mode === 'client' ? 'var(--chakra-colors-purple-fg)' : 'var(--chakra-colors-pink-fg)'} size="sm" variant="outline">{capitalize(data.mode)}</Badge></TextMuted>
            <QuickStatsSource data={data} streamable={props.fetchable} />
        </Card.Header>
        </LinkBox>
        <MSErrorBoundary>{body}</MSErrorBoundary>
    </Card.Root>
    </MSErrorBoundary>)
}

//colorPalette={data.mode === 'client' ? 'purple' : 'pink'}
// color={data.mode === 'client' ? 'purple' : 'pink'}

const QuickStatsSource = (props: { data: ComponentCommonApiJson, streamable?: boolean }) => {
    if (isComponentSourceApiJson(props.data)) {
        const {
            tracksDiscovered,
            countLive
        } = props.data;
        return (
            <Fragment>
                <HStack gap="2">
                {/* <TextMuted textStyle="sm">{tracksDiscovered} Discovered</TextMuted> */}
                <CountLiveIndicator data={props.data} streamable={props.streamable} as="text"/>
                </HStack>
            </Fragment>
        )
    } else if (isComponentClientApiJson(props.data)) {
        const {
            queued,
            deadLetterScrobbles,
            deadLetterScrobblesTotal,
            countLive,
        } = props.data;

        return (
            <Fragment>
                <HStack gap="2">
                <QueuedIndicator data={props.data} streamable={props.streamable} as="text"/>
                <Separator orientation="vertical" height="4" />
                <DeadLetterIndicator data={props.data} streamable={props.streamable} as="text"/>
                <HStack gap="2" hideBelow="sm">
                <Separator orientation="vertical" height="4" />
                <CountLiveIndicator data={props.data} streamable={props.streamable} as="text"/>
                </HStack>
                </HStack>
            </Fragment>
        )
    }
}

export const MSComponentSummaryFetchable = (props: {componentId: number, data: ComponentCommonApiJson}) => {
    const {
        componentId,
        data: initData
    } = props;
    const queryClient = useQueryClient();
    const qKey = ['components', componentId, 'summary'];
    useEffect(() => {
        if (initData !== undefined && queryClient.getQueryData(qKey) === undefined) {
            queryClient.setQueryData(['components', componentId, 'summary'], initData);
        }
    }, [initData]);

    const client = useSSEContext<MsSseEvent>();
    useSSEAnyEvent(client, (payload) => {
        if('componentId' in (payload.data as object) && (payload.data as Record<string, any>).componentId === componentId) {
            switch(payload.type) {
                case 'componentUpdate':
                    queryClient.setQueryData(['components', componentId, 'summary'], (old: ComponentCommonApiJson) => {
                        const componentData = payload.data as MsSseEventPayload<Partial<ComponentCommonApiJson>>;
                            return {...old, ...componentData.data};
                    });
            }
        }
    });

    const { isPending, isError, data, error } = useQuery({
        queryKey: ['components', componentId, 'summary'],
        queryFn: queryFn,
        structuralSharing: false,
        staleTime: Infinity,
    });

    if (isError) {
        return <ErrorAlert error={error} />
    }

    if(!isPending) {
        return <MSComponentSummary data={data} fetchable/>
    }
}

type ComponentSummaryQueryKey = ['components', number, 'summary'];
const queryFn = async (context: QueryFunctionContext<ComponentSummaryQueryKey>) => {
    return {} as ComponentCommonApiJson;
}