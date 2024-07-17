import {PropsWithChildren} from "react";
import clsx from "clsx";

export interface TooltipProps {
    classNames?: string[]
    style?: object
}

const defaultStyle = {marginLeft: '2px', display: 'inline-block'};

const ExternalLink = (props: PropsWithChildren<TooltipProps>) => {
    const {classNames = [], style = defaultStyle } = props;
    const classes = [];
    clsx(classes.concat(classNames))
    return (
        <svg width="13.5" height="13.5" aria-hidden="true" viewBox="0 0 24 24"
             className={clsx(classes.concat(classNames))} style={style}>
            <path fill="currentColor"
                  d="M21 13v10h-21v-19h12v2h-10v15h17v-8h2zm3-12h-10.988l4.035 4-6.977 7.07 2.828 2.828 6.977-7.07 4.125 4.172v-11z"></path>
        </svg>
    )
}

export default ExternalLink;
