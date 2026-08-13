import React, { useCallback, useMemo, type ComponentProps } from "react"
import { Portal, Group, Span, Menu, Box, Heading, Skeleton, Wrap, HStack, Stack, Flex, Text, Card, Button, CloseButton, SkeletonText, type BadgeProps, type MenuItemProps, createOverlay, Dialog, type MenuSelectionDetails } from '@chakra-ui/react';
import { COMPONENT_STATE, type ComponentClientApiJson, type ComponentCommonApiJson, type ComponentsApiJson, type ComponentState, type ComponentStateBody, isComponentClientApiJson, isComponentSourceApiJson, type MsSseEvent, type MsSseEventPayload } from "../../../core/Api.js";
import { capitalize } from "../../../core/StringUtils.js";
import { ChevronLeftButton, EllipsisButton, ExternalLinkIcon, EyeButton, EyeClosedIcon, EyeIcon, IdleIcon, PowerButton, PowerIcon, PowerOffButton, PowerOffIcon, RetryButton, RetryIcon, UnlockButton, UnlockIconRaw } from "../icons/ChakraIcons.js";
import { PlayersContainer, PlayersContainerFetchable } from "../chakraPlayer/Player.js";
import { Tooltip } from "../ToggleTip.js";
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import ky from "ky";
import { ErrorAlert } from "../ErrorAlert";
import {
    useSSEContext,
    useSSEAnyEvent
} from "@flamefrontend/sse-runtime-react";
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
import { PlaybackReportingServer } from "../icons/PlaybackReporting.js";
import { findAnyAuthError, findAuthError } from "../../utils/ComponentUtils.js";
import { COMPONENT_AUTH_TYPE } from "../../../core/Atomic.js";

export const ComponentBackButton = (props: ComponentProps<typeof ChevronLeftButton> = {}) => {
    return (
            <Link to={`/next`}>
                <ChevronLeftButton variant="ghost" iconProps={{style: {width: 'unset', height:  'unset', fontSize: "2em"}}} {...props} />
            </Link>
    );
}

export const MSComponentName = (props: {data?: Pick<ComponentCommonApiJson, 'name'> & {playbackReporting?: boolean}}) => {
    if(props.data === undefined) {
        return <HStack><ComponentBackButton/><Skeleton width="5rem" height="5rem" /></HStack>;
    }
    let subsonicPlaybackReporting: React.JSX.Element;
    if('playbackReporting' in props.data) {
        subsonicPlaybackReporting = <PlaybackReportingServer playbackReporting={props.data.playbackReporting}/>
    }
    return <Heading truncate size="2xl"><ComponentBackButton/>{props.data.name}{subsonicPlaybackReporting}</Heading>;
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

type AuthDialogProps = {data: Pick<ComponentsApiJson, 'id' | 'authType' | 'errors'>};

const dialog = createOverlay<AuthDialogProps>((props) => {
  const { data, ...rest } = props

    const { isPending, isError, data: url, error } = useQuery({
        enabled: data.authType === COMPONENT_AUTH_TYPE.interactive,
        staleTime: Infinity,
        ...tanQueries.components.authUrl(data.id),
    });
    const authFailure = useMemo(() => {
        for(const e of data.errors) {
            const authState = findAnyAuthError(e);
            if(authState !== undefined) {
                return authState;
            }
        }
        return [undefined, false];
    },[data.errors]);

    let content: React.JSX.Element;
    if (authFailure[0] !== undefined && authFailure[1] === true) {
        content = (
            <>
                <Text>Auth failed and the error indicated that this component <strong>cannot</strong> be recovered from this state.</Text>
                <Text>Likely this means that something is wrong with the data in your configuration which requires you to update it and restart Multi-Scrobbler.</Text>
                <Text>You can still try to <strong>Test Auth</strong> but this will probably change nothing.</Text>
            </>
        );
    } else if(data.authType !== COMPONENT_AUTH_TYPE.interactive && authFailure[0] !== undefined && authFailure[1] === false) {
        content = (
            <>
                <Text>Auth failed and the error indicated that this component <strong>can</strong> be recovered from this state.</Text>
                <Text>This is likely due to a temporary network issue or something you can fix upstream (file permission issues, user permissions, etc...) without needing to restart Multi-Scrobbler.</Text>
                <Text>Try to <strong>Test Auth</strong> after you have made upstream changes or the network issue has been resolved.</Text>
            </>
        ); 
    } else if(data.authType === COMPONENT_AUTH_TYPE.interactive && authFailure[0] !== undefined && authFailure[1] === false) {
        content = (
            <>
                <Text>Auth failed and the error indicated that this component <strong>can</strong> be recovered from this state.</Text>
                <Text>If you have just setup this component, or the error indicates auth data is now invalid, try to <strong>Authenticate</strong>.</Text>
                <Text><strong>Authenticate</strong> will redirect you to the upstream service's site where you must login and/or allow Multi-Scrobbler access to your account. After auth is complete you will be redirected back here.</Text>
                <Text>If you have previously successfully Authenticated and the error indicates it is networking-related, try to <strong>Test Auth</strong> after the networking issue is resolved.</Text>
            </>
        ); 
    }

  return (
    <Dialog.Root {...rest}>
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <Dialog.Header>
                <Dialog.Title>Authentication</Dialog.Title>
              </Dialog.Header>
            <Dialog.Body spaceY="4">
              {content}
              {isError && <ErrorAlert error={error}/>}
            </Dialog.Body>
            <Dialog.Footer>
            <Dialog.ActionTrigger asChild>
                <Button variant="outline">Cancel</Button>
            </Dialog.ActionTrigger>
            {COMPONENT_AUTH_TYPE.interactive === data.authType && <Button disabled={isPending || isError} asChild><a target="_self" href={url}>Authenticate <ExternalLinkIcon size="sm"/></a></Button>}
            <Button>Test Auth</Button>
            </Dialog.Footer>
            <Dialog.CloseTrigger asChild>
            <CloseButton size="sm" />
            </Dialog.CloseTrigger>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  )
})

const stateIsStarted = (state: ComponentState): boolean => state <= COMPONENT_STATE.MUTED;

const componentStateMenuItem = (Icon: IconType, value: string, name?: string) => (props: Pick<MenuItemProps, 'disabled'> = {}) => {
    return (<Menu.Item key={value} value={value} {...props}><Icon/><Box flex="1">{name ?? capitalize(value)}</Box></Menu.Item>);
}
const MenuItemRestart = componentStateMenuItem(RetryIcon, 'restart');
const MenuItemStop = componentStateMenuItem(PowerOffIcon, 'stop');
const MenuItemStart = componentStateMenuItem(PowerIcon, 'start');
const MenuItemMute = componentStateMenuItem(EyeClosedIcon, 'mute', 'Ignore')
const MenuItemUnmute = componentStateMenuItem(EyeIcon, 'unmute', 'Monitor');
const MenuItemAuth = componentStateMenuItem(UnlockIconRaw, 'auth', 'Auth');

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

    const {mutate, isPending, variables, isSuccess} = useMutation({
        mutationKey: ['stateChange', componentId],
        mutationFn: (action: ComponentStateBody['state']) => ky.post(`/api/components/${componentId}/state`,{
            json: {state: action, reason: 'User initiated from UI'}
        })
    });

    const authFailure = useMemo(() => {
        for(const e of props.data.errors) {
            const authState = findAnyAuthError(e);
            if(authState !== undefined) {
                return authState;
            }
        }
        return [undefined, false];
    },[props.data.errors]);

    switch(props.data.state) {
        case COMPONENT_STATE.RUNNING:
            primaryAction = <RetryButton onClick={() => mutate('restart')} disabled={isPending} {...primaryActionProps}/>
            menuItems = [<MenuItemStop/>,<MenuItemMute/>];
            break;
        case COMPONENT_STATE.IDLE:
            primaryAction = <PowerButton onClick={() => mutate('start')} disabled={isPending} {...primaryActionProps}/>
            menuItems = [<MenuItemStop/>,<MenuItemRestart/>,<MenuItemMute/>];
            break;
        case COMPONENT_STATE.MUTED:
            primaryAction = <EyeButton  disabled={isPending} {...primaryActionProps}/>;
            menuItems = [<MenuItemStop/>,<MenuItemRestart/>,<MenuItemUnmute/>];
            break;
        case COMPONENT_STATE.STOPPED:
            primaryAction = <PowerButton onClick={() => mutate('start')} disabled={isPending} {...primaryActionProps}/>
            menuItems = [<MenuItemRestart/>];
            break;
        case COMPONENT_STATE.INITIALIZING:
            // no actions while init is occurring
            break;
        case COMPONENT_STATE.NOT_READY:
        case COMPONENT_STATE.ERROR:
            if(authFailure[0] !== undefined) {
                primaryAction = <UnlockButton onClick={() => dialog.open('auth', {data: {id: componentId, errors: props.data.errors, authType: props.data.authType}})}  disabled={isPending} {...primaryActionProps}/>;
                menuItems = [<MenuItemRestart/>];
            } else {
                primaryAction = <RetryButton onClick={() => mutate('restart')}  disabled={isPending} {...primaryActionProps}/>;
            }
            // no actions while init is occurring
            break;
        default:
            // otherwise generic start action for all non-running states
            primaryAction = <RetryButton onClick={() => mutate('restart')}  disabled={isPending} {...primaryActionProps}/>;
    }

    if(authFailure[0] !== undefined && !([COMPONENT_STATE.NOT_READY,COMPONENT_STATE.ERROR] as ComponentState[]).includes(props.data.state)) {
        menuItems.push(<MenuItemAuth/>)
    }

    const menuCb = useCallback((select: MenuSelectionDetails) => {
        if(select.value !== 'auth') {
            mutate(select.value as ComponentStateBody['state']);
        } else {
            dialog.open('auth', {data: {id: componentId, errors: props.data.errors, authType: props.data.authType}});
        }
    },[mutate, props.data.errors, componentId, props.data.authType]);


    if(menuItems.length > 0) {
        menuElm = (
    <Menu.Root positioning={{ placement: "bottom-end" }} onSelect={menuCb}>
      <Group attached>
        {primaryAction}
        <Menu.Trigger asChild>
          <EllipsisButton disabled={isPending} {...primaryActionProps}/>
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

    return <ComponentStateBadge size="lg" maxWidth="fit-content" {...badgeProps} loading={isPending} separator suffix={suffix} {...rest}/>;
}

export const ComponentDetailedDesktop = (props: {data?: ComponentsApiJson, live?: boolean}) => {
    let sleepingRender: React.JSX.Element = null;
    const {
        data,
        data: {
            warnings = [],
            errors = [],
            authed,
            authType
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
    const authFailure = useMemo(() => {
        if(authed) {
            return false;
        }
        for(const e of errors) {
            const aError = findAuthError(e);
            if(aError !== undefined && 'unrecoverable' in aError && aError.unrecoverable === true) {
                return true;
            }
        }
    },[errors, authed]);
    const target = React.useRef(null);
    const isWrapped = useIsWrapped(target);
    return (
        <MSErrorBoundary>
        <dialog.Viewport />
        <Flex direction="row" wrap="wrap" style={{whiteSpace: 'break-spaces'}} truncate rowGap="4">
            <Wrap width="100%" ref={target}>
                <Box marginEnd="auto" truncate>
                    <MSComponentName data={data}/>
                    <MSComponentType data={data}/>
                </Box>
                <Stack alignItems={isWrapped ? 'flex-start' : 'flex-end'}>
                    <ComponentStateBadgeActionable size="lg" maxWidth="fit-content" componentId={data.id} data={data} />
                    <HStack style={{whiteSpace: 'break-spaces'}}>{sleepingRender}{data.status}</HStack>
                </Stack>
            </Wrap>
            <Flex justifyContent="flex-end" rowGap="6" flexDirection="row-reverse" wrap="wrap">
                <Box marginEnd="auto"><MSComponentStats {...props}/></Box>
            </Flex>
            {errors.length > 0 ? <>{errors.map(x => <ErrorAlert error={x}/>)}</> : undefined }
            {warnings.length > 0 ? <>{warnings.map(x => <ErrorAlert error={x} status="warning"/>)}</> : undefined }
            <MSErrorBoundary>{props.live ? <PlayersContainerFetchable nowPlaying={isSource ? undefined : true} data={data}/> : <PlayersContainer nowPlaying={isSource ? undefined : true} data={data} live={props.live}/>}</MSErrorBoundary>
            <MSErrorBoundary><ListContainerFilterable render="virtDynamic" componentType={data.mode} componentId={data.id}/></MSErrorBoundary>
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
    if (data === undefined) {
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