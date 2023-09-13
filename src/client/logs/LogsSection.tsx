import React, {useState, useCallback, useEffect} from 'react';
import './LogsSection.css';
import {FixedSizeList} from "fixed-size-list";
import {useEventSource, useEventSourceListener} from "@react-nano/use-event-source";
import LogLine from "./LogLine";
import {useGetLogsQuery, useLazySetLevelQuery, logsApi} from "./logsApi";
import {connect, ConnectedProps} from "react-redux";
import {RootState} from "../store";

let logBuffer: { message: string, id: string, level: string }[] = [];

interface MinLogInfo {
    message: string,
    id: string,
    level: string
}

const createFixedList = (size, initialList: MinLogInfo[] = []): FixedSizeList<MinLogInfo> => {
    return new FixedSizeList<MinLogInfo>(size, initialList);
}

let list = createFixedList(50);

interface LogLevelButtonProps {
    name: string,
    active: boolean,
    onClick: Function
}
const LogLevelButton = (props: LogLevelButtonProps) => {
    const {name, active, onClick} = props;
    const click = useCallback(() => active ? null : onClick(name), [onClick, name, active]);
    const className = active ? "mx-1" : "capitalize underline cursor-pointer mx-1";
    return <span onClick={click} className={className}>{name.toUpperCase()}</span>;
}

const LogsSection = (props: PropsFromRedux) => {
    const {
        logs,
        settings,
    } = props;

    const [logList, setLogList] = useState(logBuffer);
    const [logLevel, setLogLevel] = useState('debug')

    useGetLogsQuery(undefined);

    useEffect(() => {
        list = createFixedList(settings.limit, logs.map((x, index) => ({...x, message: x.formattedMessage, id: index.toString()})));
        setLogList(Array.from(list.data));
        setLogLevel(settings.level);
    }, [logs, settings, setLogList, setLogLevel]);

    const [setLevel] = useLazySetLevelQuery();

    const fetchLevel = useCallback(async (val) => {
        setLevel(val);
    }, [setLogLevel]);

    const [eventSource, eventSourceStatus] = useEventSource("api/logs/stream", false);
    useEventSourceListener(eventSource, ['messsage', 'stream'], evt => {
        const data = JSON.parse(evt.data);
        // @ts-ignore
        list.add({message: data.message, id: evt.lastEventId, level: data.level});
        setLogList(Array.from(list.data));
        //console.log(evt);
    }, [setLogList]);

    // TODO may eventually add log filtering back in but idk if anyone even uses it right now
    return (
        <div className="grid ">
            <div className="shadow-md rounded my-6 bg-gray-500 text-white">
                <div className="p-3 font-semibold bg-gray-700 text-white">
                    <h2>Log (Most Recent)
                        {/*https://codepen.io/nikhil8krishnan/pen/rVoXJa*/}
                        <svg className="loading connected" version="1.1" id="L9" xmlns="http://www.w3.org/2000/svg"
                             x="0px" y="0px"
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
                <div className="p-6">
                    <div>Level : <LogLevelButton name="debug" active={logLevel === 'debug'} onClick={fetchLevel}/> |
                        <LogLevelButton name="verbose" active={logLevel === 'verbose'} onClick={fetchLevel}/> |
                        <LogLevelButton name="info" active={logLevel === 'info'} onClick={fetchLevel}/>
                    </div>
                    <br/>
                    <div className="logs font-mono">
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

const mapStateToProps = (state: RootState) => ({
    logs: state.logs.data,
    settings: state.logs.settings
});

type PropsFromRedux = ConnectedProps<typeof connector>

const connector = connect(mapStateToProps);

export default connector(LogsSection);
