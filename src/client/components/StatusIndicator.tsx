import React, {PropsWithChildren} from 'react';

export type StatusType = 'active' | 'warn' | 'error' | 'inactive' | string;

// must use full class names for tailwind to avoid purging
// https://github.com/tailwindlabs/tailwindcss/discussions/7745#discussioncomment-3304940
const statusToColor = (status: StatusType) => {
    switch (status) {
        case 'active':
            return 'bg-green-500';
        case 'warn':
            return 'bg-yellow-500';
        case 'error':
            return 'bg-red-500';
        case 'inactive':
        default:
            return 'bg-gray-500';
    }
}

const StatusIndicator = (props: PropsWithChildren<{ type: StatusType }>) => {
    const cn = `flex w-3 h-3 ${statusToColor(props.type)} rounded-full ml-1.5`
    return <span className={cn}>{props.children}</span>;
}

export default StatusIndicator;
