import React, { ComponentProps, useMemo, forwardRef, Fragment, useState, useEffect, useCallback } from "react"
import { Accordion, Highlight, Em, Progress, For, Span, Stack, Spacer, Bleed, Text, Image, Box, Heading, AbsoluteCenter, Button, Separator, HStack, Flex, Center, Badge, IconButton, Container, Collapsible, Card, LinkOverlay, LinkBox } from '@chakra-ui/react';
import { TextMuted } from "../TextMuted";
import { SOURCE_SOT, SOURCE_SOT_TYPES, SourcePlayerJson } from "../../../core/Atomic";
import { timeToHumanTimestamp } from "../../../core/TimeUtils";
import { capitalize } from "../../../core/StringUtils";
import { QueryFunctionContext, queryOptions, useQuery, useQueryClient } from '@tanstack/react-query';
import { ErrorAlert } from "../ErrorAlert";
import ky from 'ky';
import { baseUrl } from "../../utils";
import {
    useSSEAnyEvent,
  useSSEContext,
  useSSEEvent,
} from "@flamefrontend/sse-runtime-react";
import { ComponentCommonApiJson, ComponentSourceApiJson, isComponentClientApiJson, isComponentSourceApiJson, MsSseEvent, MsSseEventPayload } from "../../../core/Api";
import LinearProgress from '@mui/material/LinearProgress';
import { InfoTip, ToggleTip } from "../ToggleTip";
import { tanQueries } from "../../queries";
import dayjs from "dayjs";
import { MSErrorBoundary } from "../ErrorBoundary";

export interface PlayerProps {
    data: SourcePlayerJson & {expiration?: string}
    nowPlaying?: boolean
    sot?: SOURCE_SOT_TYPES
}

const bufferExplanation = (<>
    <Text mb="2">
        The <Span bg="var(--chakra-colors-color-palette-solid)" color="var(--chakra-colors-color-palette-contrast)">reported bar</Span> is the <Em>real, reported</Em> position by the upstream service.</Text>
    <Text>
        The <Span bg="var(--chakra-colors-color-palette-500)" color="var(--chakra-colors-color-palette-contrast)">buffer bar</Span> is the <Em>calculated</Em> real-time position.
        </Text>
        <Text>This is reflected in the position timestamp and corrected when the reported position is updated.</Text>
</>);

export const ChakraPlayer = (props: PlayerProps) => {

    const {
        data,
        nowPlaying = false,
        sot = SOURCE_SOT.PLAYER
    } = props;

    const {
        play: {
            data: {
                track = '???',
                artists = [{ name: '???' }],
                duration = 0
            } = {},
            meta: {
                art = {},
            } = {}
        } = {},
        play,
        listenedDuration = 0,
        nowPlayingMode = false,
        status: {
            calculated = '???',
            reported,
            stale,
            orphaned
        } = {},
        expiration
    } = data;

    const [positionBuffer, setProgressBuffer] = useState<undefined | number>(undefined);
    const [intervalId, setIntervalId] = useState<undefined | number>(undefined);
    const [lastUpdated, setLastUpdated] = useState<undefined | number>(undefined);
    const playArt = art.track ?? art.album ?? art.artist ?? undefined;

    const isNowPlaying = nowPlaying || nowPlayingMode;

    let durPer = null;
    if (!isNowPlaying) {
        if (duration !== undefined && duration !== null && duration !== 0) {
            if (listenedDuration === 0 || listenedDuration === null) {
                durPer = ' (0%)';
            } else {
                durPer = ` (${((listenedDuration / duration) * 100).toFixed(0)}%)`;
            }
        }
    }

    // this effect block is used to set the buffer progress using a realtime counter (setinterval)
    // we only set this as "active" if the player has reported it is calculated playing and we have position
    // -- then we update the buffer position to increment one second every second
    // this is reset to undefined if the valid player state changes to invalid (not playing)
    // or reset to the player position if props change but state stays valid (last reported position from upstream service)
    useEffect(() => {
        // abusing useState a little bit here...
        // need to clear interval on the old id if props have changed
        // but cannot use interval id in useEffect or it causes circular dependencies since we set intervalId here too
        // so clear inside the set state function (bad) using the previous data argument, before returning new value
        let interval;
        if(!isNowPlaying && data.status?.calculated === 'playing' && data.position !== undefined && !data.status?.stale && !data.status?.orphaned) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setProgressBuffer(data.position);
            interval = setInterval(() => {
                setProgressBuffer((oldPosition) => {
                    if(data.play.data.duration !== undefined) {
                        return Math.min(data.play.data.duration, oldPosition + 1);
                    }
                    return oldPosition + 1;
                });
            }, 1000);
            setIntervalId((old) => {
                if(old !== undefined) {
                    clearInterval(old);
                }
                return interval;
            });
        } else if(isNowPlaying) {
            interval = setInterval(() => {
                // force now playing-only player to re-render
                // so we can stop rendering it if it passes expiration date
                setLastUpdated(dayjs().unix());
            }, 1000);
            setIntervalId((old) => {
                if(old !== undefined) {
                    clearInterval(old);
                }
                return interval;
            });
        } else {
            setProgressBuffer(undefined);
            if(intervalId !== undefined) {
                setIntervalId((old) => {
                    if(old !== undefined) {
                        clearInterval(old);
                    }
                    return undefined;
                });
            }
        }
        return () => clearInterval(interval);
    },[setProgressBuffer, data, setIntervalId, setLastUpdated, isNowPlaying]);

    if(expiration !== undefined && dayjs().isAfter(dayjs(expiration))) {
        return null;
    }

    const indeterminate = isNowPlaying || (calculated === 'playing' && data.position === undefined);
    const positionProgress = indeterminate || data.position === undefined || duration === undefined ? undefined : Math.trunc((data.position/duration) * 100);
    const bufferProgress = indeterminate || data.position === undefined || duration === undefined || positionBuffer === undefined ? undefined : Math.trunc((positionBuffer/duration) * 100);
    const positionTimestamp = indeterminate || data.position === undefined ? '-' : timeToHumanTimestamp((positionBuffer ?? data.position) * 1000);
    const durationTimestamp = duration === undefined ? '-' : timeToHumanTimestamp(duration * 1000);

    const bufferTip = positionBuffer !== undefined ? <InfoTip positioning={{placement: "bottom-start"}} buttonProps={{height: 'var(--chakra-sizes-4)'}} content={bufferExplanation}/> : null;
     
    return (
    <MSErrorBoundary>
        <Container className="playerContainer" bg="bg.emphasized" borderWidth="1px" p="2" py="3" rounded="md">
            <Stack gap="2">
                    <Flex gap="4" align="center">
                        {playArt !== undefined ? <Image minWidth="48px" flex="0" height="100%" width="100%" src={playArt}></Image> : null}
                        <Center flex="1">
                            <Stack textAlign="center">
                                <Heading textWrap="balance" size="md">{calculated !== 'stopped' ? track : '-'}</Heading>
                                <TextMuted>{calculated !== 'stopped' ? artists.map(x => x.name).join(' / ') : '-'}</TextMuted>
                            </Stack>
                        </Center>
                    </Flex>
                    <HStack gap="5">
                        <Text textStyle="sm">{positionTimestamp}</Text>
                        <Box flex="1">
                        <LinearProgress
                        variant={indeterminate ? undefined : "buffer"}
                        
                        value={positionProgress}
                        valueBuffer={Math.max(bufferProgress ?? positionProgress, positionProgress)}
                        />
                        </Box>
                        <Text textStyle="xs">{durationTimestamp}</Text>
                    </HStack>
                    {/* <Progress.Root value={indeterminate || data.position === undefined || duration === undefined ? null : (data.position/duration) * 100} size="sm">
                        <HStack gap="5">
                            <Progress.Label>{positionTimestamp}</Progress.Label>
                            <Progress.Track flex="1">
                                <Progress.Range />
                            </Progress.Track>
                            <Progress.ValueText>{durationTimestamp}</Progress.ValueText>
                        </HStack>
                    </Progress.Root> */}
                    <Flex alignItems="center">
                        <TextMuted>{['unknown', 'playing'].includes(calculated) && isNowPlaying ? 'Now Playing' : capitalize(calculated)}{!isNowPlaying ? bufferTip : null}</TextMuted>
                        <Spacer />
                        <TextMuted>Listened: {isNowPlaying !== true && calculated !== 'stopped' && listenedDuration !== null ? `${listenedDuration.toFixed(0)}s` : '-'}{durPer}</TextMuted>
                    </Flex>
                </Stack>
            </Container>
        </MSErrorBoundary>
        )
    
}

export interface ChakraPlayerFetchableProps {
    componentId: number
    nowPlaying?: boolean
    platformId: string
    data?: SourcePlayerJson
    sot?: SOURCE_SOT_TYPES
}

export const ChakraPlayerFetchable = (props: ChakraPlayerFetchableProps) => {
    const {
        componentId,
        nowPlaying,
        platformId,
        data: initData,
        sot
    } = props;
    const { isPending, isError, data, error } = usePlayerQuery(componentId, platformId, {initData});

    if (isError) {
        return <ErrorAlert error={error} />
    }

    if (!isPending) {
        return <ChakraPlayer nowPlaying={nowPlaying} data={data} sot={sot} />
    }
}

type UsePlayerQueryOpts = {
    initData?: SourcePlayerJson
}

export const usePlayerQuery = (componentId: number, platformId: string, opts: UsePlayerQueryOpts = {}) => {
    const { initData } = opts;
    const queryClient = useQueryClient();
    useEffect(() => {
        if (initData !== undefined && queryClient.getQueryData(tanQueries.players.single(componentId, platformId).queryKey) === undefined) {
            queryClient.setQueryData(tanQueries.players.single(componentId, platformId).queryKey, initData);
        }
    }, [initData, componentId, platformId]);

    const client = useSSEContext<MsSseEvent<MsSseEventPayload<SourcePlayerJson>>>();
    useSSEEvent(client, "playerUpdate", (payload) => {
        if (payload.componentId === componentId && payload.data.platformId === platformId) {
            queryClient.setQueryData(tanQueries.players.single(componentId, platformId).queryKey, payload.data);
        }
    });

    const { isPending, isError, data, error } = useQuery({
        ...tanQueries.players.single(componentId, platformId),
        staleTime: Infinity,
    });

    return { data, isPending, isError, error };
}

export const PlayersContainer = (props: { data: ComponentCommonApiJson, live?: boolean, nowPlaying?: boolean, stack?: ComponentProps<typeof Stack>, container?: ComponentProps<typeof Container> }) => {
    const {
        data,
        nowPlaying,
        live,
        container = {},
        stack = {}
    } = props;

        const {
            players = {}
        } = data;

        const playerContainers: React.JSX.Element[] = [];
        // const isSource = isComponentSourceApiJson(data);
        // const now = dayjs();
        if (Object.keys(players).length > 0) {
            for(const [key, x] of Object.entries(players)) {
                // if(!isSource && 'expiration' in x) {
                //     const expiresAt = dayjs(x.expiration as string);
                //     if(now.isAfter(expiresAt)) {
                //         continue;
                //     }
                // }
                playerContainers.push(
                live ? <ChakraPlayerFetchable key={key} nowPlaying={nowPlaying} componentId={data.id} platformId={key} data={x} /> : <ChakraPlayer key={key} nowPlaying={nowPlaying} data={x} />
                );
            };
        }
        // if(playerContainers.length > 0) {
        //     return <Stack gap="2" {...stack}>
        //         {playerContainers}
        //     </Stack>;
        // }
        // return null;

        return <Stack gap="2" width="100%" {...stack}>
                {playerContainers}
            </Stack>;
}

const usePlayersQuery = (componentId: number, players?: ComponentCommonApiJson['players']) => {
    const queryClient = useQueryClient();

    useEffect(() => {
        if(queryClient.getQueryData(tanQueries.players.list(componentId).queryKey) === undefined) {
            queryClient.setQueryData(tanQueries.players.list(componentId).queryKey, players ?? {});
        }
    }, [players, componentId]);

    const client = useSSEContext<MsSseEvent>();
    useSSEAnyEvent(client, (payload) => {
        if('componentId' in (payload.data as object) && (payload.data as Record<string, any>).componentId === componentId) {
            switch(payload.type) {
                case 'playerUpdate': {
                    const playerPayload = payload.data as MsSseEventPayload<SourcePlayerJson>;
                    queryClient.setQueryData(tanQueries.players.list(componentId).queryKey, (old: Record<string, SourcePlayerJson>) => {
                        if(old[playerPayload.data.platformId] === undefined || 'expiration' in playerPayload.data) {
                            const newData: Record<string, SourcePlayerJson> = {...old};
                            newData[playerPayload.data.platformId] = playerPayload.data;
                            return newData;
                        }
                    });
                }
                    break;
                case 'playerDelete':{
                    const playerPayload = payload.data as MsSseEventPayload<{platformId: string}>;
                    queryClient.setQueryData(tanQueries.players.list(componentId).queryKey, (old: Record<string, SourcePlayerJson>) => {
                        if(old[playerPayload.data.platformId] !== undefined) {
                            const newData: Record<string, SourcePlayerJson> = {...old};
                            delete newData[playerPayload.data.platformId];
                            return newData;
                        }
                    });
                }
                    break;
            }
        }
    });

    const { isPending, isError, data = {}, error } = useQuery({
        ...tanQueries.players.list(componentId),
        staleTime: Infinity,
    });

    return {isPending, isError, data, error};
}

export const PlayersContainerFetchable = (props: { data: ComponentCommonApiJson, live?: boolean, nowPlaying?: boolean, stack?: ComponentProps<typeof Stack>, container?: ComponentProps<typeof Container> }) => {
    const {
        data: initData,
        nowPlaying,
        live = true,
        container = {},
        stack =  {}
    } = props;

        const { isPending, isError, data = {}, error } = usePlayersQuery(initData.id, initData.players);

        const mergedData = useMemo(() => ({...initData, players: data}),[initData,data]);

        return <PlayersContainer nowPlaying={nowPlaying} data={mergedData} live container={container} stack={stack}/>
}