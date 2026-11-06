import React, { type ComponentProps, useLayoutEffect, useRef } from "react"
import { useQuery } from "@tanstack/react-query";
import { Spinner, Stack, Wrap, HStack, Stat, Highlight, Flex, Text, LinkBox, LinkOverlay, Box, Span, Card, Heading, ScrollArea, Status, IconButton, Image, type TextProps } from '@chakra-ui/react';
import { type CountUpStat, CountUpValueText } from "./CountUpStat";
import { capitalize, capitalizeWords } from "../../core/StringUtils";
import { getMusicServiceIcon } from "./icons/ChakraIcons";
import { AvatarStack, type AvatarStackItem } from "./AvatarStack";
import type { PublicDashboardData, PublicPlay } from "../../core/Api";
import { TrackResultAlbumContent } from "./play/TrackSearch";
import { ArtistCreditTags } from "./ArtistCreditDisplay";
import { MusicServiceIndicatorStack } from "./musicServices/MusicServiceIndicators";
import { timeToHumanTimestamp } from "../../core/TimeUtils";
//import { PlayDataDataList } from "./play/PlayData";
import { tanQueries } from "../queries";
import { ErrorAlert } from "./ErrorAlert";
import { scrollShadowCss } from "./ScrollArea";
import { ToggleTip } from "./ToggleTip";

/** True when the public dashboard response has anything to show (the server returns {} when it is disabled) */
export const isPublicDashboardEnabled = (data?: PublicDashboardData): boolean => data !== undefined && Object.keys(data).length > 0;

/** Never poll faster than this, the server keeps the dashboard at least a few seconds anyway */
const MIN_REFETCH_SECONDS = 10;

/** The public dashboard, polled right after the server cache expires while Now Playing is enabled */
export const usePublicDashboard = () => useQuery({
    ...tanQueries.dashboard.public(),
    // only Now Playing needs to stay current
    refetchInterval: (query) => {
        const res = query.state.data;
        if (res?.data.nowPlaying === undefined) {
            return false;
        }
        return Math.max((res.maxAge ?? 0) + 1, MIN_REFETCH_SECONDS) * 1000;
    },
});

export const PublicDashboardFetchable = () => {
    const { isPending, isError, data, error } = usePublicDashboard();
    if (isPending) {
        return <Flex justify="center" py="8"><Spinner/></Flex>;
    }
    if (isError) {
        return <ErrorAlert error={error}/>;
    }
    return <PublicDashboard {...data.data}/>;
}

export const PublicDashboard = (props: PublicDashboardData) => {
    const {
        recent,
        nowPlaying
    } = props;
    return (
        <Stack gap="10">
            <CountStats {...props} />
            <ComponentStats {...props} />
            <RecentPublicPlaysScrollable data={recent} nowPlaying={nowPlaying} />
            <CallToAction />
        </Stack>
    )
}

/** Link to the docs, with the logo in front when `logo` (the embed has no header that shows it) */
export const CallToAction = (props: {textStyle?: TextProps['textStyle'], logo?: boolean}) => (
    <Flex justify="space-evenly">
        <LinkBox>
            <LinkOverlay href="https://docs.multi-scrobbler.app" target="_blank" rel="noopener">
                <HStack gap="2">
                    {props.logo ? <Image src="icon.svg" alt="" height="1.5em" width="auto"/> : undefined}
                    <Text textStyle={props.textStyle ?? 'xl'} letterSpacing="tight">
                        <Highlight query={['anywhere', 'everywhere']} styles={{ color: "#e1553d" }}>
                            Listen anywhere, Scrobble everywhere
                        </Highlight>
                    </Text>
                </HStack>
            </LinkOverlay>
        </LinkBox>
    </Flex>
);

export const CountStats = (props: Pick<PublicDashboardData, 'scrobbles' | 'plays' | 'listened'>) => {
    const statProps: ComponentProps<typeof CountUpStat>[] = [];
    if (props.plays !== undefined) {
        statProps.push({ value: props.plays, label: 'Plays' });
    }
    if (props.scrobbles !== undefined) {
        statProps.push({ value: props.scrobbles, label: 'Scrobbles' });
    }
    if (props.listened !== undefined) {
        statProps.push({ value: props.listened / 60, label: 'Listened For', helpText: 'Minutes' });
    }
    if (statProps.length === 0) {
        return undefined;
    }
    return <Wrap gap="10" justify="space-evenly">{statProps.map((x, i) => (
        // Stat.Root has flex: 1 by default, which would stretch a wrapped item to the full row and left align it
        <Stat.Root key={i} size="lg" flex="none">
            <Stat.Label textStyle="3xl">{x.label}</Stat.Label>
            <CountUpValueText abbreviate={{ minDigits: 6, maxDecimals: 2 }} textStyle="6xl" {...x} />
            {x.helpText !== undefined && <Stat.HelpText textStyle="lg">{x.helpText}</Stat.HelpText>}
        </Stat.Root>
    ))}</Wrap>
}

export const ComponentStats = (props: Pick<PublicDashboardData, 'sources' | 'clients'>) => {
    const componentStats: React.JSX.Element[] = [];
    const wrapRef = useRef<HTMLDivElement>(null);
    // every stat gets the width of the widest one, so when they wrap (each centered in its own row) their left aligned headers still line up.
    // css can't do "equal to the widest item" and wrap at the same time (auto-fit grids need a fixed track size)
    useLayoutEffect(() => {
        const wrap = wrapRef.current;
        if (wrap === null) {
            return;
        }
        const stats = Array.from(wrap.querySelectorAll<HTMLElement>('[data-component-stat]'));
        const measure = () => {
            const widest = Math.max(...stats.map(x => x.getBoundingClientRect().width));
            wrap.style.setProperty('--component-stat-width', `${Math.ceil(widest)}px`);
        };
        const observer = new ResizeObserver(measure);
        stats.forEach(x => observer.observe(x));
        return () => observer.disconnect();
    }, [props.sources, props.clients]);
    for (const [key, val] of Object.entries(props)) {
        if (key !== 'sources' && key !== 'clients') {
            continue;
        }
        let avatarItems: AvatarStackItem[] = [];
        if (val.types !== undefined) {
            avatarItems = val.types.map((x) => {
                const Icon = getMusicServiceIcon(x);
                if (Icon !== undefined) {
                    return {
                        name: capitalizeWords(x),
                        icon: Icon
                    }
                }
                return {
                    name: capitalizeWords(x)
                }
            })
        }
        componentStats.push(<HStack key={key} minWidth="var(--component-stat-width)">
            {/* flex none: measured at its content width, not stretched to the shared width */}
            <Stat.Root flex="none" data-component-stat="">
                <Stat.Label textStyle="3xl">{capitalize(key)}</Stat.Label>
                <HStack>
                    <CountUpValueText delay={componentStats.length * 300} textStyle="6xl" value={val.count} />
                    {avatarItems.length > 0 ? <AvatarStack spread="0.5" reserveSpread items={avatarItems} /> : undefined}
                </HStack>
            </Stat.Root>
        </HStack>);
    }
    if (componentStats.length === 0) {
        return undefined;
    }
    return <Wrap ref={wrapRef} gap="10" justify="space-evenly">{componentStats}</Wrap>
}

export const PublicPlayCompactItem = (props: { play: PublicPlay }) => {

    const {
        track,
        album,
        duration,
        artists = []
    } = props.play.data;

    let albumContent: React.JSX.Element | undefined = undefined;
    if (album !== undefined) {
        albumContent = <TrackResultAlbumContent data={{ ...album, id: 'noop' }} />;
    }

    let artistTags: React.JSX.Element | undefined = undefined;
    if (artists.length > 0) {
        artistTags = <ArtistCreditTags data={artists} stack={{ring: false}} />
    }

    return (
        <HStack gap="4" flexGrow="1">
            <Stack gap="1" flexGrow="1">
                <Box display="flow-root">
                    {track?.name}{' '}
                    {duration !== undefined ? <Span>({timeToHumanTimestamp(duration * 1000)}) </Span> : undefined}
                    <MusicServiceIndicatorStack display="inline-flex" verticalAlign="middle" services={track?.metadata ?? []} />
                </Box>
                {artistTags}
                {albumContent}
            </Stack>
        </HStack>
    )
}

// eslint-disable-next-line arrow-body-style
export const PublicPlayData = (props: { play: PublicPlay }) => {
    return (<Box>
        {/* <Box hideBelow="md">
            <PlayDataDataList dates={false} play={props.play} />
        </Box>
        <Box hideFrom="md">
            <PublicPlayCompactItem play={props.play} />
        </Box> */}
        <PublicPlayCompactItem play={props.play} />
    </Box>)

}

export interface RecentPublicPlaysProps {
    data?: PublicPlay[]
    /** shown first, marked as Now Playing */
    nowPlaying?: PublicPlay | null
}

const NowPlayingIndicator = () => (
    <ToggleTip content="Now Playing" showArrow positioning={{placement: 'top'}}>
        <IconButton variant="ghost" size="2xs" aria-label="Now Playing">
            <Status.Root>
                <Status.Indicator colorPalette="green" style={{animation: 'icon-fade-half 3s infinite linear'}}/>
            </Status.Root>
        </IconButton>
    </ToggleTip>
);

/** Hidden when both Recent and Now Playing are disabled */
export const RecentPublicPlaysList = (props: RecentPublicPlaysProps) => {
    const {data, nowPlaying} = props;
    if (data === undefined && nowPlaying === undefined) {
        return undefined;
    }
    const plays = [
        ...(nowPlaying !== undefined && nowPlaying !== null ? [{play: nowPlaying, now: true}] : []),
        ...(data ?? []).map(play => ({play, now: false})),
    ];
    if (plays.length === 0) {
        return <Flex justify="space-evenly"><Text>Nothing played recently!</Text></Flex>;
    }
    return (
        <Stack gapY={3} >
            {plays.map((x, i) => (
                <Card.Root width="full" variant="subtle" key={i} size="sm">
                    <Card.Body>
                        <HStack align="start">
                            <Box flexGrow="1"><PublicPlayData play={x.play} /></Box>
                            {x.now ? <NowPlayingIndicator/> : undefined}
                        </HStack>
                    </Card.Body>
                </Card.Root>
            ))}
        </Stack>
    );
}

export const RecentPublicPlaysPlain = (props: RecentPublicPlaysProps) => {
    if (props.data === undefined && props.nowPlaying === undefined) {
        return undefined;
    }
    return (
        <Flex justify="center">
            <Stack width="full" maxW="500px">
                <Heading color="fg.muted" textStyle="2xl">Recent</Heading>
                <RecentPublicPlaysList {...props}/>
            </Stack>
        </Flex>
    )
}

export const RecentPublicPlaysScrollable = (props: RecentPublicPlaysProps) => {
    if (props.data === undefined && props.nowPlaying === undefined) {
        return undefined;
    }
    // base + sm 25rem
    return (
        <Flex justify="center">
            <Stack width="full" maxW="500px">
                <Heading color="fg.muted" textStyle="2xl">Recent</Heading>
                <ScrollArea.Root mdDown={{maxHeight: '25rem'}} maxHeight="35rem">
                    <ScrollArea.Viewport css={scrollShadowCss}>
                        <ScrollArea.Content spaceY="4">
                            <RecentPublicPlaysList {...props}/>
                        </ScrollArea.Content>
                    </ScrollArea.Viewport>
                </ScrollArea.Root>
            </Stack>
        </Flex>
    )
}