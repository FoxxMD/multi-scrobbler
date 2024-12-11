import React, {PropsWithChildren, ReactElement} from 'react';
import SkeletonTitle from "../skeleton/SkeletonTitle";
import SkeletonParagraph from "../skeleton/SkeletonParagraph";
import StatusIndicator, {StatusType} from "../StatusIndicator";

export interface StatusCardSkeletonData {
    loading?: boolean
    header?: string
    title?: string
    subtitle?: string
    subtitleRight?: string | ReactElement
    status?: string
    statusType?: StatusType
}

const StatusCardSkeleton = (props: PropsWithChildren<StatusCardSkeletonData>) => {
    const {
        loading,
        header,
        status = null,
        statusType,
        title,
        subtitle,
        subtitleRight,
        children
    } = props || {};

    const showLoading = loading || (header === undefined && title === undefined);
    return (
        <div className="shadow-md rounded bg-gray-500">
            <div className="p-3 bg-gray-700">
                <SkeletonTitle show={showLoading}/>
                <div className={`flex ${showLoading ? 'hidden' : ''}`}>
                    <div className="flex-auto text-left">
                        {header ? <div className="font-semibold">{header}</div> : null}
                        {title ? <div className="font-semibold">{title}</div> : null}
                        {subtitle ? <div className="text-sm">{subtitle}</div> : null}
                    </div>
                    <div className="text-right">
                        <div className="flex items-center justify-end">{status}<StatusIndicator type={statusType}/></div>
                        {subtitleRight ? <div className="text-sm justify-end">{subtitleRight}</div> : null}
                    </div>
                </div>
            </div>
            <div className="p-3">
                {loading ? <SkeletonParagraph/> : children}
            </div>
        </div>
    );
}
export default StatusCardSkeleton;
