import React from 'react';
export interface SkeletonTitleProps {
  show?: boolean
}
const SkeletonTitle = (props?: SkeletonTitleProps) => {
    const {show = true} = props;
    const cn = `max-w-sm animate-pulse${show ? '' : ' hidden'}`;
    return (
        <div className={cn}>
            <div className="h-2.5 rounded-full bg-gray-400 w-48 mb-4"></div>
        </div>
    );
}

export default SkeletonTitle;
