import React, {PropsWithChildren, useState, useEffect} from 'react';
import * as AnsiImport from "ansi-to-react";
import { Text, Box, SegmentGroup, Separator, HStack, Stack, Span } from '@chakra-ui/react';
import {FixedSizeList} from "fixed-size-list";
import {useSSE} from "@flamefrontend/sse-runtime-react";
import { useQueryClient, QueryFunctionContext, useQuery, useMutation } from '@tanstack/react-query'
import { LogOutputConfig } from '../../core/Atomic';
import ky from 'ky';
import { baseUrl } from '../utils';
import { LogLevel } from '@foxxmd/logging';

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

export const Logs = (props: {logs: Readonly<LogLineProps[]>}) => {
    return <Box fontFamily="source-code-pro, Menlo, Monaco, Consolas,'Courier New',monospace;">
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
        queryKey: ['logs', { level: logLevel, limit: logLimit }],
        queryFn: queryFn,
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

    return (<Stack>
        <HStack gap="5"><Span>Level: {levelGroup}</Span><Separator orientation="vertical" height="4"/><Span>Limit: {limitGroup}</Span></HStack>
        <Logs logs={logList}/>
        </Stack>);
    
}

type LogsQueryKey = ['logs', {level: string, limit: number}];
const queryFn = async (context: QueryFunctionContext<LogsQueryKey>) => {
    return await ky.get(`logs`, { baseUrl: baseUrl }).json() as {data: {line: string, time: number, levelLabel: string, level: number}[]};
}