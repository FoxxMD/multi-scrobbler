import { Box, HStack, SegmentGroup, Separator, Span, Stack, Text, FloatingPanel, Portal, IconButton } from '@chakra-ui/react';
import {
    useWindowSize,
} from '@react-hook/window-size';
import { useSSE } from "@flamefrontend/sse-runtime-react";
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as AnsiImport from "ansi-to-react";
import { FixedSizeList } from "fixed-size-list";
import ky from 'ky';
import React, { useCallback, useEffect, useRef, useState, type ComponentProps } from 'react';
import type {LogLevelStandalone, LogOutputConfig} from '../../core/Atomic';
import { tanQueries } from '../queries';
import { ChakraClipDynamic } from './ChakraClipboard';
import { TerminalButton, XButton } from './icons/ChakraIcons';
import { LuGripHorizontal, LuMinus } from 'react-icons/lu';
import { Ripple } from './icons/AnimatedIcons';
import { MSErrorBoundary } from './ErrorBoundary';
import { useLocalStorage } from 'usehooks-ts'

// @ts-expect-error Ansi export is built incorrectly
const Ansi = AnsiImport.default.default as typeof AnsiImport.default;

interface LogLineProps {
    message: string
}

export const LogLine = (props: LogLineProps) => {
    return (
        <Text className="logline" whiteSpace="pre-wrap" display="block"><Ansi useClasses>{props.message}</Ansi></Text>
    )
};

interface MinLogInfo {
    message: string,
    id: string,
    level: number
    levelLabel: string
}

const createFixedList = (size, initialList: MinLogInfo[] = []): FixedSizeList<MinLogInfo> => {
    return new FixedSizeList<MinLogInfo>(size, initialList);
}

let list = createFixedList(50);

export const Logs = (props: {logs: Readonly<LogLineProps[]>, ref?: React.Ref<HTMLDivElement>}) => {
    return <Box ref={props.ref} fontFamily="source-code-pro, Menlo, Monaco, Consolas,'Courier New',monospace;">
        {props.logs.map(x => <LogLine message={x.message}/>)}
    </Box>
}

export const LogsFetchable = (props: {settings?: LogOutputConfig, streamable?: boolean}) => {
    const {
        settings: {
            limit = 50,
            level = 'trace'
        } = {},
        streamable = true
    } = props;

    const client = useQueryClient();
    const [logLevel, setLogLevel] = useState(level);
    const [logLimit, setLogLimit] = useState(limit);
    const [logList, setLogList] = useState<MinLogInfo[]>([]);


    const { isPending, isError, data, error } = useQuery({
        ...tanQueries.logs.list(logLevel, logLimit),
        staleTime: Infinity
    });

    const connection = useSSE<{stream: MinLogInfo}>({
        key: ['stream'],
        url: "/api/logs/stream",
        enabled: streamable,
        events: {
            stream: (data) => {
                if(!isPending) {
                    list.add(data);
                    setLogList(Array.from(list.data));
                }
            }
        }
    });

    const mutateLogSettings = useMutation({
        mutationFn: (settings: Partial<LogOutputConfig>) => ky.put('/api/logs', {json: settings}),
        onSuccess: (sentData, variables) => {
            if(variables.level !== undefined) {
                setLogLevel(variables.level);
            }
            if(variables.limit !== undefined) {
                setLogLimit(variables.limit);
            }
            client.invalidateQueries({
                queryKey: ['logs', { level: variables.level ?? logLevel, limit: variables.limit ?? logLimit }],
                refetchType: 'all'
            })
        }
    });

    const levelGroup = <SegmentGroup.Root value={logLevel} size="xs" onValueChange={(val) => {
        mutateLogSettings.mutate({level: val.value as LogLevelStandalone});
        }}>
        <SegmentGroup.Indicator />
        <SegmentGroup.Items items={[
            {value: 'trace', label: 'Trace'},
            {value: 'debug', label: 'Debug'},
            {value: 'verbose', label: 'Verbose'},
            {value: 'info', label: 'Info'},
            {value: 'warn', label: 'Warn'},
            {value: 'error', label: 'Error'}
            ]} />
    </SegmentGroup.Root>

    const limitGroup = <SegmentGroup.Root value={logLimit.toString()} size="xs" onValueChange={(val) => {
        mutateLogSettings.mutate({limit: Number.parseInt(val.value)});
        }}>
        <SegmentGroup.Indicator />
        <SegmentGroup.Items items={[
            {value: '50', label: 50},
            {value: '100', label: 100},
            {value: '200', label: 200},
            ]} />
    </SegmentGroup.Root>

    useEffect(() => {
        if(data !== undefined) {
            list = createFixedList(logLimit, data.data.map((x, index) => ({...x, message: x.line, id: x.time.toString(), levelLabel: x.levelLabel, level: x.level})));
            setLogList(Array.from(list.data));
        }
    }, [data, limit,setLogList]);

    const logRef = useRef<HTMLDivElement>(null);

    const getLogCopyText = useCallback(() =>{
        const content = logRef.current.innerText;
        return content.replaceAll(/\n\[/g, '[');
    },[logRef]);

    return (<Stack>
        <HStack gap="5">
            <Span>Level: {levelGroup}</Span>
            <Separator orientation="vertical" height="4"/><Span marginEnd="auto">Limit: {limitGroup}</Span>
            <ChakraClipDynamic onCopy={getLogCopyText}/>
            </HStack>
        <Logs ref={logRef} logs={logList}/>
        </Stack>);
    
}

interface Rectangle {
  x: number;      // left edge
  y: number;      // top edge
  width: number;
  height: number;
}

const isAnyCornerOutside = (rectangleA: Rectangle, rectangleB: Rectangle): boolean => {
  const corners = [
    { x: rectangleA.x, y: rectangleA.y },                                   // top-left
    { x: rectangleA.x + rectangleA.width, y: rectangleA.y },                // top-right
    { x: rectangleA.x, y: rectangleA.y + rectangleA.height },               // bottom-left
    { x: rectangleA.x + rectangleA.width, y: rectangleA.y + rectangleA.height }, // bottom-right
  ];

  const bLeft = rectangleB.x;
  const bRight = rectangleB.x + rectangleB.width;
  const bTop = rectangleB.y;
  const bBottom = rectangleB.y + rectangleB.height;

  return corners.some(
    (corner) =>
      corner.x < bLeft ||
      corner.x > bRight ||
      corner.y < bTop ||
      corner.y > bBottom
  );
};

const defaultPosition = (width: number, height: number): ComponentProps<typeof FloatingPanel['Root']>['position'] =>  ({x: width * 0.03, y: height * 0.65});
const defaultSize = (width: number, height: number): ComponentProps<typeof FloatingPanel['Root']>['size'] =>  ({ width: width * 0.95, height: height * 0.3 });

export const FloatingLogs = (props: {streamable?: boolean}) => {
    const [width, height] = useWindowSize();

    // remember logs state across refreshes
    // keep logs open if it was last opened, in the last position/size *if still within viewport bounds*
    const [logsOpen, setLogsOpen] = useLocalStorage('logsOpen', false);
    const [logsPosition, setLogsPosition] = useLocalStorage<ComponentProps<typeof FloatingPanel['Root']>['position']>('logsPosition', defaultPosition(width, height));
    const [logsSize, setLogsSize] = useLocalStorage<ComponentProps<typeof FloatingPanel['Root']>['size']>('logsSize', defaultSize(width, height));

    // when logs are opened
    // check if any part of the logs window is outside the bounds of the viewport
    // and if it is then reset size/position to default so that user can't accidentally make logs irretrievable
    useEffect(() => {
        if(logsOpen) {
            const logRectangle: Rectangle = {x: logsPosition.x, y: logsPosition.y, width: logsSize.width, height: logsSize.height};
            const windowRectangle: Rectangle = {x: 0, y: 0, width, height}; 
            if(isAnyCornerOutside(logRectangle, windowRectangle)) {
                console.log('resetting logs height/size due to boundary conflict');
                setLogsPosition(defaultPosition(width, height));
                setLogsSize(defaultSize(width, height));
            }
        }
    },[logsOpen]);

    return (
        <FloatingPanel.Root
            open={logsOpen}
            onOpenChange={(details) => setLogsOpen(details.open)}
            position={logsPosition}
            onPositionChange={(details) => setLogsPosition(details.position)}
            size={logsSize}
            onSizeChange={(details) => setLogsSize(details.size)}
            persistRect
            closeOnEscape
            lazyMount
        >
            <FloatingPanel.Trigger asChild>
                <TerminalButton hideBelow="sm" />
            </FloatingPanel.Trigger>
            <Portal>
                <FloatingPanel.Positioner zIndex="1400">
                    <FloatingPanel.Content>
                        <FloatingPanel.Header>
                            <FloatingPanel.DragTrigger>
                                <LuGripHorizontal />
                                <FloatingPanel.Title>Logs <Ripple/></FloatingPanel.Title>
                            </FloatingPanel.DragTrigger>
                            <FloatingPanel.Control>
                                <FloatingPanel.StageTrigger stage="minimized" asChild>
                                    <IconButton variant="ghost" size="2xs">
                                        <LuMinus />
                                    </IconButton>
                                </FloatingPanel.StageTrigger>
                                <FloatingPanel.CloseTrigger asChild>
                                    <XButton variant="ghost" size="2xs" />
                                </FloatingPanel.CloseTrigger>
                            </FloatingPanel.Control>
                        </FloatingPanel.Header>
                        <FloatingPanel.Body>
                            <MSErrorBoundary><LogsFetchable streamable={props.streamable} /></MSErrorBoundary>
                        </FloatingPanel.Body>
                        <FloatingPanel.ResizeTriggers />
                    </FloatingPanel.Content>
                </FloatingPanel.Positioner>
            </Portal>
        </FloatingPanel.Root>
    );
}