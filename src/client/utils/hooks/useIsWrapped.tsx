import React, { ComponentProps, useState, useLayoutEffect } from "react"
import useResizeObserver from '@react-hook/resize-observer';

const getTop = item => Math.round(item.getBoundingClientRect().top);

const getIsWrapped = (target: Element) => {
    if(target === undefined || target === null || target.children === undefined || target.children === null) {
        return false;
    }
    const flexItems = target.children; // flexBox.children;

    // target must have 'flex-direction: row'
    // for this to work

    const firstItemTop = getTop(flexItems[0]);
    //const lastItemTop = getTop(flexItems[flexItems.length - 1]);

    for (const flexItem of flexItems) {
        const isItemWrapped = firstItemTop < getTop(flexItem);
        if (isItemWrapped) {
            //setAlign('left');
            return true;
        }
    }
    return false;
}

export const useIsWrapped = (target: React.RefObject<Element>) => {
    const [isWrapped, setIsWrapped] = React.useState<boolean>(false);

    useLayoutEffect(() => {

        const newIsWrapped = getIsWrapped(target.current);
        setIsWrapped(newIsWrapped);
    }, [target, setIsWrapped]);

    useResizeObserver(target, (entry) => setIsWrapped(getIsWrapped(entry.target)))
    return isWrapped;
}