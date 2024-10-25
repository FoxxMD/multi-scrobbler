import React from "react";
import './timestamp.scss';

export interface TimestampProps {
    current: number
    duration: number
    indeterminate?: boolean
}

const convertTime = (rawTime: number) => {
    let mins = Math.floor(rawTime / 60);
    let seconds = rawTime - (mins * 60);
    let secStr: string = seconds.toString();
    if (seconds < 10) {
        secStr = "0" + seconds;
    }
    return mins + ":" + secStr;
}

const Timestamp = (props: TimestampProps) => {
    return(
        <div className="timestamp">
            <div className="timestamp__current" style={{left: props.indeterminate ? '1em' : '0'}}>
                {props.indeterminate ? '-' : convertTime(Math.floor(props.current))}
            </div>
            <div className="timestamp__progress">
                <div className={props.indeterminate ? 'indeterminate' : ''} style={{ width: props.indeterminate ? '100%' : (props.current === 0 && props.duration === 0 ? 0 : Math.floor((props.current / props.duration) * 100)) + "%" }}></div>
            </div>
            <div className="timestamp__total">
                {convertTime(Math.floor(props.duration) - Math.floor(props.current))}
            </div>
        </div>
    );
}

export default Timestamp;
