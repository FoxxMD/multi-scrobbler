import React, {PropsWithChildren} from 'react';
import {parseLogLine} from "../utils/index";

const getClass = (level: string) => {
    switch(level) {
        case 'debug':
            return 'debug blue';
        case 'warn':
            return 'warn yellow';
        case 'info':
            return 'info green';
        case 'verbose':
            return 'verbose purple';
        case 'error':
            return 'error red';
    }
}
const LogLine = (props: PropsWithChildren<{level: number, levelLabel: string, message: string}>) => {
    const lineParts = parseLogLine(props.message);
    const levelClass = getClass(props.levelLabel);
    return (
        <div className="line">{lineParts.timestamp} <span className={levelClass}>{props.levelLabel.padEnd(7, ' ')}</span> : {lineParts.message}</div>
    )
};

export default LogLine;
