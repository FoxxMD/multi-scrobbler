import React, { ComponentProps, useMemo, forwardRef, Fragment, useEffect, useState, useCallback } from "react"
import { DataList, Badge, Box, Heading, Skeleton, Stat, Separator, HStack, Flex, Collapsible, Card, LinkOverlay, LinkBox, SkeletonText } from '@chakra-ui/react';
import { COMPONENT_STATE, ComponentClientApiJson, ComponentCommonApiJson, ComponentSourceApiJson, componentStateToFriendly, isComponentClientApiJson, isComponentSourceApiJson, MsSseEvent, MsSseEventPayload } from "../../../core/Api.js";
import { TextMuted } from "../TextMuted.js";
import { isClientType } from "../../../backend/common/infrastructure/Atomic.js";
import { capitalize } from "../../../core/StringUtils.js";
import { ShortDateDisplay } from "../DateDisplay.js";
import { ChevronRightButton, DownArrowIcon, UpArrowIcon } from "../icons/ChakraIcons.js";
import { ChakraPlayer, ChakraPlayerFetchable } from "../chakraPlayer/Player.js";
import { InfoTip } from "../ToggleTip.js";
import { QueryFunctionContext, queryOptions, useQuery, useQueryClient } from '@tanstack/react-query';
import { ErrorAlert } from "../ErrorAlert";
import ky from 'ky';
import { baseUrl } from "../../utils";
import { useTimeout } from 'react-use-timeout';
import {
    useSSEContext,
    useSSEEvent,
    useSSEAnyEvent
} from "@flamefrontend/sse-runtime-react";

export const CountLiveIndicator = (props: {
    data: Pick<ComponentCommonApiJson, 'countLive' | 'mode' | 'id'> & { tracksDiscovered?: number, scrobbled?: number },
    recent?: number
    recentTimeout?: number
    streamable?: boolean
    as?: 'text' | 'stat'
}) => {

    const {
        as = 'stat'
    } = props;

    const sessionCount = props.data.mode === 'source' ? props.data.tracksDiscovered : props.data.countLive;

    const [total, setTotal] = useState(props.data.countLive);
    const [current, setCurrent] = useState(sessionCount);
    const [recent, setRecent] = useState(0);
    const resetRecent = useCallback(() => {
        setRecent(props.recent ?? 0);

    }, [setRecent]);
    const recentTimeout = useTimeout(resetRecent, props.recentTimeout ?? 10000);

    if (props.streamable) {
        const client = useSSEContext<MsSseEvent>();
        useSSEAnyEvent(client, (payload) => {
            if ('componentId' in (payload.data as object) && (payload.data as Record<string, any>).componentId === props.data.id) {
                switch (payload.type) {
                    case 'scrobble':
                    case 'discovered':
                        recentTimeout.stop();
                        setTotal(total + 1);
                        setCurrent(current + 1);
                        setRecent(recent + 1);
                        recentTimeout.start();
                        break;
                }
            }
        });
    }

    if (as === 'stat') {
        return (
            <Stat.Root>
                <Stat.Label>{props.data.mode === 'source' ? 'Discovered' : 'Scrobbled'}</Stat.Label>
                <HStack>
                    {/* <InfoTip>{props.data.mode === 'source' ? 'Discovered' : 'Scrobbled'} since start and (Total)</InfoTip> */}
                    <Stat.ValueText>{current} ({total})</Stat.ValueText>
                    {recent !== 0 ? <Badge colorPalette="green" gap="0">
                        <Stat.UpIndicator />
                        {recent}
                    </Badge> : null}
                </HStack>
                <Stat.HelpText>Since restart and (Total)</Stat.HelpText>
            </Stat.Root>
        );
    }

    return (
        <TextMuted textStyle="sm">{current} ({total}) {recent !== 0 ? <Badge colorPalette="green" size="sm" gap="0">
            <UpArrowIcon color="green" />
            {recent}
        </Badge> : null} {props.data.mode === 'source' ? 'Discovered' : 'Scrobbled'}</TextMuted>
    );
}

export const QueuedIndicator = (props: {
    data: Pick<ComponentClientApiJson, 'mode' | 'id' | 'queued'>,
    recent?: number
    recentTimeout?: number
    streamable?: boolean
    as?: 'text' | 'stat'
}) => {

    const {
        as = 'stat'
    } = props;

    const [current, setCurrent] = useState(props.data.queued);
    const [recent, setRecent] = useState(0);
    const [recentDirection, setRecentDirection] = useState<'up' | 'down'>('up');
    const resetRecent = useCallback(() => {
        setRecent(props.recent ?? 0);

    }, [setRecent]);
    const recentTimeout = useTimeout(resetRecent, props.recentTimeout ?? 10000);

    if (props.streamable) {
        const client = useSSEContext<MsSseEvent>();
        useSSEAnyEvent(client, (payload) => {
            if ('componentId' in (payload.data as object) && (payload.data as Record<string, any>).componentId === props.data.id) {
                switch (payload.type) {
                    case 'scrobbleQueued':
                        recentTimeout.stop();
                        setCurrent(current + 1);
                        if (recentDirection === 'down') {
                            setRecent(1);
                        } else {
                            setRecent(recent + 1);
                        }
                        setRecentDirection('up');
                        recentTimeout.start();
                        break;
                    case 'scrobbleDequeued':
                        recentTimeout.stop();
                        setCurrent(current - 1);
                        if (recentDirection === 'up') {
                            setRecent(1);
                        } else {
                            setRecent(recent + 1);
                        }
                        setRecentDirection('down');
                        recentTimeout.start();
                        break;
                }
            }
        });
    }

    if(as === 'stat') {
        return (
            <Stat.Root>
                <Stat.Label>Queued</Stat.Label>
                <HStack>
                    <Stat.ValueText>{current}</Stat.ValueText>
                    {recent !== 0 ? <Badge colorPalette={recentDirection === 'up' ? 'red' : 'green'} gap="0">
                        {recentDirection === 'up' ? <Stat.UpIndicator color="red" /> : <Stat.DownIndicator color="green" />}
                        {recent}
                    </Badge> : null}
                </HStack>
            </Stat.Root>
        );
    }

        return (
            <TextMuted textStyle="sm">{current} {recent !== 0 ? <Badge size="sm" colorPalette={recentDirection === 'up' ? 'red' : 'green'} gap="0">
                        {recentDirection === 'up' ? <UpArrowIcon color="red" /> : <DownArrowIcon color="green" />}
                        {recent}
                    </Badge> : null} Queued</TextMuted>
        );
}

export const DeadLetterIndicator = (props: {
    data: Pick<ComponentClientApiJson, 'mode' | 'id' | 'deadLetterScrobbles' | 'deadLetterScrobblesTotal'>,
    recent?: number
    recentTimeout?: number
    streamable?: boolean
    as?: 'text' | 'stat'
}) => {

    const {
        as = 'stat'
    } = props;

    const [current, setCurrent] = useState(props.data.deadLetterScrobbles);
    const [total, setTotal] = useState(props.data.deadLetterScrobblesTotal);
    const [recent, setRecent] = useState(0);
    const [recentDirection, setRecentDirection] = useState<'up' | 'down'>('up');
    const resetRecent = useCallback(() => {
        setRecent(props.recent ?? 0);

    }, [setRecent]);
    const recentTimeout = useTimeout(resetRecent, props.recentTimeout ?? 10000);

    if (props.streamable) {
        const client = useSSEContext<MsSseEvent>();
        useSSEAnyEvent(client, (payload) => {
            if ('componentId' in (payload.data as object) && (payload.data as Record<string, any>).componentId === props.data.id) {
                switch (payload.type) {
                    case 'deadLetter':
                        recentTimeout.stop();
                        setCurrent(current + 1);
                        setTotal(total + 1);
                        if (recentDirection === 'down') {
                            setRecent(1);
                        } else {
                            setRecent(recent + 1);
                        }
                        setRecentDirection('up');
                        recentTimeout.start();
                        break;
                }
            }
        });
    }

    if(as === 'stat') {
        return (
            <Stat.Root>
                <Stat.Label>Dead</Stat.Label>
                <HStack>
                    <Stat.ValueText>{current} ({total})</Stat.ValueText>
                    {recent !== 0 ? <Badge colorPalette={recentDirection === 'up' ? 'red' : 'green'} gap="0">
                        {recentDirection === 'up' ? <Stat.UpIndicator color="red" /> : <Stat.DownIndicator color="green" />}
                        {recent}
                    </Badge> : null}
                </HStack>
                <Stat.HelpText>Queuable and (Total)</Stat.HelpText>
            </Stat.Root>
        );
    }

        return (
            <TextMuted textStyle="sm">{current} ({total}) {recent !== 0 ? <Badge size="sm" colorPalette={recentDirection === 'up' ? 'red' : 'green'} gap="0">
                        {recentDirection === 'up' ? <UpArrowIcon color="red" /> : <DownArrowIcon color="green" />}
                        {recent}
                    </Badge> : null} Dead</TextMuted>
        );
}