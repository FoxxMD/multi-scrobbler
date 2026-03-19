import React, { Fragment, useMemo, useState } from 'react';
import { EmptyState, DataList, HStack, Tag, Wrap, Box, Flex, SegmentGroup, Stack, Text, Separator, IconButton, Container, SimpleGrid } from "@chakra-ui/react"
import { LuCode, LuText } from "react-icons/lu"
import { JsonPlayObject } from '../../core/Atomic.js';
import { shortTodayAwareFormat } from '../../core/TimeUtils.js';
import dayjs from 'dayjs';
import { ChakraCodeBlock } from './CodeBlock.js';
import { safeStringify } from '../../core/StringUtils.js';
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

export interface PlayInfoProps {
    play?: JsonPlayObject
    final?: JsonPlayObject
    showCodeToggle?: boolean
    showCompare?: boolean
    compareDefault?: 'Initial' | 'Final'
    datesFooter?: false | 'all' | 'played' | 'seen'
    dates?: false | 'all' | 'played' | 'seen'
}

export const PlayData = (props?: PlayInfoProps) => {
    const {
        play,
        final,
        showCodeToggle = true,
        showCompare = true,
        compareDefault = 'Initial',
        datesFooter = false,
        dates = 'all'
    } = props ?? {};

    if (play === undefined) {
        return <EmptyPlayData />
    }

    const [compareVal, setCompareVal] = useState(compareDefault)
    const [codeMode, setCodeMode] = useState(false);

    const displayedPlay = compareVal === 'Initial' ? play : final;

    let comparer: JSX.Element | null = null,
        copy: JSX.Element | null = null;

    if (showCompare && final !== undefined) {
        comparer = (
            <SegmentGroup.Root size="xs" value={compareVal} onValueChange={(e) => setCompareVal(e.value as 'Initial' | 'Final')}>
                <SegmentGroup.Indicator />
                <SegmentGroup.Items items={["Initial", "Final"]} />
            </SegmentGroup.Root>
        );
    }
    if (showCodeToggle) {
        copy = (
            <IconButton variant="outline" size="xs" onClick={() => setCodeMode(!codeMode)}>
                {codeMode ? <LuText /> : <LuCode />}
            </IconButton>
        );
    }

    const datesFooterContent = useMemo(() => {
        let dateElm: JSX.Element;
        if (datesFooter !== false) {
            let playDate: JSX.Element,
                seenDate: JSX.Element;
            if (play.data.playDate !== undefined && ['all', 'played'].includes(datesFooter)) {
                playDate = <Text textStyle="xs" color="fg.muted">{`Played ${shortTodayAwareFormat(dayjs(play.data.playDate))}`}</Text>
            }
            // TODO implement seenAt for play data
            if (play.data.playDateCompleted !== undefined && ['all', 'seen'].includes(datesFooter)) {
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
    }, [play, datesFooter]);

    let albumArtistElm: JSX.Element;

    if (displayedPlay.data.albumArtists !== undefined && displayedPlay.data.albumArtists.length > 0) {
        albumArtistElm = (
            <DataList.Item>
                <DataList.ItemLabel>Album Artists</DataList.ItemLabel>
                <DataList.ItemValue>
                    <HStack>{displayedPlay.data.albumArtists.map((x, index) => {
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
    } = displayedPlay;

    let datesItem: JSX.Element | null;
    if(dates === false) {
        datesItem = null;
    } else {
        const dateElements = [];
        if(dates.includes('played') || dates.includes('all')) {
            dateElements.push((<TextMuted>{`Played ${shortTodayAwareFormat(dayjs(play.data.playDate))}`}</TextMuted>));
            if(play.data.playDateCompleted !== undefined) {
                dateElements.push((<TextMuted>{`Played Until ${shortTodayAwareFormat(dayjs(play.data.playDateCompleted))}`}</TextMuted>));
            }
        }
        if(dates.includes('seen') || dates.includes('all')) {
            dateElements.push((<TextMuted>{`Seen ${shortTodayAwareFormat(dayjs(play.data.playDate))}`}</TextMuted>));
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

    return (
        <Fragment>
            <Stack gap="3">
                <Flex justify="space-between">
                   <Box>{comparer}</Box> <Box>{copy}</Box>
                </Flex>
                {
                    codeMode ? <ChakraCodeBlock code={safeStringify(displayedPlay)} /> : (
                        <Flex gap="2" wrap="wrap">
                            <Box marginEnd="auto">
                                <DataList.Root>
                                    <DataList.Item>
                                        <DataList.ItemLabel flexShrink="1">Title</DataList.ItemLabel>
                                        <DataList.ItemValue>{displayedPlay.data.track}</DataList.ItemValue>
                                    </DataList.Item>
                                    <DataList.Item>
                                        <DataList.ItemLabel>Artists</DataList.ItemLabel>
                                        <DataList.ItemValue>
                                            {artists.length === 0 ? <Text color="fg.muted">(No Artists)</Text> :
                                                <HStack>{displayedPlay.data.artists.map((x, index) => {
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
                                        <DataList.ItemValue>{displayedPlay.data.album}</DataList.ItemValue>
                                    </DataList.Item>
                                </DataList.Root>
                            </Box>
                            <Box>
                                <DataList.Root>
                                    {datesItem}
                                </DataList.Root>
                            </Box>
                            {datesFooterContent}
                        </Flex>
                    )
                }
            </Stack>
        </Fragment>
    )
}

export const PlayInfoContainer = (props?: PlayInfoProps) => {
    return <Container maxWidth="lg"><PlayData {...props} /></Container>
}