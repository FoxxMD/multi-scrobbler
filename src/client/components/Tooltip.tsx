import {PropsWithChildren, ReactElement} from "react";

export interface TooltipProps {
    message: string | ReactElement
}

const Tooltip = (props: PropsWithChildren<TooltipProps>) => {
    const {children, message} = props;
    return (
        <div className="group relative flex">
            {children}
            <span
                className="absolute top-5 scale-0 transition-all rounded bg-gray-800 p-2 text-xs text-white group-hover:scale-100">{message}</span>
        </div>
    )
}

export default Tooltip;
