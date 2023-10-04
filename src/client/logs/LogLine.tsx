import React, {PropsWithChildren} from 'react';
import {parseLogLine} from "../utils/index";

const breakSymbol = '<br />';

const replaceLevel = (chunk: string) => {
    return chunk.toString().replace('\n', breakSymbol)
        .replace(/(debug)\s/gi, '<span class="debug blue">$1 </span>')
        .replace(/(warn)\s/gi, '<span class="warn yellow">$1 </span>')
        .replace(/(info)\s/gi, '<span class="info green">$1 </span>')
        .replace(/(verbose)\s/gi, '<span class="verbose purple">$1 </span>')
        .replace(/(error)\s/gi, '<span class="error red">$1 </span>')
        .trim();
}
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
const LogLine = (props: PropsWithChildren<{level: string, message: string}>) => {
    const lineParts = parseLogLine(props.message);
    const level = props.level ?? lineParts.level;
    const levelClass = getClass(level);
    return (
        <div className="line">{lineParts.timestamp} <span className={levelClass}>{level.padEnd(7, ' ')}</span> : {lineParts.message}</div>
    )
};

export default LogLine;
