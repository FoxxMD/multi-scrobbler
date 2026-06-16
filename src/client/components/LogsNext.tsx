import React, {PropsWithChildren, useState, useEffect} from 'react';
import * as AnsiImport from "ansi-to-react";
import { Text, Box } from '@chakra-ui/react';
import {FixedSizeList} from "fixed-size-list";
import {useSSE} from "@flamefrontend/sse-runtime-react";
import { useQueryClient, QueryFunctionContext, useQuery } from '@tanstack/react-query'
import { LogOutputConfig } from '../../core/Atomic';
import ky from 'ky';
import { baseUrl } from '../utils';

// @ts-expect-error Ansi export is built incorrectly
const Ansi = AnsiImport.default.default as typeof AnsiImport.default;

interface LogLineProps {
    message: string
}

export const LogLine = (props: LogLineProps) => {
    return (
        <Text whiteSpace="pre-wrap" display="block"><Ansi useClasses>{props.message}</Ansi></Text>
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

    const [logLevel, setLogLevel] = useState(level);
    const [logList, setLogList] = useState<MinLogInfo[]>([]);

    const { isPending, isError, data, error } = useQuery({
        queryKey: ['logs', { level: logLevel }],
        queryFn: queryFn
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

    useEffect(() => {
        if(data !== undefined) {
            list = createFixedList(limit, data.data.map((x, index) => ({...x, message: x.line, id: x.time.toString(), levelLabel: x.levelLabel, level: x.level})));
            setLogList(Array.from(list.data));
        }
    }, [data, limit,setLogList]);

    return <Logs logs={logList}/>
    
}

type LogsQueryKey = ['logs', {level: string}];
const queryFn = async (context: QueryFunctionContext<LogsQueryKey>) => {
    return await ky.get(`logs`, { baseUrl: baseUrl }).json() as {data: {line: string, time: number, levelLabel: string, level: number}[]};
}