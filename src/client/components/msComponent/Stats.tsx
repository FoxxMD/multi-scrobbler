import { type ComponentProps, useState, useCallback } from "react"
import { Badge, Stat, HStack } from '@chakra-ui/react';
import type {ComponentClientApiJson, ComponentCommonApiJson, MsSseEvent} from "../../../core/Api.js";
import { TextMuted } from "../TextMuted.js";
import { DownArrowIcon, UpArrowIcon } from "../icons/ChakraIcons.js";
import { useTimeout } from 'react-use-timeout';
import {
    useSSEContext,
    useSSEAnyEvent
} from "@flamefrontend/sse-runtime-react";
import dayjs from "dayjs";
import { shortTodayAwareFormat } from "../../../core/TimeUtils.js";

export const CountLiveIndicator = (props: {
    data: Pick<ComponentCommonApiJson, 'countLive' | 'mode' | 'id'> & { tracksDiscovered?: number, tracksScrobbled?: number },
    recent?: number
    recentTimeout?: number
    streamable?: boolean
    as?: 'text' | 'stat'
} & ComponentProps<typeof Stat.Root>) => {

    const {
        data,
        recent: recentProp = 0,
        recentTimeout: timeoutProp = 10000,
        streamable,
        as = 'stat',
        ...rest
    } = props;

    const sessionCount = props.data.mode === 'source' ? props.data.tracksDiscovered : props.data.tracksScrobbled;

    const [total, setTotal] = useState(props.data.countLive);
    const [current, setCurrent] = useState(sessionCount);
    const [recent, setRecent] = useState(recentProp);
    const resetRecent = useCallback(() => {
        setRecent(props.recent ?? 0);

    }, [setRecent]);
    const recentTimeout = useTimeout(resetRecent, timeoutProp ?? 10000);

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
            <Stat.Root size={{smDown: "sm", base: "md"}} {...rest}>
                <Stat.Label>{props.data.mode === 'source' ? 'Discovered' : 'Scrobbled'}</Stat.Label>
                <HStack>
                    {/* <InfoTip>{props.data.mode === 'source' ? 'Discovered' : 'Scrobbled'} since start and (Total)</InfoTip> */}
                    <Stat.ValueText textWrapMode="nowrap">{current} ({total})</Stat.ValueText>
                    {recent !== 0 ? <Badge colorPalette="green" gap="0">
                        <Stat.UpIndicator />
                        {recent}
                    </Badge> : null}
                </HStack>
                <Stat.HelpText>Since Start and (Total)</Stat.HelpText>
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
} & ComponentProps<typeof Stat.Root>) => {

    const {
        data,
        recent: recentProp = 0,
        recentTimeout: timeoutProp = 10000,
        streamable,
        as = 'stat',
        ...rest
    } = props;

    const [current, setCurrent] = useState(props.data.queued);
    const [recent, setRecent] = useState(recentProp);
    const [recentDirection, setRecentDirection] = useState<'up' | 'down'>('up');
    const resetRecent = useCallback(() => {
        setRecent(0);

    }, [setRecent]);
    const recentTimeout = useTimeout(resetRecent, timeoutProp);

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
            <Stat.Root size={{smDown: "sm", base: "md"}} {...rest}>
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
} & ComponentProps<typeof Stat.Root> ) => {

    const {
        data,
        recent: recentProp = 0,
        recentTimeout: timeoutProp = 10000,
        streamable,
        as = 'stat',
        ...rest
    } = props;

    const [current, setCurrent] = useState(props.data.deadLetterScrobbles);
    const [total, setTotal] = useState(props.data.deadLetterScrobblesTotal);
    const [recent, setRecent] = useState(recentProp);
    const [recentDirection, setRecentDirection] = useState<'up' | 'down'>('up');
    const resetRecent = useCallback(() => {
        setRecent(0);

    }, [setRecent]);
    const recentTimeout = useTimeout(resetRecent, timeoutProp ?? 10000);

    if (streamable) {
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
            <Stat.Root size={{smDown: "sm", base: "md"}} {...rest}>
                <Stat.Label>Dead</Stat.Label>
                <HStack>
                    <Stat.ValueText textWrapMode="nowrap">{current} ({total})</Stat.ValueText>
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

export const DateIndicator = (props: {
    data: Pick<ComponentCommonApiJson, 'id' | 'lastActiveAt' | 'state' | 'lastReadyAt'>,
    streamable?: boolean
    as?: 'text' | 'stat'
} & ComponentProps<typeof Stat.Root>) => {

    const {
        data: {
            id,
            lastActiveAt,
            lastReadyAt,
            state
        } = {},
        streamable,
        as = 'stat',
        ...rest
    } = props;

    const useActive = state < 5;

    const [current, setCurrent] = useState(useActive ? lastActiveAt : lastReadyAt);

    if (props.streamable) {
        const client = useSSEContext<MsSseEvent>();
        useSSEAnyEvent(client, (payload) => {
            if ('componentId' in (payload.data as object) && (payload.data as Record<string, any>).componentId === props.data.id) {
                // TODO update state from event
                setCurrent(dayjs().toISOString());
            }
        });
    }

    if(as === 'stat') {
        return (
            <Stat.Root size={{smDown: "sm", base: "md"}} {...rest}>
                <Stat.Label>{useActive? 'Last Active At' : 'Last Ready At'}</Stat.Label>
                <HStack>
                    <Stat.ValueText>{shortTodayAwareFormat(dayjs(current))}</Stat.ValueText>
                </HStack>
            </Stat.Root>
        );
    }

        return (
            <TextMuted textStyle="sm">{shortTodayAwareFormat(dayjs(current))} {useActive? 'Last Active At' : 'Last Ready At'}</TextMuted>
        );
}