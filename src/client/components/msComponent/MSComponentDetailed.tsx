import React, { ComponentProps, useMemo, forwardRef, Fragment, useEffect, useState, useCallback } from "react"
import { DataList, Badge, Grid, Spacer, ButtonGroup, Button, GridItem, Text, Box, Heading, Skeleton, Wrap, Stat, Separator, HStack, Stack, Flex, Collapsible, Card, LinkOverlay, LinkBox, SkeletonText } from '@chakra-ui/react';
import { COMPONENT_STATE, ComponentClientApiJson, ComponentCommonApiJson, ComponentsApiJson, ComponentSourceApiJson, componentStateToFriendly, isComponentClientApiJson, isComponentSourceApiJson, MsSseEvent, MsSseEventPayload } from "../../../core/Api.js";
import { TextMuted } from "../TextMuted.js";
import { isClientType } from "../../../backend/common/infrastructure/Atomic.js";
import { capitalize } from "../../../core/StringUtils.js";
import { ShortDateDisplay } from "../DateDisplay.js";
import { ChevronRightButton } from "../icons/ChakraIcons.js";
import { ChakraPlayer, ChakraPlayerFetchable, PlayersContainer } from "../chakraPlayer/Player.js";
import { InfoTip } from "../ToggleTip.js";
import { QueryFunctionContext, queryOptions, useQuery, useQueryClient } from '@tanstack/react-query';
import { ErrorAlert } from "../ErrorAlert";
import ky from 'ky';
import { baseUrl } from "../../utils";
import { useTimeout } from 'react-use-timeout';
import {
    useSSEContext,
    useSSEEvent,
    useSSEAnyEvent
} from "@flamefrontend/sse-runtime-react";
import { SourcePlayerJson } from "../../../core/Atomic.js";
import { CountLiveIndicator, DateIndicator, DeadLetterIndicator, QueuedIndicator } from "./Stats.js";
import { ListContainerFetchable, PlayListSkeleton } from "../playActivity/PlayList.js";
import { useParams } from "react-router-dom";
import { ComponentStateBadge } from "../Badges.js";

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
    return (
        <Flex direction="column" gap="6">
            <Flex justifyContent="flex-end" rowGap="6" wrap="wrap">
                <Box marginEnd="auto"><MSComponentHeading data={props.data} /></Box>
                <Stack alignItems="flex-end">
                <ComponentStateBadge size="lg" maxWidth="fit-content" data={props.data} />
                <Text>{props.data.status}</Text>
                </Stack>
            </Flex>
            <Flex justifyContent="flex-end" rowGap="6" flexDirection="row-reverse" wrap="wrap">
                <Card.Root bgColor="bg.subtle" size="sm">
                <Card.Header>Actions</Card.Header>
                <Card.Body>
                    <ComponentSettings/>
                    </Card.Body>
                    </Card.Root>
                <Box marginEnd="auto"><MSComponentStats {...props}/></Box>
            </Flex>
            <PlayersContainer data={props.data} live={props.live}/>
            <ListContainerFetchable render="virtDynamic" componentType={props.data.mode} componentId={props.data.id}/>
        </Flex>
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
            <PlayListSkeleton/>
        </Flex>
    )
}

export const ComponentDetailedFetchable = (props: {componentId: number}) => {
  const { isPending, isError, data, error } = useQuery({
    queryKey: ['components', props.componentId],
    queryFn: queryFn
  });

  let rendered;
  if (isPending && data === undefined) {
    rendered = <ComponentDetailedSkeleton/>
  } else if (isError) {
    rendered = <ErrorAlert error={error} />
  } else {
    rendered = <ComponentDetailedDesktop data={data} live/>;
  }

  return rendered;
}

type ComponentDetailedQueryKey = ['components', number];
const queryFn = async (context: QueryFunctionContext<ComponentDetailedQueryKey>) => {
    return await ky.get(`components/${context.queryKey[1]}`, {
       baseUrl: baseUrl,
      }).json<ComponentsApiJson>();
}

export const ComponentDetailedRoutable = () => {
  const params = useParams();
  if(params.componentId === undefined) {
    return <ErrorAlert error={{message: 'Component is on a route with :componentId, cannot rendering anything!'}} />
  }

  return <ComponentDetailedFetchable componentId={Number.parseInt(params.componentId)}/>
}