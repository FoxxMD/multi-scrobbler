import { type ComponentProps, useState, useCallback, type ReactNode, useEffect } from "react"
import { Badge, Stat, HStack, type BadgeProps } from '@chakra-ui/react';
import type {ComponentClientApiJson, ComponentCommonApiJson, MsSseEvent} from "../../../core/Api.js";
import { TextMuted } from "../TextMuted.js";
import type { IconBaseProps } from "react-icons/lib";
import { DownArrowIcon, UpArrowIcon } from "../icons/ChakraIcons.js";
import { useTimeout } from 'react-use-timeout';
import {
    useSSEContext,
    useSSEAnyEvent
} from "@flamefrontend/sse-runtime-react";
import dayjs from "dayjs";
import { shortTodayAwareFormat } from "../../../core/TimeUtils.js";

type Color = BadgeProps['colorPalette'] & IconBaseProps['color'];

export const Indicator = (props: {
    current?: number
    currentText: string | ReactNode
    recentTimeout?: number
    total?: number
    totalText?: string | ReactNode
    helpText?: string | ReactNode
    directionColors?: [Color, Color]
    as?: 'text' | 'stat'
} & ComponentProps<typeof Stat.Root>) => {

    const {
        as = 'stat',
        current = 0,
        currentText,
        recentTimeout: timeoutProp = 10000,
        directionColors = ['green', 'red'],
        total,
        totalText,
        helpText,
        ...rest
    } = props;

    const [lastCurrent, setLastCurrent] = useState(current);
    const [recent, setRecent] = useState(0);
    const [recentDirection, setRecentDirection] = useState<'up' | 'down'>('up');
    const resetRecent = useCallback(() => {
        setRecent(0);

    }, [setRecent]);
    const recentTimeout = useTimeout(resetRecent, timeoutProp ?? 10000);

    if (lastCurrent !== current) {
        recentTimeout.stop();
        if (lastCurrent > current) {
            if (recentDirection === 'up') {
                setRecent(1);
                setRecentDirection('down');
            } else {
                setRecent(recent + 1);
            }
        } else {
            if (recentDirection === 'down') {
                setRecent(1);
                setRecentDirection('up');
            } else {
                setRecent(recent + 1);
            }
        }
        setLastCurrent(current);
        recentTimeout.start();
    }

    if (as === 'stat') {
        return (
            <Stat.Root size={{ smDown: "sm", base: "md" }} {...rest}>
                <Stat.Label>{currentText}</Stat.Label>
                <HStack>
                    <Stat.ValueText textWrapMode="nowrap">{current} {total !== undefined && <>({total})</>}</Stat.ValueText>
                    {recent !== 0 ? <Badge colorPalette={recentDirection === 'up' ? directionColors[0] : directionColors[1]} gap="0">
                        {recentDirection === 'up' ? <Stat.UpIndicator color={directionColors[0]} /> : <Stat.DownIndicator color={directionColors[1]} />}
                        {recent}
                    </Badge> : null}
                </HStack>
                {helpText !== undefined && totalText !== undefined && <Stat.HelpText>{helpText ?? <>{props.currentText} and ({totalText})</>}</Stat.HelpText>}
            </Stat.Root>
        );
    }

    return (
        <TextMuted textStyle="sm">{current}  {total !== undefined && <>({total})</>} {recent !== 0 ? <Badge size="sm" colorPalette={recentDirection === 'up' ? directionColors[0] : directionColors[1]} gap="0">
            {recentDirection === 'up' ? <UpArrowIcon color={directionColors[0]} /> : <DownArrowIcon color={directionColors[0]} />}
            {recent}
        </Badge> : null} {currentText}</TextMuted>
    );
};

export const CountIndicatorStatic = (props: Omit<ComponentProps<typeof Indicator>, 'totalText' | 'helpText' | 'directionColors' | 'currentText'> & Pick<ComponentCommonApiJson, 'mode'>) => (
    <Indicator helpText="Since Start and (Total)" currentText={props.mode === 'source' ? 'Discovered' : 'Scrobbled'} {...props} />
)

export const CountIndicatorStreamable = (props: { data: Pick<ComponentCommonApiJson, 'countLive' | 'id' | 'mode'> & { tracksDiscovered?: number, tracksScrobbled?: number } }
    & Omit<ComponentProps<typeof CountIndicatorStatic>, 'mode'>) => {
    const {
        data,
        ...rest
    } = props;
    const [statsData, setStatsData] = useState({current: data.tracksDiscovered ?? data.tracksScrobbled, total: data.countLive});

    const client = useSSEContext<MsSseEvent>();
    useSSEAnyEvent(client, (payload) => {
        if ('componentId' in (payload.data as object) && (payload.data as Record<string, any>).componentId === data.id) {
            switch (payload.type) {
                case 'scrobble':
                case 'discovered':
                    setStatsData({current: statsData.current + 1, total: statsData.total + 1});
                    break;
            }
        }
    });

    return <CountIndicatorStatic current={statsData.current} total={statsData.total} mode={data.mode} {...rest} />
}

export const QueuedIndicatorStatic = (props: Omit<ComponentProps<typeof Indicator>, 'currentText' | 'totalText' | 'helpText' | 'directionColors'>) => (
    <Indicator currentText="Queued" directionColors={['red', 'green']} {...props} />
);

export const QueuedIndicatorStreamable = (props: { data: Pick<ComponentClientApiJson, 'id' | 'queued'> }
    & ComponentProps<typeof QueuedIndicatorStatic>) => {
    const {
        data,
        ...rest
    } = props;
    const [statsData, setStatsData] = useState({current: data.queued});

    const client = useSSEContext<MsSseEvent>();
    useSSEAnyEvent(client, (payload) => {
        if ('componentId' in (payload.data as object) && (payload.data as Record<string, any>).componentId === data.id) {
            switch (payload.type) {
                case 'playQueued':
                    setStatsData({current: statsData.current + 1});
                    break;
                case 'playDequeued':
                    setStatsData({current: statsData.current - 1});
                    break;
            }
        }
    });

    return <QueuedIndicatorStatic current={statsData.current} {...rest} />
}

export const DeadLetterIndicatorStatic = (props: Omit<ComponentProps<typeof Indicator>, 'currentText' | 'totalText' | 'helpText' | 'directionColors'>) => (
    <Indicator currentText="Dead" helpText="Queuable and (Total)" totalText="Total" directionColors={['red', 'green']} {...props} />
);

export const DeadLetterIndicatorStreamable = (props: { data: Pick<ComponentClientApiJson, 'id' | 'deadLetterPlays' | 'deadLetterPlaysTotal'> }
    & ComponentProps<typeof DeadLetterIndicatorStatic>) => {
    const {
        data,
        ...rest
    } = props;
    const [statsData, setStatsData] = useState({current: data.deadLetterPlays, total: data.deadLetterPlaysTotal});

    const client = useSSEContext<MsSseEvent>();
    useSSEAnyEvent(client, (payload) => {
        if ('componentId' in (payload.data as object) && (payload.data as Record<string, any>).componentId === data.id) {
            switch (payload.type) {
                case 'deadLetter':
                    setStatsData({current: statsData.current + 1, total: statsData.total + 1});
                    break;
                case 'deadLetterRemoved':
                    setStatsData({current: statsData.current - 1, total: statsData.total - 1});
                    break;
                case 'deadLetterDequeued':
                    setStatsData({current: statsData.current - 1, total: statsData.total});
                    break;
                case 'deadQueued':
                    setStatsData({current: statsData.current + 1, total: statsData.total});
                    break;
            }
        }
    });

    return <DeadLetterIndicatorStatic current={statsData.current} total={statsData.total} {...rest} />
}

export const DateIndicatorStreamable = (props: Omit<ComponentProps<typeof DateIndicator>, 'streamedDate'>) => {

        const {
        data: {
            id,
            lastActiveAt,
            lastReadyAt,
            state
        } = {},
    } = props;

        const useActive = state < 5
        const [current, setCurrent] = useState(useActive ? lastActiveAt : lastReadyAt);

        const client = useSSEContext<MsSseEvent>();
        useSSEAnyEvent(client, (payload) => {
            if ('componentId' in (payload.data as object) && (payload.data as Record<string, any>).componentId === id) {
                // TODO update state from event
                setCurrent(dayjs().toISOString());
            }
        });

        return <DateIndicator streamedDate={current} {...props}/>
}

export const DateIndicator = (props: {
    data: Pick<ComponentCommonApiJson, 'id' | 'lastActiveAt' | 'state' | 'lastReadyAt'>,
    streamable?: boolean
    as?: 'text' | 'stat'
    streamedDate?: string
} & ComponentProps<typeof Stat.Root>) => {

    const {
        data: {
            lastActiveAt,
            lastReadyAt,
            state
        } = {},
        streamable,
        as = 'stat',
        ...rest
    } = props;

    const useActive = state < 5;
    let usedDate: string = props.streamedDate;
    if(usedDate === undefined) {
        usedDate = useActive ? lastActiveAt : lastReadyAt;
    }

    if(as === 'stat') {
        return (
            <Stat.Root size={{smDown: "sm", base: "md"}} {...rest}>
                <Stat.Label>{useActive? 'Last Active At' : 'Last Ready At'}</Stat.Label>
                <HStack>
                    <Stat.ValueText>{shortTodayAwareFormat(dayjs(usedDate))}</Stat.ValueText>
                </HStack>
            </Stat.Root>
        );
    }

        return (
            <TextMuted textStyle="sm">{shortTodayAwareFormat(dayjs(usedDate))} {useActive? 'Last Active At' : 'Last Ready At'}</TextMuted>
        );
}