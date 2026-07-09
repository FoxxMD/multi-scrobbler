import { Box, ScrollArea } from '@chakra-ui/react';
import { type VirtualItem, useVirtualizer } from "@tanstack/react-virtual";
import React, { useCallback, useMemo } from "react";
import { ActivityCollapsible } from '../ActivityDetail.js';
import { type ActivityLogProps, generateFlatItems, GroupHeader, isGroupInfo } from './ListParts.js';

export const VirtualizedListNormal = (props: ActivityLogProps) => {
    const { 
    data = [],
    sortBy,
    live = false,
   } = props;

   const items = useMemo(() => {
    return generateFlatItems(data);
   }, [data]);

  const parentRef = React.useRef(null)

  // The virtualizer
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 85,
  });

  const contentProps = useMemo(
    (): React.ComponentProps<"div"> => ({
      style: {
        height: `${virtualizer.getTotalSize()}px`,
        width: "100%",
        position: "relative",
      },
    }),
    [virtualizer],
  )

  const getItemProps = useCallback(
    (item: VirtualItem): React.ComponentProps<"div"> => ({
      style: {
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        paddingBottom: 4,
        height: `${item.size}px`,
        transform: `translateY(${item.start}px)`,
      },
    }),
    [],
  )
     return (<ScrollArea.Root height="50vh" >
      <ScrollArea.Viewport ref={parentRef}>
        <ScrollArea.Content>
          <Box {...contentProps}>
            {virtualizer.getVirtualItems().map((virtualItem) => {
              const item = items[virtualItem.index]
              return (
                <div 
                data-index={virtualItem.index}
                key={virtualItem.key} 
                ref={virtualizer.measureElement} 
                {...getItemProps(virtualItem)}>
                  <Box w="full">
                  {isGroupInfo(item) ? <GroupHeader paddingY="2" data={item}/> : <ActivityCollapsible query={props.query} live={live} sortBy={sortBy} componentId={props.componentId} componentType={props.componentType} activity={item}/>}
                  </Box>
                </div>)
          })}
          </Box>
        </ScrollArea.Content>
      </ScrollArea.Viewport>
      <ScrollArea.Scrollbar bg="transparent" />
    </ScrollArea.Root>);
}
