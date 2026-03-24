import React, { Fragment, useMemo, useState } from 'react';
import { EmptyState, DataList, HStack, Tag, Tabs, Wrap, Box, Flex, SegmentGroup, Stack, Text, Separator, IconButton, Container, SimpleGrid, Float, Spacer, Icon, Link, Span, Show } from "@chakra-ui/react"
import { LuCode, LuText, LuCheck, LuX } from "react-icons/lu"
import { JsonPlayObject, PlayObjectLifecycleless } from '../../core/Atomic.js';
import { shortTodayAwareFormat, timeToHumanTimestamp } from '../../core/TimeUtils.js';
import dayjs from 'dayjs';
import { ChakraCodeBlock } from './CodeBlock.js';
import { TextMuted } from './TextMuted.js';
import { formatNumber } from '../../core/DataUtils.js';
import { Muted } from './Typography.js';

const EmptyPlayData = () => {
    return (
        <EmptyState.Root size="sm">
            <EmptyState.Content>
                <EmptyState.Indicator />
                <EmptyState.Description>
                    No Play object was provided.
                </EmptyState.Description>
            </EmptyState.Content>
        </EmptyState.Root>
    );
}

export type DisplayDates = false | 'all' | 'played' | 'seen';

export interface PlayInfoProps {
    play?: JsonPlayObject | PlayObjectLifecycleless<string>
    final?: JsonPlayObject
    showCodeToggle?: boolean
    showCompare?: boolean
    compareDefault?: 'Initial' | 'Final'
    dates?: false | 'all' | 'played' | 'seen'
}

export const PlayData = (props?: PlayInfoProps) => {
    const {
        play,
        final,
        showCodeToggle = true,
        showCompare = true,
        compareDefault = 'Initial',
        dates = 'all'
    } = props ?? {};

    if (play === undefined) {
        return <EmptyPlayData />
    }

    const [codeMode, setCodeMode] = useState(false);

    let code: JSX.Element | null = null;

    const comparable = showCompare && final !== undefined;

    if (showCodeToggle) {
        code = (
            <IconButton variant="outline" size="xs" onClick={() => setCodeMode(!codeMode)}>
                {codeMode ? <LuText /> : <LuCode />}
            </IconButton>
        );
    }

    if (!comparable) {
        return (<Box position="relative">
            <Float placement="top-end" offsetX="4" offsetY="2" hideBelow="sm" zIndex={100}>{code}</Float>
            {codeMode ? <ChakraCodeBlock code={play} /> : <PlayDataDataList play={play} dates={dates} />}
        </Box>);
    }

    return (
        <Box position="relative">
            <Float placement="top-end" offsetX="4" offsetY="2" hideBelow="sm" zIndex={100}>{code}</Float>
            <Tabs.Root size="sm" variant="outline" defaultValue={compareDefault}>
                <Tabs.List>
                    <Tabs.Trigger value="Initial">Initial</Tabs.Trigger>
                    <Tabs.Trigger value="Final">Final</Tabs.Trigger>
                </Tabs.List>
                <Tabs.Content value="Initial">
                    {codeMode ? <ChakraCodeBlock code={play} /> : <PlayDataDataList play={play} dates={dates} />}
                </Tabs.Content>
                <Tabs.Content value="Final">
                    {codeMode ? <ChakraCodeBlock code={final} /> : <PlayDataDataList play={final} dates={dates} />}
                </Tabs.Content>
            </Tabs.Root>
        </Box>
    );
}

export const PlayDataDataList = (props: { play: JsonPlayObject, dates: DisplayDates }) => {

    const {
        play,
        dates
    } = props;


    let albumArtistElm: JSX.Element;

    if (play.data.albumArtists !== undefined && play.data.albumArtists.length > 0) {
        albumArtistElm = (
            <DataList.Item flexGrow="1">
                <DataList.ItemLabel>Album Artists</DataList.ItemLabel>
                <DataList.ItemValue>
                    <HStack>{play.data.albumArtists.map((x, index) => {
                        return (
                            <Tag.Root key={index}>
                                <Tag.Label>{x}</Tag.Label>
                            </Tag.Root>
                        );
                    })}</HStack>
                </DataList.ItemValue>
            </DataList.Item>
        );
    }

    const {
        data: {
            track,
            artists = [],
            listenedFor,
            duration,
            repeat,
            meta: {
                brainz = {}
            } = {}
        } = {},
        meta: {
            url: {
                web: webUrl,
                origin: originUrl
            } = {}
        } = {}
    } = play;

    let titleElm: JSX.Element;
    if(webUrl !== undefined || originUrl !== undefined) {
        titleElm = <Link variant="underline" target="_blank" href={webUrl ?? originUrl}>{track}</Link>
    } else {
        titleElm = <Span>{track}</Span>;
    }

    return (
        <Flex flexDirection="column" gap="4">
            <DataList.Root flexWrap="wrap" flexDirection="row">
                <DataList.Item flexGrow="1">
                    <DataList.ItemLabel flexShrink="1">Title</DataList.ItemLabel>
                    <DataList.ItemValue>{titleElm}</DataList.ItemValue>
                </DataList.Item>
                <DataList.Item flexGrow="1">
                    <DataList.ItemLabel>Artists</DataList.ItemLabel>
                    <DataList.ItemValue>
                        {artists.length === 0 ? <Text color="fg.muted">(No Artists)</Text> :
                            <HStack>{play.data.artists.map((x, index) => {
                                return (
                                    <Tag.Root key={index}>
                                        <Tag.Label>{x}</Tag.Label>
                                    </Tag.Root>
                                );
                            })}</HStack>}
                    </DataList.ItemValue>
                </DataList.Item>
                {albumArtistElm}
                <DataList.Item flexGrow="1">
                    <DataList.ItemLabel>Album</DataList.ItemLabel>
                    <DataList.ItemValue>{play.data.album}</DataList.ItemValue>
                </DataList.Item>
            </DataList.Root>
            <DataList.Root flexWrap="wrap" flexDirection="row">
                <PlayDatesStack play={play} dates={dates} />
                <DataList.Item flexGrow="1" hideBelow="sm">
                    <DataList.ItemLabel>Duration</DataList.ItemLabel>
                    <DataList.ItemValue>
                        <Stack gap="1">
                            <Text textStyle="xs">Track Length: {timeToHumanTimestamp(dayjs.duration(duration, 's'))}</Text>
                            {listenedFor !== undefined ? <Muted textStyle="xs">Listened For: {timeToHumanTimestamp(dayjs.duration(listenedFor, 's'))} ({formatNumber((listenedFor / duration) * 100)}%)</Muted> : null}
                        </Stack>
                    </DataList.ItemValue>
                </DataList.Item>
                <DataList.Item flexGrow="1" hideBelow="sm">
                    <DataList.ItemLabel>Repeat?</DataList.ItemLabel>
                    <DataList.ItemValue><Icon>{repeat ? <LuCheck/> : <LuX/>}</Icon></DataList.ItemValue>
                </DataList.Item>
            </DataList.Root>
            <DataList.Root flexWrap="wrap" flexDirection="row" hideBelow="sm">
                <Show when={Object.keys(brainz).length > 0}>
                    <DataList.Item flexGrow="1">
                        <DataList.ItemLabel>MBIDs</DataList.ItemLabel>
                        <DataList.ItemValue>
                            <Stack gap="1">
                                <Show when={brainz.track !== undefined}><Text textStyle="xs"><Muted>Track:</Muted> {brainz.track}</Text></Show>
                                <Show when={brainz.recording !== undefined}><Text textStyle="xs"><Muted>Recording</Muted>: {brainz.recording}</Text></Show>
                                <Show when={brainz.album !== undefined}><Text textStyle="xs"><Muted>Album</Muted>: {brainz.album}</Text></Show>
                            </Stack>
                        </DataList.ItemValue>
                    </DataList.Item>
                </Show>
            </DataList.Root>
        </Flex>
    )
}

export const PlayInfoContainer = (props?: PlayInfoProps) => {
    return <Container maxWidth="lg"><PlayData {...props} /></Container>
}

export const PlayDatesStack = (props: { play: JsonPlayObject, dates: DisplayDates }) => {
    const {
        play,
        dates
    } = props;

    let datesItem: JSX.Element | null;
    if (dates === false) {
        datesItem = null;
    } else {
        const dateElements = [];
        if (dates.includes('played') || dates.includes('all')) {
            dateElements.push((<Text textStyle="xs" key="playDate">{`Played ${shortTodayAwareFormat(dayjs(play.data.playDate))}`}</Text>));
            if (play.data.playDateCompleted !== undefined) {
                dateElements.push((<TextMuted key="playDateCompleted">{`Played Until ${shortTodayAwareFormat(dayjs(play.data.playDateCompleted))}`}</TextMuted>));
            }
        }
        if (dates.includes('seen') || dates.includes('all')) {
            dateElements.push((<TextMuted key="seen">{`Seen ${shortTodayAwareFormat(dayjs(play.data.playDate))}`}</TextMuted>));
        }
        datesItem = (
            <DataList.Item flexGrow="1">
                <DataList.ItemLabel>Dates</DataList.ItemLabel>
                <DataList.ItemValue>
                    <Stack gap="1">
                        {dateElements}
                    </Stack>
                </DataList.ItemValue>
            </DataList.Item>
        )
    }

    return datesItem;
}

export const PlayDatesFooter = (props: { play: JsonPlayObject, dates: DisplayDates }) => {

    const {
        play,
        dates
    } = props;

    let dateElm: JSX.Element;

    if (dates !== false) {
        let playDate: JSX.Element,
            seenDate: JSX.Element;
        if (play.data.playDate !== undefined && ['all', 'played'].includes(dates)) {
            playDate = <Text textStyle="xs" color="fg.muted">{`Played ${shortTodayAwareFormat(dayjs(play.data.playDate))}`}</Text>
        }
        // TODO implement seenAt for play data
        if (play.data.playDateCompleted !== undefined && ['all', 'seen'].includes(dates)) {
            seenDate = <Text textStyle="xs" color="fg.muted">{`Seen ${shortTodayAwareFormat(dayjs(play.data.playDateCompleted))}`}</Text>
        }
        if (playDate !== undefined && seenDate !== undefined) {
            dateElm = <HStack gap="1">{playDate}<Separator orientation="vertical" height="4" />{seenDate}</HStack>
        } else if (playDate !== undefined) {
            dateElm = playDate;
        } else if (seenDate !== undefined) {
            dateElm = seenDate;
        }
    }
    return dateElm;
}