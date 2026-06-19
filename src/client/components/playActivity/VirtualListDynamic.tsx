import { Accordion, Span, Stack, Text, Box, Separator, HStack, Flex, IconButton, Container, SkeletonText, Collapsible, ScrollArea } from '@chakra-ui/react';
import React, { ComponentProps, Fragment, useMemo, useCallback } from "react"
import { ActivityCollapsible } from '../ActivityDetail.js';
import { type VirtualItem, useVirtualizer } from "@tanstack/react-virtual"
import { ActivityLogProps, generateFlatItems, GroupHeader, isGroupInfo } from './ListParts.js';

const itemContainerStyle: React.ComponentProps<"div">['style'] = {
  position: "absolute",
  top: 0,
  left: 0,
  width: "100%",
  paddingBottom: 4,
};

const containerStyle: React.ComponentProps<"div">['style'] = {
  width: "100%",
  position: "relative",
}

export const VirtualizedListDynamic = (props: ActivityLogProps) => {
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
    directDomUpdates: true,
    debug: true
  });

  return (<div
    ref={parentRef}
    className="List"
    style={{
      height: 800,
      width: 800,
      overflowY: 'auto',
      contain: 'strict',
      overflowAnchor: 'none',
    }}
  >
    <Box ref={virtualizer.containerRef} style={containerStyle}>
      {virtualizer.getVirtualItems().map((virtualItem) => {
        const item = items[virtualItem.index]
        return (
            <Box w="full"
            data-index={virtualItem.index}
            key={virtualItem.key}
            ref={virtualizer.measureElement}
            style={itemContainerStyle}>
              {isGroupInfo(item) ? <GroupHeader paddingY="2" data={item} /> : <ActivityCollapsible query={props.query} live={live} sortBy={sortBy} componentId={props.componentId} componentType={props.componentType} activity={item} />}
            </Box>)
      })}
    </Box>
  </div>);
}