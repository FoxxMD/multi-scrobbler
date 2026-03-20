import React, { Fragment, useMemo, useState } from 'react';
import { EmptyState, DataList, HStack, Tag, Tabs, Wrap, Box, Flex, SegmentGroup, Stack, Text, Separator, IconButton, Container, SimpleGrid, Float } from "@chakra-ui/react"
import { LuCode, LuText } from "react-icons/lu"
import { JsonPlayObject, PlayObjectLifecycleless } from '../../core/Atomic.js';
import { shortTodayAwareFormat } from '../../core/TimeUtils.js';
import dayjs from 'dayjs';
import { ChakraCodeBlock } from './CodeBlock.js';
import { TextMuted } from './TextMuted.js';

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
            <DataList.Item>
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
            artists = []
        } = {}
    } = play;

    return (
        <Flex gap="4" wrap="wrap">
            <Box>
                <DataList.Root>
                    <DataList.Item>
                        <DataList.ItemLabel flexShrink="1">Title</DataList.ItemLabel>
                        <DataList.ItemValue>{play.data.track}</DataList.ItemValue>
                    </DataList.Item>
                    <DataList.Item>
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
                    <DataList.Item>
                        <DataList.ItemLabel>Album</DataList.ItemLabel>
                        <DataList.ItemValue>{play.data.album}</DataList.ItemValue>
                    </DataList.Item>
                </DataList.Root>
            </Box>
            <Box>
                <DataList.Root>
                    <PlayDatesStack play={play} dates={dates} />
                </DataList.Root>
            </Box>
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
            dateElements.push((<TextMuted key="playDate">{`Played ${shortTodayAwareFormat(dayjs(play.data.playDate))}`}</TextMuted>));
            if (play.data.playDateCompleted !== undefined) {
                dateElements.push((<TextMuted key="playDateCompleted">{`Played Until ${shortTodayAwareFormat(dayjs(play.data.playDateCompleted))}`}</TextMuted>));
            }
        }
        if (dates.includes('seen') || dates.includes('all')) {
            dateElements.push((<TextMuted key="seen">{`Seen ${shortTodayAwareFormat(dayjs(play.data.playDate))}`}</TextMuted>));
        }
        datesItem = (
            <DataList.Item>
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