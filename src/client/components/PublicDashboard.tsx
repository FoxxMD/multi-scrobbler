import React, { type ComponentProps } from "react"
import { useQuery } from "@tanstack/react-query";
import { Spinner, Stack, Wrap, HStack, Stat, Highlight, Flex, Text, LinkBox, LinkOverlay, Box, Span, Card, Heading } from '@chakra-ui/react';
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

/** True when the public dashboard response has anything to show (the server returns {} when it is disabled) */
export const isPublicDashboardEnabled = (data?: PublicDashboardData): boolean => data !== undefined && Object.keys(data).length > 0;

export const PublicDashboardFetchable = () => {
    const { isPending, isError, data, error } = useQuery(tanQueries.dashboard.public());
    if (isPending) {
        return <Flex justify="center" py="8"><Spinner/></Flex>;
    }
    if (isError) {
        return <ErrorAlert error={error}/>;
    }
    return <PublicDashboard {...data}/>;
}

export const PublicDashboard = (props: PublicDashboardData) => {
    const {
        recent
    } = props;
    return (
        <Stack gap="10">
            <CountStats {...props} />
            <ComponentStats {...props} />
            <RecentPublicPlays data={recent} />
            <CallToAction />
        </Stack>
    )
}

const CallToAction = () => (
    <Flex justify="space-evenly">
        <LinkBox>
            <LinkOverlay href="https://docs.multi-scrobbler.app" target="_blank">
                <Text textStyle="xl" letterSpacing="tight">
                    <Highlight query={['anywhere', 'everywhere']} styles={{ color: "#e1553d" }}>
                        Listen anywhere, Scrobble everywhere
                    </Highlight>
                </Text>
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
        componentStats.push(<HStack key={key}>
            <Stat.Root>
                <Stat.Label textStyle="3xl">{capitalize(key)}</Stat.Label>
                <HStack>
                    <CountUpValueText delay={componentStats.length * 300} textStyle="6xl" value={val.count} />
                    {avatarItems.length > 0 ? <AvatarStack spread="0.5" items={avatarItems} /> : undefined}
                </HStack>
            </Stat.Root>
        </HStack>);
    }
    if (componentStats.length === 0) {
        return undefined;
    }
    return <Wrap gap="10" justify="space-evenly">{componentStats}</Wrap>
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

export const RecentPublicPlays = (props: { data?: PublicPlay[] }) => {
    if (props.data === undefined) {
        return undefined;
    }
    let recentContent: React.JSX.Element;
    if (props.data.length === 0) {
        recentContent = <Flex justify="space-evenly"><Text>Nothing played recently!</Text></Flex>
    } else {
        recentContent = (
            <Stack gapY={3} >
                {props.data.map((x, i) => (
                    <Card.Root width="full" variant="subtle" key={i} size="sm">
                        <Card.Body>
                            <PublicPlayData play={x} />
                        </Card.Body>
                    </Card.Root>
                ))}
            </Stack>
        )
    }
    return (
        <Flex justify="center">
            <Stack width="full" maxW="500px">
                <Heading color="fg.muted" textStyle="2xl">Recent</Heading>
                {recentContent}
            </Stack>
        </Flex>
    )
}