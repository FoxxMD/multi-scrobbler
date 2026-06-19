import React, { ComponentProps, useMemo, forwardRef, Fragment, useEffect, useState, useCallback } from "react"
import { Accordion, For, Span, Stack, Stat, Text, Box, Heading, AbsoluteCenter, Button, Separator, HStack, Flex, Badge, IconButton, Container, Collapsible, Card,  LinkOverlay, LinkBox } from '@chakra-ui/react';
import { COMPONENT_STATE, ComponentClientApiJson, ComponentCommonApi, ComponentCommonApiJson, ComponentSourceApiJson, componentStateToFriendly, isComponentClientApiJson, isComponentSourceApiJson, MsSseEvent, MsSseEventPayload } from "../../../core/Api.js";
import { Link } from "react-router";
import { TextMuted } from "../TextMuted.js";
import { isClientType } from "../../../backend/common/infrastructure/Atomic.js";
import { capitalize } from "../../../core/StringUtils.js";
import { ShortDateDisplay } from "../DateDisplay.js";
import { ChevronRightButton, UpArrowIcon } from "../icons/ChakraIcons.js";
import { useTimeout } from 'react-use-timeout';
import { ChakraPlayer, ChakraPlayerFetchable, PlayersContainer } from "../chakraPlayer/Player.js";
import { InfoTip } from "../ToggleTip.js";
import { QueryFunctionContext, queryOptions, useQuery, useQueryClient } from '@tanstack/react-query';
import { ErrorAlert } from "../ErrorAlert";
import ky from 'ky';
import { baseUrl } from "../../utils";
import {
  useSSEContext,
  useSSEEvent,
  useSSEAnyEvent
} from "@flamefrontend/sse-runtime-react";
import { SourcePlayerJson } from "../../../core/Atomic.js";
import { CountLiveIndicator, DeadLetterIndicator, QueuedIndicator } from "./Stats.js";
import { ComponentStateBadge } from "../Badges.js";

export const MSComponentSummary = (props: { data: ComponentCommonApiJson, fetchable?: boolean }) => {
        const {
        data,
        fetchable
    } = props;
    const isClient = isClientType(data.type);

    let body = <Card.Footer/>;
    let cardHeaderProps: Card.HeaderProps = {};
    if(isComponentSourceApiJson(data)) {
        const {
            players
        } = data;
        if(Object.keys(players).length > 0) {
            cardHeaderProps.borderBottomWidth="1px";
            cardHeaderProps.paddingBottom="2";
            body = (<Card.Body px="3" py="2" paddingTop="3">
                <PlayersContainer data={data} live={fetchable}/>
            </Card.Body>);
        }
    }

    return (<Card.Root variant="subtle">
        <Card.Header {...cardHeaderProps}>
            <LinkBox>
            <Flex justify="space-between">
                <Heading>{data.name}</Heading>
                <Stack justify="flex-start" alignItems="flex-end">
                    <HStack gap="2">
                    <ComponentStateBadge maxWidth="fit-content" data={props.data} />
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
            </LinkBox>
            <TextMuted textStyle="md"><Badge colorPalette={data.mode === 'client' ? 'purple' : 'pink'} size="sm" variant="subtle">{capitalize(data.mode)}</Badge> {capitalize(data.type)}</TextMuted>
            <QuickStatsSource data={data} streamable={props.fetchable} />
        </Card.Header>
        {body}
    </Card.Root>)
}

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
                case 'playerUpdate':
                    // add new player
                    queryClient.setQueryData(['components', componentId, 'summary'], (old: ComponentSourceApiJson) => {
                        const playerPayload = payload.data as MsSseEventPayload<SourcePlayerJson>;
                        if(old.players[playerPayload.data.platformId] === undefined) {
                            let newData: ComponentSourceApiJson = {...old};
                            newData.players[playerPayload.data.platformId] = playerPayload.data;
                            return newData;
                        }
                    });
                    break;
                case 'playerDelete':
                    queryClient.setQueryData(['components', componentId, 'summary'], (old: ComponentSourceApiJson) => {
                        const playerPayload = payload.data as MsSseEventPayload<{platformId: string}>;
                        if(old.players[playerPayload.data.platformId] !== undefined) {
                            let newData: ComponentSourceApiJson = {...old};
                            delete newData.players[playerPayload.data.platformId];
                            return newData;
                        }
                    });
                    break;
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