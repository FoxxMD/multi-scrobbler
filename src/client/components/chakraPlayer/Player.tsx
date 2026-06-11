import React, { ComponentProps, useMemo, forwardRef, Fragment } from "react"
import { Accordion, Progress, For, Span, Stack, Spacer, Text, Image, Box, Heading, AbsoluteCenter, Button, Separator, HStack, Flex, Center, Badge, IconButton, Container, Collapsible, Card, LinkOverlay, LinkBox } from '@chakra-ui/react';
import { TextMuted } from "../TextMuted";
import { SOURCE_SOT, SOURCE_SOT_TYPES, SourcePlayerJson } from "../../../core/Atomic";
import { timeToHumanTimestamp } from "../../../core/TimeUtils";
import { capitalize } from "../../../core/StringUtils";

export interface PlayerProps {
    data: SourcePlayerJson
    sot?: SOURCE_SOT_TYPES
}

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
        }
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

    const indeterminate = nowPlayingMode || (calculated === 'playing' && data.position === undefined);

     
    return    <Stack gap="2">
            <Flex gap="4" align="center">
                {playArt !== undefined ? <Image minWidth="48px" flex="0" height="100%" width="100%" src={playArt}></Image> : null}
                <Center flex="1">
                    <Stack textAlign="center">
                        <Heading textWrap="balance" size="md">{calculated !== 'stopped' ? track : '-'}</Heading>
                        <TextMuted>{calculated !== 'stopped' ? artists.map(x => x.name).join(' / ') : '-'}</TextMuted>
                    </Stack>
                </Center>
            </Flex>
            <Progress.Root value={indeterminate || data.position === undefined || duration === undefined ? null : (data.position/duration) * 100} size="sm">
                <HStack gap="5">
                    <Progress.Label>{indeterminate || data.position === undefined ? '-' : timeToHumanTimestamp(data.position * 1000)}</Progress.Label>
                    <Progress.Track flex="1">
                        <Progress.Range />
                    </Progress.Track>
                    <Progress.ValueText>{duration === undefined ? '-' : timeToHumanTimestamp(duration * 1000)}</Progress.ValueText>
                </HStack>
            </Progress.Root>
            <Flex>
                <TextMuted>{['unknown', 'playing'].includes(calculated) && nowPlayingMode ? 'Now Playing' : capitalize(calculated)}</TextMuted>
                <Spacer />
                <TextMuted textAlign="right">Listened: {nowPlayingMode !== true && calculated !== 'stopped' && listenedDuration !== null ? `${listenedDuration.toFixed(0)}s` : '-'}{durPer}</TextMuted>
            </Flex>
        </Stack>
    
}