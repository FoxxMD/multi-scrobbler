import React, {PropsWithChildren} from 'react';
import SkeletonTitle from "../skeleton/SkeletonTitle";
import SkeletonParagraph from "../skeleton/SkeletonParagraph";

export interface StatusCardSkeletonData {
    loading?: boolean
    header?: string
}

const StatusCardSkeleton = (props: PropsWithChildren<StatusCardSkeletonData>) => {
    const {
        loading,
        header,
        children
    } = props || {};

    return (
        <div className="shadow-md rounded my-6 bg-gray-500">
            <div className="p-3 font-semibold bg-gray-700">
                <h3>{loading || header === undefined ? <SkeletonTitle/> : header}</h3>
            </div>
            <div className="p-3">
                {loading ? <SkeletonParagraph/> : children}
            </div>
        </div>
    );
}
export default StatusCardSkeleton;
