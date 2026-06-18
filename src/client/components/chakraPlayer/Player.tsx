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
  useSSEContext,
  useSSEEvent,
} from "@flamefrontend/sse-runtime-react";
import { ComponentCommonApiJson, isComponentSourceApiJson, MsSseEvent, MsSseEventPayload } from "../../../core/Api";
import LinearProgress from '@mui/material/LinearProgress';
import { InfoTip, ToggleTip } from "../ToggleTip";

export interface PlayerProps {
    data: SourcePlayerJson
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
        } = {}
    } = data;

    const playArt = art.track ?? art.album ?? art.artist ?? undefined;

    let durPer = null;
    if (!nowPlayingMode) {
        if (duration !== undefined && duration !== null && duration !== 0) {
            if (listenedDuration === 0 || listenedDuration === null) {
                durPer = ' (0%)';
            } else {
                durPer = ` (${((listenedDuration / duration) * 100).toFixed(0)}%)`;
            }
        }
    }

    const [positionBuffer, setProgressBuffer] = useState<undefined | number>(undefined);
    const [intervalId, setIntervalId] = useState<undefined | number>(undefined);


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
        if(data.status?.calculated === 'playing' && data.position !== undefined && !data.status?.stale && !data.status?.orphaned) {
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
    },[setProgressBuffer, data, setIntervalId]);

    const indeterminate = nowPlayingMode || (calculated === 'playing' && data.position === undefined);
    const positionProgress = indeterminate || data.position === undefined || duration === undefined ? undefined : (data.position/duration) * 100;
    const bufferProgress = indeterminate || data.position === undefined || duration === undefined || positionBuffer === undefined ? undefined : (positionBuffer/duration) * 100;
    const positionTimestamp = indeterminate || data.position === undefined ? '-' : timeToHumanTimestamp((positionBuffer ?? data.position) * 1000);
    const durationTimestamp = duration === undefined ? '-' : timeToHumanTimestamp(duration * 1000);

    const bufferTip = positionBuffer !== undefined ? <InfoTip positioning={{placement: "bottom-start"}} buttonProps={{height: 'var(--chakra-sizes-4)'}} content={bufferExplanation}/> : null;
     
    return <Stack gap="2">
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
                valueBuffer={bufferProgress ?? positionProgress}
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
                <TextMuted>{['unknown', 'playing'].includes(calculated) && nowPlayingMode ? 'Now Playing' : capitalize(calculated)}{bufferTip}</TextMuted>
                <Spacer />
                <TextMuted>Listened: {nowPlayingMode !== true && calculated !== 'stopped' && listenedDuration !== null ? `${listenedDuration.toFixed(0)}s` : '-'}{durPer}</TextMuted>
            </Flex>
        </Stack>
    
}

export interface ChakraPlayerFetchableProps {
    componentId: number
    platformId: string
    data: SourcePlayerJson
    sot?: SOURCE_SOT_TYPES
}

export const ChakraPlayerFetchable = (props: ChakraPlayerFetchableProps) => {
    const {
        componentId,
        platformId,
        data: initData,
        sot
    } = props;
    const queryClient = useQueryClient();
    const qKey = ['components', componentId, 'players', platformId];
    useEffect(() => {
        if (initData !== undefined && queryClient.getQueryData(qKey) === undefined) {
            queryClient.setQueryData(['components', componentId, 'players', platformId], initData);
        }
    }, [initData]);

    const client = useSSEContext<MsSseEvent<MsSseEventPayload<SourcePlayerJson>>>();
    useSSEEvent(client, "playerUpdate", (payload) => {
        if (payload.componentId === componentId && payload.data.platformId === platformId) {
            queryClient.setQueryData(['components', componentId, 'players', platformId], payload.data);
        }
    });

    const { isPending, isError, data, error } = useQuery({
        queryKey: ['components', componentId, 'players', platformId],
        queryFn: queryFn,
        staleTime: Infinity,
    });

    if (isError) {
        return <ErrorAlert error={error} />
    }

    if (!isPending) {
        return <ChakraPlayer data={data} sot={sot} />
    }
}

type PlayerQueryKey = ['components', number, 'players', string];
const queryFn = async (context: QueryFunctionContext<PlayerQueryKey>) => {
    return await ky.get(`sources/${context.queryKey[1]}/players/${context.queryKey[3]}`, { baseUrl: baseUrl }).json() as SourcePlayerJson;
}

export const PlayersContainer = (props: { data: ComponentCommonApiJson, live?: boolean, container?: ComponentProps<typeof Container> }) => {
    const {
        data,
        live,
        container = {}
    } = props;
    if (isComponentSourceApiJson(data)) {
        const {
            players = {}
        } = data;
        if (Object.keys(players).length > 0) {
            return <Stack gap="2">
                {
                    Object.entries(players).map(([key, x]) => (
                        <Container bg="bg.emphasized" borderWidth="1px" p="2" py="3" rounded="md" {...container}>
                            {live ? <ChakraPlayerFetchable componentId={data.id} platformId={key} data={x} /> : <ChakraPlayer data={x} />}
                        </Container>
                    ))
                }
            </Stack>;
        }
        return null;
    }
    return null;
}