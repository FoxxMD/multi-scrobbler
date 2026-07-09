import React, { useState, useRef } from 'react';
import { Splitter } from '@chakra-ui/react';
import {
    Outlet
} from "react-router-dom";
import { LogsFetchable } from '../LogsNext.js';

const getLayoutKey = (panels: Array<{ id: string }>): string => {
    return panels.map((p) => p.id).join(":")
}

const initialPanels: Splitter.PanelData[] = [
    { id: "main", order: 0 },
    { id: "logs", order: 1 },
]

export const SplitLayout = () => {
    const [sizes, setSizes] = useState<number[]>([75, 25]);
    const initialLayout = getLayoutKey(initialPanels);
    const layoutCache = useRef<Record<string, number[]>>({
        [initialLayout]: [],
    });

    return (<>
        <Splitter.Root
            p="0"
            panels={[{ id: 'main', minSize: 20, order: 0, resizeBehavior: "preserve-pixel-size" }, { id: 'logs', minSize: 20, order: 1 }]}

            defaultSize={sizes}
            orientation="vertical"

            onResize={({ size, layout }) => {
                setSizes(size)
                layoutCache.current[layout] = size
            }}
            minH="90vh"
        >
            <Splitter.Panel id="main">
                <Outlet />
            </Splitter.Panel>
            <Splitter.ResizeTrigger id="main:logs" />
            <Splitter.Panel
                borderWidth="1px"
                id="logs">
                <LogsFetchable />
            </Splitter.Panel>
        </Splitter.Root>
    </>);
}