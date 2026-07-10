import React, { type ComponentProps } from "react"
import { Portal, Group, Span, Menu, Box, Heading, Skeleton, Wrap, HStack, Stack, Flex, Card, SkeletonText, type BadgeProps, type MenuItemProps } from '@chakra-ui/react';
import { COMPONENT_STATE, type ComponentClientApiJson, type ComponentCommonApiJson, type ComponentState, isComponentClientApiJson, isComponentSourceApiJson, type MsSseEvent, type MsSseEventPayload } from "../../../core/Api.js";
import { capitalize } from "../../../core/StringUtils.js";
import { ChevronLeftButton, EllipsisButton, EyeButton, EyeClosedIcon, EyeIcon, IdleIcon, PowerButton, PowerIcon, PowerOffButton, PowerOffIcon, RetryIcon } from "../icons/ChakraIcons.js";
import { PlayersContainer, PlayersContainerFetchable } from "../chakraPlayer/Player.js";
import { Tooltip } from "../ToggleTip.js";
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ErrorAlert } from "../ErrorAlert";
import {
    useSSEContext,
    useSSEAnyEvent
} from "@flamefrontend/sse-runtime-react";
import { isComponentTypeSource } from "../../../core/Atomic.js";
import { Link } from "react-router";
import { CountLiveIndicator, DateIndicator, DeadLetterIndicator, QueuedIndicator } from "./Stats.js";
import { ListContainerFilterable } from "../playActivity/ActivityList.js";
import { useParams } from "react-router-dom";
import { ComponentStateBadge } from "../Badges.js";
import { ActivitySummarySkeleton } from "../ActivityDetail.js";
import dayjs from "dayjs";
import { durationToHuman, shortTodayAwareFormat } from "../../../core/TimeUtils.js";
import { tanQueries } from "../../queries/index.js";
import { MSErrorBoundary } from "../ErrorBoundary.js";
import type {IconType} from "react-icons/lib";
import { useIsWrapped } from "../../utils/hooks/useIsWrapped.js";

export const ComponentBackButton = (props: ComponentProps<typeof ChevronLeftButton> = {}) => {
    return (
            <Link to={`/next`}>
                <ChevronLeftButton variant="ghost" iconProps={{style: {width: 'unset', height:  'unset', fontSize: "2em"}}} {...props} />
            </Link>
    );
}

export const MSComponentName = (props: {data?: Pick<ComponentCommonApiJson, 'name'>}) => {
    if(props.data === undefined) {
        return <HStack><ComponentBackButton/><Skeleton width="5rem" height="5rem" /></HStack>;
    }
    return <Heading truncate size="2xl"><ComponentBackButton/>{props.data.name}</Heading>;
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

const stateIsStarted = (state: ComponentState): boolean => state <= COMPONENT_STATE.MUTED;

const componentStateMenuItem = (Icon: IconType, value: string, name?: string) => (props: Pick<MenuItemProps, 'disabled'> = {}) => {
    return (<Menu.Item key={value} value={value} {...props}><Icon/><Box flex="1">{name ?? capitalize(value)}</Box></Menu.Item>);
}
const MenuItemRestart = componentStateMenuItem(RetryIcon, 'restart');
const MenuItemStop = componentStateMenuItem(PowerOffIcon, 'stop');
const MenuItemStart = componentStateMenuItem(PowerIcon, 'start');
const MenuItemMute = componentStateMenuItem(EyeClosedIcon, 'mute', 'Ignore')
const MenuItemUnmute = componentStateMenuItem(EyeIcon, 'unmute', 'Monitor');

const primaryActionProps: ComponentProps<typeof PowerOffButton> = {
    margin: "1px",
    variant: "subtle",
    size: 'xs'
}

export const ComponentStateBadgeActionable = (props: Omit<ComponentProps<typeof ComponentStateBadge>, 'suffix'>) => {
    const {
        componentId,
        live,
        ...rest
    } = props; 
    let suffix: React.JSX.Element | undefined;
    let primaryAction: React.JSX.Element | undefined;
    let menuElm: React.JSX.Element | undefined;
    let menuItems: React.JSX.Element[] = [];
    const badgeProps: BadgeProps = {};
    switch(props.data.state) {
        case COMPONENT_STATE.RUNNING:
            primaryAction = <PowerOffButton {...primaryActionProps}/>
            menuItems = [<MenuItemStop/>,<MenuItemRestart/>,<MenuItemMute/>];
            break;
        case COMPONENT_STATE.MUTED:
            primaryAction = <EyeButton {...primaryActionProps}/>;
            menuItems = [<MenuItemStop/>,<MenuItemRestart/>,<MenuItemUnmute/>];
            break;
        case COMPONENT_STATE.INITIALIZING:
            // no actions while init is occurring
            break;
        default:
            // otherwise generic start action for all non-running states
            primaryAction = <PowerButton {...primaryActionProps}/>;
            menuItems = [<MenuItemStart/>];
    }
    if(menuItems.length > 0) {
        menuElm = (
    <Menu.Root positioning={{ placement: "bottom-end" }}>
      <Group attached>
        {primaryAction}
        <Menu.Trigger asChild>
          <EllipsisButton {...primaryActionProps}/>
        </Menu.Trigger>
      </Group>
      <Portal>
        <Menu.Positioner>
          <Menu.Content>
            {menuItems}
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
        );
        suffix = menuElm;
    } else if(primaryAction !== undefined) {
        suffix = primaryAction;
    }
    if(suffix !== undefined || primaryAction !== undefined) {
        badgeProps.paddingRight = 0;
    }

    return <ComponentStateBadge size="lg" maxWidth="fit-content" {...badgeProps} separator suffix={suffix} {...rest}/>;
}

export const ComponentDetailedDesktop = (props: {data?: ComponentCommonApiJson, live?: boolean}) => {
    let sleepingRender: React.JSX.Element = null;
    const {
        data,
        data: {
            warning,
            error
        } = {}
    } = props;
    const isSource = isComponentSourceApiJson(data)
    if(isSource) {
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
    const target = React.useRef(null);
    const isWrapped = useIsWrapped(target);
    return (
        <MSErrorBoundary>
        <Flex direction="row" wrap="wrap" style={{whiteSpace: 'break-spaces'}} truncate rowGap="4">
            <Wrap width="100%" ref={target}>
                <Box marginEnd="auto" truncate>
                    <MSComponentName data={props.data}/>
                    <MSComponentType data={props.data}/>
                </Box>
                <Stack alignItems={isWrapped ? 'flex-start' : 'flex-end'}>
                    <ComponentStateBadgeActionable size="lg" maxWidth="fit-content" data={props.data} />
                    <HStack style={{whiteSpace: 'break-spaces'}}>{sleepingRender}{props.data.status}</HStack>
                </Stack>
            </Wrap>
            <Flex justifyContent="flex-end" rowGap="6" flexDirection="row-reverse" wrap="wrap">
                <Box marginEnd="auto"><MSComponentStats {...props}/></Box>
            </Flex>
            {error !== undefined && error !== null ? <ErrorAlert error={error}/> : undefined}
            {warning !== undefined && warning !== null ? <ErrorAlert error={warning} status="warning"/> : undefined}
            <MSErrorBoundary>{props.live ? <PlayersContainerFetchable nowPlaying={isSource ? undefined : true} data={props.data}/> : <PlayersContainer nowPlaying={isSource ? undefined : true} data={props.data} live={props.live}/>}</MSErrorBoundary>
            <Heading size="3xl" width="100%">{isComponentTypeSource(props.data.mode) ? 'Plays' : 'Scrobbles'}</Heading>
            <MSErrorBoundary><ListContainerFilterable render="virtDynamic" componentType={props.data.mode} componentId={props.data.id}/></MSErrorBoundary>
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