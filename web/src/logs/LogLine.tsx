import React, {PropsWithChildren} from 'react';

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
    return <div style={{display: 'block'}} dangerouslySetInnerHTML={{__html: replaceLevel(props.message)}}/>
};

export default LogLine;
