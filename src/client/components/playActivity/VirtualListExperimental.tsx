import { Box } from '@chakra-ui/react';
import { type VirtualItem, useVirtualizer } from "@tanstack/react-virtual";
import React, { useCallback, useMemo } from "react";
import { ActivityCollapsible } from '../ActivityDetail.js';
import { type ActivityLogProps, generateFlatItems, GroupHeader, isGroupInfo } from './ListParts.js';

export const VirtualizedListExp = (props: ActivityLogProps) => {
    const { 
    data = [],
    sortBy,
    live = false,
   } = props;

   const items = useMemo(() => {
    return generateFlatItems(data);
   }, [data]);

    const parentRef = React.useRef<HTMLDivElement>(null)
  const innerRef = React.useRef<HTMLDivElement>(null)
  const rowRefsMap = React.useRef(new Map<number, HTMLDivElement>())

  // The virtualizer
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 85,
    onChange: (instance) => {
      innerRef.current!.style.height = `${instance.getTotalSize()}px`
      instance.getVirtualItems().forEach((virtualRow) => {
        const rowRef = rowRefsMap.current.get(virtualRow.index)
        if (!rowRef) return
        rowRef.style.transform = `translateY(${virtualRow.start}px)`
      })
    },
  });

   const indexes = virtualizer.getVirtualIndexes();

     React.useEffect(() => {
    virtualizer.measure()
  }, [])

  const contentProps = useMemo(
    (): React.ComponentProps<"div"> => ({
      style: {
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
      },
    }),
    [],
  )
     return (<div
        ref={parentRef}
        className="List"
        style={{
          height: 800,
          width: 800,
          overflowY: 'auto',
          contain: 'strict',
          //overflowAnchor: 'none',
        }}
      >
          <Box ref={innerRef} {...contentProps}>

            {indexes.map((index) => {
              const item = items[index];

              return (
              <div
              key={index}
              data-index={index}
              ref={(el) => {
                if (el) {
                  virtualizer.measureElement(el)
                  rowRefsMap.current.set(index, el)
                }
              }}
            >
<Box w="full">
                  {isGroupInfo(item) ? <GroupHeader paddingY="2" data={item}/> : <ActivityCollapsible query={props.query} live={live} sortBy={sortBy} componentId={props.componentId} componentType={props.componentType} activity={item}/>}
                  </Box>
            </div>
            );
            })}
          </Box>
        </div>);
}