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
            <div className="space-x-4 p-6 md:px-10 md:py-6 leading-6 font-semibold bg-gray-700">
                <h3>{loading || header === undefined ? <SkeletonTitle/> : header}</h3>
            </div>
            <div className="p-6 md:px-10 md:py-6">
                {loading ? <SkeletonParagraph/> : children}
            </div>
        </div>
    );
}
export default StatusCardSkeleton;
