import { Accordion, Span, Stack, Text, Box, Separator, HStack, Flex, IconButton, Container, SkeletonText, Collapsible, ScrollArea, SystemStyleObject } from '@chakra-ui/react';
import React, { ComponentProps, Fragment, useMemo, useCallback } from "react"
import { ActivityCollapsible } from '../ActivityDetail.js';
import { type VirtualItem, useVirtualizer } from "@tanstack/react-virtual"
import { ActivityLogProps, generateFlatItems, GroupHeader, isGroupInfo } from './ListParts.js';
import { UseInfiniteQueryResult } from '@tanstack/react-query';

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

const scrollShadowCss: SystemStyleObject = {
  "--scroll-shadow-size": "4rem",
  maskImage: "linear-gradient(#000, #000)",
  "&[data-overflow-y]": {
    maskImage:
      "linear-gradient(#000,#000,transparent 0,#000 var(--scroll-shadow-size),#000 calc(100% - var(--scroll-shadow-size)),transparent)",
    "&[data-at-top]": {
      maskImage:
        "linear-gradient(180deg,#000 calc(100% - var(--scroll-shadow-size)),transparent)",
    },
    "&[data-at-bottom]": {
      maskImage:
        "linear-gradient(0deg,#000 calc(100% - var(--scroll-shadow-size)),transparent)",
    },
  },
};

export const VirtualizedListDynamic = (props: ActivityLogProps & Pick<UseInfiniteQueryResult, 'hasNextPage' | 'isFetchingNextPage' | 'fetchNextPage'>) => {
  const {
    data = [],
    sortBy,
    live = false,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage
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
    //debug: true
  });

    React.useEffect(() => {
    const [lastItem] = [...virtualizer.getVirtualItems()].reverse()

    if (!lastItem) {
      return
    }

    if (
      lastItem.index >= data.length - 1 &&
      hasNextPage &&
      !isFetchingNextPage
    ) {
      fetchNextPage()
    }
  }, [
    hasNextPage,
    fetchNextPage,
    data.length,
    isFetchingNextPage,
    virtualizer.getVirtualItems(),
  ])


  // doesn't seem like i need this for height to work correctly?
  //
  // const contentProps = useMemo(
  //   (): React.ComponentProps<"div"> => ({
  //     style: {
  //       height: `${virtualizer.getTotalSize()}px`,
  //       width: "100%",
  //       position: "relative",
  //     },
  //   }),
  //   [virtualizer],
  // )

  return (
    <ScrollArea.Root height="70vh" variant="always" w="full">
  <ScrollArea.Viewport
    ref={parentRef}
    css={scrollShadowCss}
  >
    <ScrollArea.Content>
    <Box ref={virtualizer.containerRef} style={containerStyle} >
      {virtualizer.getVirtualItems().map((virtualItem) => {
        const item = items[virtualItem.index]
        const isLoaderRow = virtualItem.index > data.length - 1
        return (
            <Box w="full"
            data-index={virtualItem.index}
            key={virtualItem.key}
            ref={virtualizer.measureElement}
            style={itemContainerStyle}>
              {isLoaderRow
                    ? hasNextPage
                      ? 'Loading more...'
                      : 'Nothing more to load'
                    : <ItemContainer query={props.query} live={live} sortBy={sortBy} componentId={props.componentId} componentType={props.componentType} activity={item} paddingY="2" data={item}/>}
            </Box>)
      })}
    </Box>
    </ScrollArea.Content>
  </ScrollArea.Viewport>
   <ScrollArea.Scrollbar bg="transparent" />
  </ScrollArea.Root>);
}

const ItemContainer = (props: ComponentProps<typeof GroupHeader> & ComponentProps<typeof ActivityCollapsible>) => {
  if(isGroupInfo(props.data)) {
    return <GroupHeader paddingY="2" data={props.data} />
  }
  return <ActivityCollapsible query={props.query} live={props.live} sortBy={props.sortBy} componentId={props.componentId} componentType={props.componentType} activity={props.activity} />
}