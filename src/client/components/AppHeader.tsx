import React, { ComponentProps, useMemo, forwardRef, Fragment, useEffect, PropsWithChildren, useCallback, useRef, useState } from "react"
import { Image, Heading, HStack, Link, LinkOverlay, LinkBox, Span, Flex, Box, Separator, Switch, FloatingPanel, Portal, Text, IconButton, Status, Stack } from '@chakra-ui/react';
import { VersionNext } from "../Version";
import { TextMuted } from "./TextMuted";
import { TerminalButton, TerminalIcon, XButton } from "./icons/ChakraIcons";
import { MobileSidebarNav } from "./MobileMenu";
import { LuGripHorizontal, LuMinus } from "react-icons/lu"
import {Link as RouterLink} from 'react-router';
import {
    useWindowSize,
} from '@react-hook/window-size'

import { LogsFetchable } from "./LogsNext";
import { Ripple } from "./icons/AnimatedIcons";
import { useSSEContext, useSSEStatus } from "@flamefrontend/sse-runtime-react";
import { ToggleTip } from "./ToggleTip";
import { ErrorLike } from "../../core/Atomic";
import { ErrorAlert } from "./ErrorAlert";

export const AppTitle = (props: { fetchable?: boolean } = {}) => {
    const {
        fetchable
    } = props;

    return (
        <HStack gap="2">
            <MobileSidebarNav />
            <LinkBox>
                <HStack gap="2">
                    <Image maxWidth="30px" height="100%" width="100%" src="/icon.svg"></Image>
                    <LinkOverlay asChild href="/next/">
                        <RouterLink to='/next/'>
                            <Heading hideBelow="sm" size="sm">Multi Scrobbler</Heading>
                        </RouterLink>
                    </LinkOverlay>
                </HStack>
            </LinkBox>
            {fetchable ? <VersionNext /> : <TextMuted>dev</TextMuted>}
        </HStack>
    )
}

interface RightHeaderSwitchLogsProps {
    logsEnabled?: boolean
    setLogsEnabled?: (val: boolean) => void
}

export const RightHeaderSwitchLogs = (props: {
    logsEnabled?: boolean
    setLogsEnabled?: (val: boolean) => void
}) => {
    const { logsEnabled, setLogsEnabled } = props;

    const TerminalSwitch = setLogsEnabled !== undefined ? (
        <Switch.Root
            checked={logsEnabled}
            hideBelow="md"
            size="md"
            onCheckedChange={(e) => setLogsEnabled(e.checked)}>
            <Switch.HiddenInput />
            <Switch.Control>
                <Switch.Thumb />
            </Switch.Control>
            <Switch.Label><TerminalIcon /></Switch.Label>
        </Switch.Root>
    ) : null;

    return <HStack gap="2">
        {TerminalSwitch}
    </HStack>
}

export const SSEStatus = (props: {live?: boolean, status?: ReturnType<typeof useSSEStatus>['status'], error?: ErrorLike}) => {

    let status = props.status ?? 'closed'
    let error: ErrorLike = props.error;

    if(props.live) {
        const client = useSSEContext();
        const { status: sseStatus, error: sseError } = useSSEStatus(client);
        status = sseStatus;
        error = sseError as ErrorLike;
    }
    let content: string | React.JSX.Element;
    let color: ComponentProps<typeof Status.Indicator>['colorPalette'];
    switch(status) {
        case 'error':
        case 'closed':
            color = 'red';
            content = (
                <Stack>
                    <Text>Live events connection is <strong>{status}</strong></Text>
                    {error !== undefined ? <ErrorAlert error={error}/> : null}
                </Stack>                
            );
            break;
        case 'idle':
        case 'open':
            color = 'green';
            content = 'Currently receiving live events';
            break;
        case 'connecting':
        case 'reconnecting':
            color = 'orange';
            content = 'Reconnecting to live events...';
            break;
    }

  return (
    <ToggleTip content={content}>
        <IconButton variant="ghost" size="xs">
            <Status.Root>
                <Status.Indicator colorPalette={color} style={color === 'green' ? {animation: 'icon-fade-half 3s infinite linear'} : undefined}/>
            </Status.Root>
        </IconButton>
    </ToggleTip>
  )
}

export const RightHeaderFloatingLogs = (props: {streamable?: boolean}) => {
    const [width, height] = useWindowSize();

    return <HStack gap="2">
        <Box marginRight="2"><SSEStatus live={props.streamable}/></Box>
        <FloatingPanel.Root
            defaultPosition={{x: width * 0.03, y: height * 0.65}}
            defaultSize={{ width: width * 0.95, height: height * 0.3 }}
            persistRect
            closeOnEscape
            lazyMount
        >
            <FloatingPanel.Trigger asChild>
                <TerminalButton  />
            </FloatingPanel.Trigger>
            <Portal>
                <FloatingPanel.Positioner zIndex="1400">
                    <FloatingPanel.Content>
                        <FloatingPanel.Header>
                            <FloatingPanel.DragTrigger>
                                <LuGripHorizontal />
                                <FloatingPanel.Title>Logs <Ripple/></FloatingPanel.Title>
                            </FloatingPanel.DragTrigger>
                            <FloatingPanel.Control>
                                <FloatingPanel.StageTrigger stage="minimized" asChild>
                                    <IconButton variant="ghost" size="2xs">
                                        <LuMinus />
                                    </IconButton>
                                </FloatingPanel.StageTrigger>
                                <FloatingPanel.CloseTrigger asChild>
                                    <XButton variant="ghost" size="2xs" />
                                </FloatingPanel.CloseTrigger>
                            </FloatingPanel.Control>
                        </FloatingPanel.Header>
                        <FloatingPanel.Body>
                            <LogsFetchable streamable={props.streamable} />
                        </FloatingPanel.Body>
                        <FloatingPanel.ResizeTriggers />
                    </FloatingPanel.Content>
                </FloatingPanel.Positioner>
            </Portal>
        </FloatingPanel.Root>
    </HStack>
}

export const AppHeader = (props: PropsWithChildren<{ fetchable?: boolean }>) => {
    return (
        <Flex justify="space-between">
            <AppTitle fetchable={props.fetchable} />
            <Flex justify="flex-start" alignItems="flex-end">{props.children}</Flex>
        </Flex>
    )
}