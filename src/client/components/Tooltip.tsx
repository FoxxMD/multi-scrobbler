import {PropsWithChildren, ReactElement} from "react";
import clsx from "clsx";

export interface TooltipProps {
    message: string | ReactElement
    classNames?: string[]
    style?: object
}

const defaultStyle = {};

const Tooltip = (props: PropsWithChildren<TooltipProps>) => {
    const {children, message, classNames = [], style = defaultStyle } = props;
    const classes = ['group','relative','flex'];
    clsx(classes.concat(classNames))
    return (
        <div className={clsx(classes.concat(classNames))} style={style}>
            {children}
            <span
                className="absolute top-5 scale-0 transition-all rounded bg-gray-800 p-2 text-xs text-white group-hover:scale-100">{message}</span>
        </div>
    )
}

export default Tooltip;
