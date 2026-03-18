import React, { Fragment, useMemo, useState } from 'react';
import { EmptyState, DataList, HStack, Tag, Wrap, Box, Flex, SegmentGroup, Stack, Text, Separator } from "@chakra-ui/react"
import { JsonPlayObject } from '../../core/Atomic';
import { ChakraClip } from './ChakraClipboard';
import { shortTodayAwareFormat, todayAwareFormat } from '../../core/TimeUtils';
import dayjs from 'dayjs';

const EmptyPlay = () => {
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
    showCopy?: boolean
    showCompare?: boolean
    showDates?: false | 'all' | 'played' | 'seen'
}

export const PlayInfo = (props?: PlayInfoProps) => {
    const {
        play,
        final,
        showCopy = true,
        showCompare = true,
        showDates = 'all'
    } = props ?? {};

    if (play === undefined) {
        return <EmptyPlay />
    }

    const [compareVal, setCompareVal] = useState('Original')

    const displayedPlay = compareVal === 'Original' ? play : final;

    let comparer: JSX.Element | null = null,
        copy: JSX.Element | null = null;

    if (showCompare && final !== undefined) {
        comparer = (
            <SegmentGroup.Root size="xs" value={compareVal} onValueChange={(e) => setCompareVal(e.value)}>
                <SegmentGroup.Indicator />
                <SegmentGroup.Items items={["Original", "Final"]} />
            </SegmentGroup.Root>
        );
    }
    if (showCopy) {
        copy = <ChakraClip value={displayedPlay} />;
    }

    const dates = useMemo(() => {
        let dateElm: JSX.Element;
        if (showDates !== false) {
            let playDate: JSX.Element,
                seenDate: JSX.Element;
            if (play.data.playDate !== undefined && ['all','played'].includes(showDates)) {
                playDate = <Text textStyle="xs" color="fg.muted">{`Played ${shortTodayAwareFormat(dayjs(play.data.playDate))}`}</Text>
            }
            // TODO implement seenAt for play data
            if (play.data.playDateCompleted !== undefined && ['all','seen'].includes(showDates)) {
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
    }, [play, showDates]);

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

    return (
        <Fragment>
            <Stack gap="3">
                <Flex justify="flex-end">
                    <HStack>{comparer}{copy}</HStack>
                </Flex>
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
                            })}</HStack> }
                        </DataList.ItemValue>
                    </DataList.Item>
                    <DataList.Item>
                        <DataList.ItemLabel>Album</DataList.ItemLabel>
                        <DataList.ItemValue>{displayedPlay.data.album}</DataList.ItemValue>
                    </DataList.Item>
                </DataList.Root>
                {dates}
            </Stack>
        </Fragment>
    )
}