import React from 'react';

const SkeletonTitle = () => {
    return (
        <div className="max-w-sm animate-pulse">
            <div className="h-2.5 rounded-full bg-gray-400 w-48 mb-4"></div>
        </div>
    );
}

export default SkeletonTitle;
