import { Box, Flex, Heading, HStack, IconButton, Image, LinkBox, LinkOverlay, Stack, Status, Switch, Text } from '@chakra-ui/react';;
import React, { type ComponentProps, type PropsWithChildren } from "react";
import { Link as RouterLink } from 'react-router';
import { VersionNext } from "../Version";
import { MobileSidebarNav } from "./MobileMenu";
import { TextMuted } from "./TextMuted";
import { TerminalIcon } from "./icons/ChakraIcons";

import { useSSEContext, useSSEStatus } from "@flamefrontend/sse-runtime-react";
import type {ErrorLike} from "../../core/Atomic";
import { ErrorAlert } from "./ErrorAlert";
import { ExternaLinksMenu } from "./ExternaLinksMenu";
import { FloatingLogs } from "./LogsNext";
import { ToggleTip } from "./ToggleTip";

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

interface SSEStatusProps {
    status?: ReturnType<typeof useSSEStatus>['status']
    error?: ErrorLike
}

export const SSEStatusElement = (props: SSEStatusProps) => {

    const status = props.status ?? 'closed';
    let content: string | React.JSX.Element;
    let color: ComponentProps<typeof Status.Indicator>['colorPalette'];
    switch(status) {
        case 'error':
        case 'closed':
            color = 'red';
            content = (
                <Stack>
                    <Text>Live events connection is <strong>{status}</strong></Text>
                    <ErrorAlert error={props.error}/>
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
    <ToggleTip content={<Box py="2">{content}</Box>}>
        <IconButton variant="ghost" size="xs">
            <Status.Root>
                <Status.Indicator colorPalette={color} style={color === 'green' ? {animation: 'icon-fade-half 3s infinite linear'} : undefined}/>
            </Status.Root>
        </IconButton>
    </ToggleTip>
  )
}

const SSEStatus = (props: {live?: boolean} & SSEStatusProps) => {
    if(props.live) {
        return <SSEStatusLive/>;
    }

    return <SSEStatusElement {...props}/>
}

const SSEStatusLive = () => {
    const client = useSSEContext();
    const { status: sseStatus, error: sseError } = useSSEStatus(client);
    return <SSEStatus status={sseStatus} error={sseError as ErrorLike}/>
}


export const AppHeader = (props: PropsWithChildren<{ fetchable?: boolean }>) => (
        <Flex justify="space-between">
            <AppTitle fetchable={props.fetchable} />
            <Flex justify="flex-start" gap="1" alignItems="flex-end">
                <ExternaLinksMenu hideBelow="sm"/>
                <Box marginRight="2">
                    <SSEStatus live={props.fetchable}/>
                </Box>
                <FloatingLogs streamable={props.fetchable}/>
            </Flex>
        </Flex>
    )