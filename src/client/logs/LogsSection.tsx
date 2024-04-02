import React, {useState, useCallback, useEffect} from 'react';
import './LogsSection.css';
import {FixedSizeList} from "fixed-size-list";
import {useEventSource, useEventSourceListener} from "@react-nano/use-event-source";
import LogLine from "./LogLine";
import {useGetLogsQuery, useLazySetLogSettingsQuery} from "./logsApi";
import {connect, ConnectedProps} from "react-redux";
import {RootState} from "../store";
import Loading from "../components/loading/Loading";

const logBuffer: { message: string, id: string, level: number, levelLabel:string }[] = [];

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
const LogLimitButton = (props: {val: number, active: boolean, onClick: Function}) => {
    const {val, active, onClick} = props;
    const click = useCallback(() => active ? null : onClick(val), [onClick, val, active]);
    const className = active ? "mx-1" : "capitalize underline cursor-pointer mx-1";
    return <span onClick={click} className={className}>{val}</span>;
}

const LogsSection = (props: PropsFromRedux) => {
    const {
        logs,
        settings,
        settings: {
            limit = 50
        }
    } = props;

    const [logList, setLogList] = useState(logBuffer);
    const [logLevel, setLogLevel] = useState('debug')

    useGetLogsQuery(undefined);

    useEffect(() => {
        list = createFixedList(settings.limit, logs.map((x, index) => ({...x, message: x.line, id: index.toString()})));
        setLogList(Array.from(list.data));
        setLogLevel(settings.level);
    }, [logs, settings, setLogList, setLogLevel]);

    const [setSettings] = useLazySetLogSettingsQuery();

    const fetchLevel = useCallback(async (val) => {
        setSettings({level: val});
    }, [setSettings]);
    const fetchLimit = useCallback(async (val) => {
        setSettings({limit: val});
    }, [setSettings]);

    const [eventSource, eventSourceStatus] = useEventSource("api/logs/stream", false);
    useEventSourceListener(eventSource, ['messsage', 'stream'], evt => {
        const data = JSON.parse(evt.data);
        // @ts-ignore
        list.add({message: data.message, id: evt.lastEventId, level: data.level, levelLabel: data.levelLabel});
        setLogList(Array.from(list.data));
        //console.log(evt);
    }, [setLogList]);

    // TODO may eventually add log filtering back in but idk if anyone even uses it right now
    return (
        <div className="grid ">
            <div className="shadow-md rounded my-6 bg-gray-500 text-white">
                <div className="p-3 font-semibold bg-gray-700 text-white">
                    <h2>Log (Most Recent)
                        <Loading show/>
                    </h2>
                </div>
                <div className="p-6">
                    <div>Level : <LogLevelButton name="debug" active={logLevel === 'debug'} onClick={fetchLevel}/> |
                        <LogLevelButton name="verbose" active={logLevel === 'verbose'} onClick={fetchLevel}/> |
                        <LogLevelButton name="info" active={logLevel === 'info'} onClick={fetchLevel}/> |
                        <LogLevelButton name="warn" active={logLevel === 'warn'} onClick={fetchLevel}/> |
                        <LogLevelButton name="error" active={logLevel === 'error'} onClick={fetchLevel}/>
                    </div>
                    <div>Limit : <LogLimitButton val={50} active={limit === 50} onClick={fetchLimit}/> |
                        <LogLimitButton val={100} active={limit === 100} onClick={fetchLimit}/> |
                        <LogLimitButton val={200} active={limit === 200} onClick={fetchLimit}/>
                    </div>
                    <br/>
                    <div className="logs font-mono">
                        {
                            logList.map(x => <LogLine key={x.id} level={x.level} levelLabel={x.levelLabel} message={x.message}/>)
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
