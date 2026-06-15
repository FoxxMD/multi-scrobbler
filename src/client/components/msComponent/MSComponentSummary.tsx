import React, { ComponentProps, useMemo, forwardRef, Fragment, useEffect } from "react"
import { Accordion, For, Span, Stack, Text, Box, Heading, AbsoluteCenter, Button, Separator, HStack, Flex, Badge, IconButton, Container, Collapsible, Card,  LinkOverlay, LinkBox } from '@chakra-ui/react';
import { ComponentClientApiJson, ComponentCommonApi, ComponentCommonApiJson, ComponentSourceApiJson, isComponentClientApiJson, isComponentSourceApiJson, MsSseEvent } from "../../../core/Api.js";
import { TextMuted } from "../TextMuted.js";
import { isClientType } from "../../../backend/common/infrastructure/Atomic.js";
import { capitalize } from "../../../core/StringUtils.js";
import { ShortDateDisplay } from "../DateDisplay.js";
import { ChevronRightButton } from "../icons/ChakraIcons.js";
import { ChakraPlayer, ChakraPlayerFetchable } from "../chakraPlayer/Player.js";
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
                <Stack gap="2">
                {
                    Object.entries(players).map(([key, x]) => (
                    <Container bg="bg.emphasized" borderWidth="1px" p="2" py="3" rounded="md">
                        {fetchable ? <ChakraPlayerFetchable componentId={data.id} platformId={key} data={x}/> : <ChakraPlayer data={x}/>}
                        </Container>
                        ))
                }
                </Stack>
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
                    <StateBadge maxWidth="fit-content" data={props.data} />
                    <Separator orientation="vertical" height="4" />
                    <LinkOverlay href="#">
                    <ChevronRightButton variant="ghost" size="xs"/>
                    </LinkOverlay>
                    </HStack>
                    {/* <Text textStyle="sm" textAlign="end">{props.data.status}</Text> */}
                </Stack>
            </Flex>
            </LinkBox>
            <TextMuted textStyle="md"><Badge colorPalette={data.mode === 'client' ? 'purple' : 'pink'} size="sm" variant="subtle">{capitalize(data.mode)}</Badge> {capitalize(data.type)}</TextMuted>
            <QuickStatsSource data={data} />
        </Card.Header>
        {body}
    </Card.Root>)
}

const QuickStatsSource = (props: { data: ComponentCommonApiJson }) => {
    if (isComponentSourceApiJson(props.data)) {
        const {
            tracksDiscovered,
            countLive
        } = props.data;
        return (
            <Fragment>
                <HStack gap="2">
                <TextMuted textStyle="sm">{tracksDiscovered} Discovered</TextMuted>
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
                <TextMuted textStyle="sm">{queued} Queued</TextMuted>
                <Separator orientation="vertical" height="4" />
                <TextMuted textStyle="sm">{deadLetterScrobbles} ({deadLetterScrobblesTotal}) Dead<InfoTip content="Dead scrobbles that can be automatically retried and (all) dead scrobbles, including those that have hit the retry limit."/></TextMuted>
                <HStack gap="2" hideBelow="sm">
                <Separator orientation="vertical" height="4" />
                <TextMuted textStyle="sm">{countLive} Scrobbled</TextMuted>
                </HStack>
                </HStack>
            </Fragment>
        )
    }
}

const StateBadge = (props: ComponentProps<typeof Badge> & { data: ComponentCommonApiJson }) => {

    const { data, ...rest } = props;

    let badgeColor = undefined,
        badgeText = capitalize(data.state);

    switch (data.state) {
        case 'stopped':
            badgeColor = 'gray';
            break;
        case 'running':
        case 'polling':
        case 'awaiting data':
            badgeColor = 'green';
            break;
        case 'error':
            badgeColor = 'red';
            break;
        case 'idle':
            badgeColor = 'orange';
            break;
    }

    return <Badge variant="surface" colorPalette={badgeColor} {...rest}>{badgeText}</Badge>
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
                case 'discovered':
                    queryClient.setQueryData(['components', componentId, 'summary'], (old: ComponentSourceApiJson) => {
                        return {
                            ...old,
                            tracksDiscovered: old.tracksDiscovered + 1
                        }
                    });
                    break;
                case 'scrobbleQueued':
                    queryClient.setQueryData(['components', componentId, 'summary'], (old: ComponentClientApiJson) => {
                        let newData: ComponentClientApiJson = {...old};
                        newData.queued = old.queued + 1;
                        return newData;
                    });
                    break;
                case 'scrobbleDequeued':
                    queryClient.setQueryData(['components', componentId, 'summary'], (old: ComponentClientApiJson) => {
                        let newData: ComponentClientApiJson = {...old};
                        newData.queued = old.queued - 1;
                        return newData;
                    });
                    break;  
                case 'scrobble':
                    queryClient.setQueryData(['components', componentId, 'summary'], (old: ComponentClientApiJson) => {
                        let newData: ComponentClientApiJson = {...old};
                        newData.countLive = old.countLive + 1;
                        return newData;
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