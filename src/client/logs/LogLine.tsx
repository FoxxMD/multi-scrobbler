import React, {PropsWithChildren} from 'react';
import Ansi from "@curvenote/ansi-to-react";

const LogLine = (props: PropsWithChildren<{level: number, levelLabel: string, message: string}>) => {
    return (
        <div className="line"><Ansi useClasses>{props.message}</Ansi></div>
    )
};

export default LogLine;
