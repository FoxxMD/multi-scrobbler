import React from "react";
import './timestamp.scss';

export interface TimestampProps {
    current: number
    duration: number
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
            <div className="timestamp__current">
                {convertTime(Math.floor(props.current))}
            </div>
            <div className="timestamp__progress">
                <div style={{ width: Math.floor((props.current / props.duration) * 100) + "%" }}></div>
            </div>
            <div className="timestamp__total">
                {convertTime(Math.floor(props.duration) - Math.floor(props.current))}
            </div>
        </div>
    );
}
/*export class TimestampC extends React.Component {
    convertTime(time) {
        let mins = Math.floor(time / 60);
        let seconds = time - (mins * 60);
        if (seconds < 10) {
            seconds = "0" + seconds;
        }
        time = mins + ":" + seconds;
        return time;
    }

    render() {
        return(
            <div className="timestamp">
                <div className="timestamp__current">
                    {this.convertTime(this.props.current)}
                </div>
                <div className="timestamp__progress">
                    <div style={{ width: Math.floor((this.props.current / this.props.duration) * 100) + "%" }}></div>
                </div>
                <div className="timestamp__total">
                    {this.convertTime(this.props.duration - this.props.current)}
                </div>
            </div>
        );
    }
}*/

export default Timestamp;
