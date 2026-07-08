import React, {type PropsWithChildren, useState, useEffect, useRef, useCallback} from 'react';
import * as AnsiImport from "ansi-to-react";
import { Text, Box, SegmentGroup, Separator, HStack, Stack, Span } from '@chakra-ui/react';
import {FixedSizeList} from "fixed-size-list";
import {useSSE} from "@flamefrontend/sse-runtime-react";
import { useQueryClient, type QueryFunctionContext, useQuery, useMutation } from '@tanstack/react-query'
import { LogOutputConfig } from '../../core/Atomic';
import ky from 'ky';
import { type LogLevel } from '@foxxmd/logging';
import { tanQueries } from '../queries';
import { ChakraClip, ChakraClipDynamic } from './ChakraClipboard';

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
        mutateLogSettings.mutate({level: val.value as LogLevel});
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