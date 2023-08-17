import React, {useState} from 'react';
import './LogsSection.css';
import {FixedSizeList} from "fixed-size-list";
import { useEventSource, useEventSourceListener } from "@react-nano/use-event-source";
import LogLine from "./LogLine";
import {useQuery} from "@tanstack/react-query";
import ky from "ky";
import {ClientStatusData, LogInfo, LogInfoJson, LogOutputConfig, SourceStatusData} from "../../core/Atomic.js";
import {id} from "common-tags";

let logBuffer: {message: string, id: string, level: string}[] = [];

interface MinLogInfo {message: string, id: string, level: string}
const createFixedList = (size, initialList: MinLogInfo[] = []): FixedSizeList<MinLogInfo> => {
    return new FixedSizeList<MinLogInfo>(size, initialList);
}

let list = createFixedList(50);

const LogsSection = () => {
    const [logList, setLogList] = useState(logBuffer);

    const {isLoading, isSuccess, isError, data, error} = useQuery({
        queryKey: ['logs'], queryFn: async () => {
            return await ky.get('api/logs').json() as { data: LogInfoJson[], settings: LogOutputConfig }
        },
        refetchOnWindowFocus: false,
    });
    if(isSuccess && data !== undefined && logList.length === 0) {
        list = createFixedList(data.settings.limit, data.data.map((x, index) => ({...x, message: x.formattedMessage, id: index.toString()})));
        setLogList(Array.from(list.data));
    }

    const [eventSource, eventSourceStatus] = useEventSource("api/logs/stream", false);
    useEventSourceListener(eventSource, ['messsage','stream'], evt => {
        const data = JSON.parse(evt.data);
        // @ts-ignore
        list.add({message: data.message, id: evt.lastEventId});
        setLogList(Array.from(list.data));
        //console.log(evt);
    }, [setLogList]);

    // TODO may eventually add log filtering back in but idk if anyone even uses it right now
    return (
        <div className="grid ">
            <div className="shadow-md rounded my-6 bg-gray-500 text-white">
                <div className="space-x-4 p-6 md:px-10 md:py-6 leading-6 font-semibold bg-gray-700 text-white">
                    <h2>Log (Most Recent)
                        {/*https://codepen.io/nikhil8krishnan/pen/rVoXJa*/}
                        <svg className="loading connected" version="1.1" id="L9" xmlns="http://www.w3.org/2000/svg" x="0px" y="0px"
                             xmlnsXlink="http://www.w3.org/1999/xlink"
                             viewBox="0 0 100 100" xmlSpace="preserve">
                        <path
                            d="M73,50c0-12.7-10.3-23-23-23S27,37.3,27,50 M30.9,50c0-10.5,8.5-19.1,19.1-19.1S69.1,39.5,69.1,50">
                            <animateTransform
                                attributeName="transform"
                                attributeType="XML"
                                type="rotate"
                                dur="1s"
                                from="0 50 50"
                                to="360 50 50"
                                repeatCount="indefinite"/>
                        </path>
                    </svg>
                    </h2>
                </div>
                <div className="p-6 md:px-10 md:py-6">
                    <br />
                    <div className="logs">
                        {
                            logList.map(x => <LogLine key={x.id} level={x.level} message={x.message}/>)
                        }
                    </div>
                </div>
                <div className="w-full flex-auto flex min-h-0 overflow-auto">
                    <div className="w-full relative flex-auto">
                    </div>
                </div>
            </div>
        </div>
    );
}

export default LogsSection;
