import React, {PropsWithChildren} from 'react';
import * as AnsiImport from "ansi-to-react";

// @ts-expect-error Ansi export is built incorrectly
const Ansi = AnsiImport.default.default as typeof AnsiImport.default;

const LogLine = (props: PropsWithChildren<{level: number, levelLabel: string, message: string}>) => {
    return (
        <div className="line"><Ansi useClasses>{props.message}</Ansi></div>
    )
};

export default LogLine;
