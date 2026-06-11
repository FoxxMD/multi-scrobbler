import React, { ComponentProps, useMemo, forwardRef, Fragment } from "react"
import { Accordion, For, Span, Stack, Text, Box, Heading, AbsoluteCenter, Button, Separator, HStack, Flex, Badge, IconButton, Container, Collapsible, Card,  LinkOverlay, LinkBox } from '@chakra-ui/react';
import { ComponentCommonApi, ComponentCommonApiJson, isComponentClientApiJson, isComponentSourceApiJson } from "../../../core/Api";
import { TextMuted } from "../TextMuted";
import { isClientType } from "../../../backend/common/infrastructure/Atomic";
import { capitalize } from "../../../core/StringUtils";
import { ShortDateDisplay } from "../DateDisplay";
import { ChevronRightButton } from "../icons/ChakraIcons";

export const MSComponentSummary = (props: { data: ComponentCommonApiJson }) => {
        const {
        data
    } = props;
    const isClient = isClientType(data.type);
    return (<Card.Root variant="subtle">
        <Card.Header>
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
            <TextMuted textStyle="md">{isClient ? `(${data.mode}) ` : ''}{capitalize(data.type)}</TextMuted>
            <QuickStatsSource data={data} />
        </Card.Header>
        <Card.Footer />
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
                <TextMuted textStyle="sm">{deadLetterScrobbles} ({deadLetterScrobblesTotal}) Dead (Total) </TextMuted>
                <Separator orientation="vertical" height="4" />
                <TextMuted textStyle="sm">{countLive} Scrobbled</TextMuted>
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