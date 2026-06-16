import React, { ComponentProps, useMemo, forwardRef, Fragment, useEffect, PropsWithChildren } from "react"
import { Image, Heading, HStack, Link, LinkOverlay, LinkBox, Span, Flex, Box, Separator, Switch } from '@chakra-ui/react';
import { VersionNext } from "../Version";
import { TextMuted } from "./TextMuted";
import { DocsButton, GithubButton, HeartbeatButton, HeartbeatIcon, TerminalButton, TerminalIcon } from "./icons/ChakraIcons";
import { MobileSidebarNav } from "./MobileMenu";

export const AppTitle = (props: { fetchable?: boolean } = {}) => {
    const {
        fetchable
    } = props;

    return (
        <HStack gap="2">
            <MobileSidebarNav />
            <LinkBox>
                <HStack gap="2">
                    <Image flex="0" maxWidth="30px" height="100%" width="100%" src="/icon.svg"></Image>
                    <LinkOverlay href="/next/">
                        <Heading hideBelow="sm" size="sm">Multi Scrobbler</Heading>
                    </LinkOverlay>
                </HStack>
            </LinkBox>
            {fetchable ? <VersionNext /> : <TextMuted>dev</TextMuted>}
        </HStack>
    )
}

interface RightHeaderSwitchLogsProps {
    logsEnabled?: boolean
    setLogsEnabled?: (val: boolean ) => void
}

export const RightHeaderSwitchLogs = (props: {
    logsEnabled?: boolean
    setLogsEnabled?: (val: boolean ) => void
}) => {
    const {logsEnabled, setLogsEnabled} = props;

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
            <Switch.Label><TerminalIcon/></Switch.Label>
        </Switch.Root>
    ) : null;

    return <HStack gap="2">
        {TerminalSwitch}
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