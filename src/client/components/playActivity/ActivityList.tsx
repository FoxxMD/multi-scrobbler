import { Accordion, Span, Stack, Text, Box, HStack, Flex, Container, SkeletonText, Wrap, Card, Collapsible, Separator } from '@chakra-ui/react';
import { ComponentType, PlayState, } from '../../../core/Atomic.js';
import React, { ComponentProps, Fragment, useMemo, useCallback, useState } from "react"
import dayjs, { Dayjs } from 'dayjs';
import doy from 'dayjs/plugin/dayOfYear.js';
import { ActivityDetailFetchable, ActivityDetails, ActivitySummary, ActivitySummaryFetchable, ActivitySummarySkeleton } from '../ActivityDetail.js';
import "./PlayList.scss";
import { PlayApiCommonDetailed } from '../../../core/Api.js';
import { useQuery, useInfiniteQuery, UseInfiniteQueryResult } from '@tanstack/react-query';
import { ErrorAlert } from '../ErrorAlert.js';
import { tanQueries } from '../../queries/index.js';
import { VirtualizedListNormal } from './VirtualListNormal.js';
import { NoPlayResults, VirtualizedListDynamic } from './VirtualListDynamic.js';
import { VirtualizedListExp } from './VirtualListExperimental.js';
import { ActivityLogProps, generateGroupPlays, GroupHeader } from './ListParts.js';
import { ListFilters, todayRange } from './ListFilters.js';
import { QueryPlaysOpts, QueryPlaysOptsJson } from '../../../backend/common/database/drizzle/repositories/PlayRepository.js';

dayjs.extend(doy);

export const ActivityList = (props: ActivityLogProps & Pick<UseInfiniteQueryResult, 'hasNextPage' | 'isFetchingNextPage' | 'fetchNextPage'>) => {

  const {
    data = [],
    sortBy = 'played',
    render = 'accordian'
  } = props;

  if (render === 'accordian') {
    return <PlainAccordian data={data} sortBy={sortBy} {...props} />
  }
  if (render === 'virtNormal') {
    return <VirtualizedListNormal data={data} sortBy={sortBy} {...props} />
  }
  if (render === 'virtDynamic') {
    return <VirtualizedListDynamic data={data} sortBy={sortBy} {...props} />
  }
  if (render === 'virtExp') {
    return <VirtualizedListExp data={data} sortBy={sortBy} {...props} />
  }
}


const PlainAccordian = (props: ActivityLogProps) => {
  const {
    data = [],
    sortBy,
    live = false
  } = props;
  const groups = generateGroupPlays(data);
  return (
    <Stack gap="2">
      {groups.map((g) => {
        return (
          <Fragment key={g.date.valueOf()}>
            <GroupHeader data={{ date: g.date, count: g.plays.length }} />
            <Accordion.Root variant="enclosed" collapsible multiple lazyMount>
              {g.plays.map((activity, index) => {
                const { play } = activity;
                return (
                  <Accordion.Item key={index} value={index.toString()}>
                    <Accordion.ItemTrigger truncate cursor="pointer">
                      <Accordion.ItemIndicator />
                      {live ? <ActivitySummaryFetchable activityUid={activity.uid} {...props} /> : <ActivitySummary componentType={props.componentType} activity={activity} sortBy={sortBy} />}
                    </Accordion.ItemTrigger>
                    <Accordion.ItemContent>
                      <Accordion.ItemBody borderTopColor="gray.border" >
                        {live ? <ActivityDetailFetchable componentId={props.componentId} componentType={props.componentType} query={props.query} uid={activity.uid} /> : <ActivityDetails activity={activity as PlayApiCommonDetailed} {...props} />}
                      </Accordion.ItemBody>
                    </Accordion.ItemContent>
                  </Accordion.Item>
                )
              })}
            </Accordion.Root>
          </Fragment>
        )
      })}
    </Stack>
  );
}


export const ListContainer = (props?: ComponentProps<typeof ActivityList>) => {
  return <Container maxWidth="3xl"><ActivityList {...props} /></Container>
}

export const ListContainerFetchable = (props: { componentId: number, componentType: ComponentType, filters?: QueryPlaysOptsJson } & Pick<ComponentProps<typeof ActivityList>, 'render'>) => {
  const {
    componentId,
    filters = {}
  } = props;
  const query: QueryPlaysOptsJson = { ...filters, order: 'desc', sort: 'playedAt' };
  const { 
    isPending, 
    isError, 
    data, 
    error,
    fetchNextPage,
    hasNextPage,
    isFetching,
    isFetchingNextPage,
    status
  } = useInfiniteQuery({
    ...tanQueries.activities.list(componentId, query),
    initialPageParam: 0,
  getNextPageParam: (lastPage, allPages, lastPageParam) => {
    if (lastPage.data.length < lastPage.meta.limit) {
      return undefined
    }
    return lastPage.meta.offset + lastPage.meta.limit
  },
  });

  const allPlays = useMemo(() => data === undefined ? [] : data.pages.flatMap(x => x.data).filter(x => x !== null && x !== undefined),[data]);

  let rendered;
  if (status === 'pending' && data === undefined) {
    rendered = <Stack><ActivitySummarySkeleton /><ActivitySummarySkeleton /><ActivitySummarySkeleton /></Stack>;
  } else if (isError || status === 'error') {
    rendered = <ErrorAlert error={error} />
  } else if(!isFetching && allPlays.length === 0) {
    rendered = <NoPlayResults type="empty"/>
  } else {
    rendered = <ActivityList total={data?.pages.length > 0 ? data.pages[0].meta.total : undefined} hasNextPage={hasNextPage} fetchNextPage={fetchNextPage} isFetchingNextPage={isFetchingNextPage} render="virtDynamic" data={allPlays} live {...props} sortBy="played" query={query} />;
  }

  return rendered;
}

export const ListContainerFilterable = (props: { componentId: number, componentType: ComponentType } & Pick<ComponentProps<typeof ActivityList>, 'render'>) => {
  const [filters, setFilter] = useState<QueryPlaysOptsJson>({
    playedAt: {
      type: 'between',
      range: todayRange,
      inclusive: true
    }
  });
  return (
    <Stack gap="4">
      <ListFilters componentType={props.componentType} filters={filters} onChange={setFilter}/>
      <ListContainerFetchable {...props} filters={filters} />
    </Stack>
  )
}