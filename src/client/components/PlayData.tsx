import React, { useCallback, useState, type ComponentProps } from 'react';
import { EmptyState, DataList, HStack, Tabs, Box, Flex, Stack, Text, Separator, IconButton, Container, Float, Icon, Link, Span, Show, Menu, Group, Portal, type MenuItemProps, type MenuSelectionDetails } from "@chakra-ui/react"
import { LuCode, LuText, LuCheck, LuX } from "react-icons/lu"
import type { JsonPlayObject, PlayObjectMinimal } from '../../core/Atomic.js';
import { shortTodayAwareFormat, timeToHumanTimestamp } from '../../core/TimeUtils.js';
import dayjs from 'dayjs';
import { ChakraCodeBlock } from './CodeBlock.js';
import { TextMuted } from './TextMuted.js';
import { formatNumber } from '../../core/DataUtils.js';
import { Muted } from './Typography.js';
import { ArtistCreditTags } from './ArtistCreditDisplay.js';
import { MSErrorBoundary } from './ErrorBoundary.js';
import { EllipsisButton, EyeClosedIcon, EyeIcon, getMusicServiceIconElement } from './icons/ChakraIcons.js';
import { MusicbrainzInfoIcon } from './musicServices/Musicbrainz.js';
import type { IconType } from 'react-icons/lib';
import { capitalize } from '../../core/StringUtils.js';

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
    play?: JsonPlayObject | PlayObjectMinimal<string>
    final?: JsonPlayObject
    showCodeToggle?: boolean
    showCompare?: boolean
    compareDefault?: 'Initial' | 'Final'
    dates?: false | 'all' | 'played' | 'seen'
}

const primaryActionProps: ComponentProps<typeof EllipsisButton> = {
    //margin: "1px",
    variant: "outline",
    size: 'xs'
}

const menuItem = (Icon: IconType, value: string, name?: string) => (props: Pick<MenuItemProps, 'disabled'> = {}) => (<Menu.Item key={value} value={value} {...props}><Icon /><Box flex="1">{name ?? capitalize(value)}</Box></Menu.Item>)

const MenuMbidShow = menuItem(EyeIcon, 'mbidShow', 'Show MBIDs');
const MenuMbidHide = menuItem(EyeClosedIcon, 'mbidHide', 'Hide MBIDs');

export const PlayData = (props?: PlayInfoProps) => {
    const {
        play,
        final,
        showCodeToggle = true,
        showCompare = true,
        compareDefault = 'Initial',
        dates = 'all'
    } = props ?? {};


    const [codeMode, setCodeMode] = useState(false);
    const [showMbid, setShowMBid] = useState(false);

    const menuCb = useCallback((select: MenuSelectionDetails) => {
        if (select.value === 'mbidShow') {
            setShowMBid(true);
        } else if (select.value === 'mbidHide') {
            setShowMBid(false);
        }
    }, [setShowMBid])

    if (play === undefined) {
        return <EmptyPlayData />
    }
    let code: React.JSX.Element | null = null;

    const comparable = showCompare && final !== undefined;

    const menuItems: React.JSX.Element[] = [
        showMbid ? <MenuMbidHide /> : <MenuMbidShow />
    ];

    if (showCodeToggle) {
        code = (
            <IconButton hideBelow="sm" variant="outline" size="xs" {...primaryActionProps} onClick={() => setCodeMode(!codeMode)}>
                {codeMode ? <LuText /> : <LuCode />}
            </IconButton>
        );
    }

    let content: React.JSX.Element;

    if (!comparable) {
        content = codeMode ? <ChakraCodeBlock code={play} /> : <PlayDataDataList play={play} dates={dates} showMbid={showMbid} />;
    } else {
        content = (
            <Tabs.Root size="sm" variant="outline" defaultValue={compareDefault}>
                <Tabs.List>
                    <Tabs.Trigger value="Initial">Initial</Tabs.Trigger>
                    <Tabs.Trigger value="Final">Final</Tabs.Trigger>
                </Tabs.List>
                <Tabs.Content value="Initial">
                    {codeMode ? <ChakraCodeBlock code={play} /> : <PlayDataDataList play={play} dates={dates} showMbid={showMbid} />}
                </Tabs.Content>
                <Tabs.Content value="Final">
                    {codeMode ? <ChakraCodeBlock code={final} /> : <PlayDataDataList play={final} dates={dates} showMbid={showMbid} />}
                </Tabs.Content>
            </Tabs.Root>
        )
    }

    return (
        <Box position="relative">
            <MSErrorBoundary>
                <Float placement="top-end" offsetX="6" offsetY="2" zIndex={100}>
                    <HStack>
                        <Menu.Root positioning={{ placement: "bottom-end" }} onSelect={menuCb}>
                            <Group attached>
                                {code}
                                <Menu.Trigger asChild>
                                    <EllipsisButton {...primaryActionProps} />
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
                    </HStack>
                </Float>
                {content}
            </MSErrorBoundary>
        </Box>
    );
}

export const PlayDataDataList = (props: { play: JsonPlayObject, dates: DisplayDates, showMbid?: boolean }) => {

    const {
        play,
        dates,
        showMbid = false
    } = props;


    let albumArtistElm: React.JSX.Element;

    if (play.data.albumArtists !== undefined && play.data.albumArtists.length > 0) {
        albumArtistElm = (
            <DataList.Item flexGrow="1">
                <DataList.ItemLabel>Album Artists</DataList.ItemLabel>
                <DataList.ItemValue>
                    <ArtistCreditTags data={play.data.albumArtists} />
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
            } = {},
            musicService
        } = {}
    } = play;

    const titleLinks: React.JSX.Element[] = [];
    if (webUrl !== undefined || originUrl !== undefined) {
        titleLinks.push(<Link key="weblink" variant="underline" target="_blank" href={webUrl ?? originUrl}><Icon size="sm">{getMusicServiceIconElement(musicService)}</Icon></Link>);
    }
    if (brainz.track !== undefined) {
        titleLinks.push(<MusicbrainzInfoIcon type="track" mbid={brainz.track} tooltip link showMbid={showMbid} />)
    }
    if (brainz.recording !== undefined) {
        titleLinks.push(<MusicbrainzInfoIcon type="recording" mbid={brainz.recording} tooltip link showMbid={showMbid} />)
    }

    const titleElm = <HStack><Span>{track}</Span>{titleLinks}</HStack>

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
                            <ArtistCreditTags data={play.data.artists} showMbid={showMbid} />}
                    </DataList.ItemValue>
                </DataList.Item>
                {albumArtistElm}
                <DataList.Item flexGrow="1">
                    <DataList.ItemLabel>Album</DataList.ItemLabel>
                    <DataList.ItemValue>
                        <HStack>
                            {play.data.album}
                            <Show when={brainz.album !== undefined}>
                                <MusicbrainzInfoIcon type="release" mbid={brainz.album} link tooltip showMbid={showMbid} />
                            </Show>
                        </HStack>
                    </DataList.ItemValue>
                </DataList.Item>
            </DataList.Root>
            <DataList.Root flexWrap="wrap" flexDirection="row">
                <PlayDatesStack play={play} dates={dates} />
                <DataList.Item flexGrow="1" hideBelow="sm">
                    <DataList.ItemLabel>Duration</DataList.ItemLabel>
                    <DataList.ItemValue>
                        <Stack gap="1">
                            <Text textStyle="xs">Track Length: {duration === undefined ? 'N/A' : timeToHumanTimestamp(dayjs.duration(duration, 's'))}</Text>
                            {listenedFor !== undefined ? <Muted textStyle="xs">Listened For: {timeToHumanTimestamp(dayjs.duration(listenedFor, 's'))} ({formatNumber((listenedFor / duration) * 100)}%)</Muted> : null}
                        </Stack>
                    </DataList.ItemValue>
                </DataList.Item>
                <DataList.Item flexGrow="1" hideBelow="sm">
                    <DataList.ItemLabel>Repeat?</DataList.ItemLabel>
                    <DataList.ItemValue><Icon>{repeat ? <LuCheck /> : <LuX />}</Icon></DataList.ItemValue>
                </DataList.Item>
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

    let datesItem: React.JSX.Element | null;
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
            dateElements.push((<TextMuted key="seen">{`Seen ${shortTodayAwareFormat(dayjs(play.meta.seenAt))}`}</TextMuted>));
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

    let dateElm: React.JSX.Element;

    if (dates !== false) {
        let playDate: React.JSX.Element,
            seenDate: React.JSX.Element;
        if (play.data.playDate !== undefined && ['all', 'played'].includes(dates)) {
            playDate = <Text textStyle="xs" color="fg.muted">{`Played ${shortTodayAwareFormat(dayjs(play.data.playDate))}`}</Text>
        }
        // TODO implement seenAt for play data
        if (play.meta.seenAt !== undefined && ['all', 'seen'].includes(dates)) {
            seenDate = <Text textStyle="xs" color="fg.muted">{`Seen ${shortTodayAwareFormat(dayjs(play.meta.seenAt))}`}</Text>
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