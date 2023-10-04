import React, {PropsWithChildren} from 'react';
import SkeletonTitle from "../skeleton/SkeletonTitle";
import SkeletonParagraph from "../skeleton/SkeletonParagraph";
import StatusIndicator, {StatusType} from "../StatusIndicator";

export interface StatusCardSkeletonData {
    loading?: boolean
    header?: string
    title?: string
    subtitle?: string
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
        children
    } = props || {};

    const showLoading = loading || (header === undefined && title === undefined);
    return (
        <div className="shadow-md rounded bg-gray-500">
            <div className="p-3 bg-gray-700">
                <SkeletonTitle show={showLoading}/>
                <div className={`flex ${showLoading ? 'hidden' :''}`}>
                    <div className="flex-auto text-left">
                        {header ? <div className="font-semibold">{header}</div> : null}
                        {title ? <div className="font-semibold">{title}</div> : null}
                        {subtitle ? <div className="text-sm">{subtitle}</div> : null}
                    </div>
                    <div className="flex items-center text-right">{status}<StatusIndicator type={statusType}/></div>
                </div>
            </div>
            <div className="p-3">
                {loading ? <SkeletonParagraph/> : children}
            </div>
        </div>
    );
}
export default StatusCardSkeleton;
