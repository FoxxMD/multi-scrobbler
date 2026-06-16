import React, { ComponentProps, useMemo, forwardRef, Fragment, useEffect } from "react"
import { Image, Heading, HStack, Link, LinkOverlay, LinkBox, Span, Flex, Box, Separator } from '@chakra-ui/react';
import { VersionNext } from "../Version";
import { TextMuted } from "./TextMuted";
import { DocsButton, GithubButton, HeartbeatButton, HeartbeatIcon, TerminalButton } from "./icons/ChakraIcons";
import { MobileSidebarNav } from "./MobileMenu";

export const AppTitle = (props: { fetchable?: boolean } = {}) => {
    const {
        fetchable
    } = props;

    return (
        <HStack gap="2">
            <MobileSidebarNav/>
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

export const RightHeaderActions = (props: any) => {
    return <HStack gap="2">
        {/* <LinkBox>
            <LinkOverlay target="__blank" href="https://status.multi-scrobbler.app">
                <HeartbeatButton />
            </LinkOverlay>
        </LinkBox>
        <LinkBox>
            <LinkOverlay target="__blank" href="https://ms.foxxmd.io/docs">
                <DocsButton />
            </LinkOverlay>
        </LinkBox>
        <LinkBox>
            <LinkOverlay target="__blank" href="https://github.com/FoxxMD/multi-scrobbler">
                <GithubButton />
            </LinkOverlay>
        </LinkBox> */}
    </HStack>
}

export const AppHeader = (props: { fetchable?: boolean } = {}) => {
    return (
        <Flex justify="space-between">
            <AppTitle fetchable={props.fetchable} />
            <Flex justify="flex-start" alignItems="flex-end"><RightHeaderActions /></Flex>
        </Flex>
    )
}