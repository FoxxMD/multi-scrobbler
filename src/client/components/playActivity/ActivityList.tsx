import { Accordion, Container, Stack, Heading } from '@chakra-ui/react';
import { useSSEAnyEvent, useSSEContext } from '@flamefrontend/sse-runtime-react';
import { type InfiniteData, useInfiniteQuery, type UseInfiniteQueryResult, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import doy from 'dayjs/plugin/dayOfYear.js';
import { type ComponentProps, Fragment, useMemo, useState } from "react";
import type {MsSseEvent, MsSseEventPayload, PaginatedResponse, PlayApiCommonDetailed, QueryPlaysOptsJson} from '../../../core/Api.js';
import type {ComponentType} from '../../../core/Atomic.js';
import { type QueryPlaysOptsJsonRefreshable, tanQueries } from '../../queries/index.js';
import { ActivityDetailFetchable, ActivityDetails, ActivitySummary, ActivitySummaryFetchable, ActivitySummarySkeleton } from '../ActivityDetail.js';
import { ErrorAlert } from '../ErrorAlert.js';
import { ListFilters, ListRefereshButton, todayRange } from './ListFilters.js';
import { type ActivityLogProps, generateGroupPlays, GroupHeader } from './ListParts.js';
import { NoPlayResults, VirtualizedListDynamic } from './VirtualListDynamic.js';
import { VirtualizedListExp } from './VirtualListExperimental.js';
import { VirtualizedListNormal } from './VirtualListNormal.js';

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
                        {live ? <ActivityDetailFetchable componentId={props.componentId} componentType={props.componentType} uid={activity.uid} /> : <ActivityDetails activity={activity as PlayApiCommonDetailed} {...props} />}
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

export const ListContainerFetchable = (props: { componentId: number, componentType: ComponentType, filters?: QueryPlaysOptsJsonRefreshable } & Pick<ComponentProps<typeof ActivityList>, 'render'>) => {
  const {
    componentId,
    filters = {}
  } = props;
  const query: QueryPlaysOptsJsonRefreshable = filters; // { ...filters, order: 'desc', sort: 'playedAt' };
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

    const queryClient = useQueryClient();
    const client = useSSEContext<MsSseEvent>();
    useSSEAnyEvent(client, (payload) => {
        if ('componentId' in (payload.data as object) && (payload.data as Record<string, any>).componentId === props.componentId) {
            switch (payload.type) {
              case 'playInsert':
                { 
                  const componentData = payload.data as MsSseEventPayload<PlayApiCommonDetailed>;
                console.debug(`[Insert Check ${componentData.data.uid}] Recieved playInsert for Component ${componentId}, checking if Play can be inserted...`);
                if(playInWindow(componentData.data, query)) {
                  queryClient.setQueryData(tanQueries.activities.list(componentId, query).queryKey, (old: InfiniteData<PaginatedResponse<PlayApiCommonDetailed>, unknown>) => {
                      return insertInfinitePlay(componentData.data, old);
                  });
                } 
              }
            }
        }
    });

  let rendered;
  if (isPending) {
    rendered = <Stack width="100%"><ActivitySummarySkeleton /><ActivitySummarySkeleton /><ActivitySummarySkeleton /></Stack>;
  } else if (isError || status === 'error') {
    rendered = <ErrorAlert error={error} />
  } else if(!isFetching && allPlays.length === 0) {
    rendered = <NoPlayResults type="empty"/>
  } else {
    rendered = <ActivityList total={data?.pages.length > 0 ? data.pages[0].meta.total : undefined} hasNextPage={hasNextPage} fetchNextPage={fetchNextPage} isFetchingNextPage={isFetchingNextPage} render="virtDynamic" data={allPlays} live {...props} sortBy="played" query={query} />;
  }

  return rendered;
}

/** this is based on the assumption data is always playedAt descending */
const insertInfinitePlay = (data: PlayApiCommonDetailed, queryData: InfiniteData<PaginatedResponse<PlayApiCommonDetailed>, unknown>): InfiniteData<PaginatedResponse<PlayApiCommonDetailed>, unknown> => {
  const newQueryData: InfiniteData<PaginatedResponse<PlayApiCommonDetailed>, unknown> = {
    pages: [],
    pageParams: { ...queryData.pageParams }
  };
  console.debug(`[Insert Page Index ${data.uid}] Trying to insert Play...`);
  const playedAt = dayjs(data.play.data.playDate);

  let pageIndex = 0;
  let inserted = false;
  for (const p of queryData.pages) {
    if(inserted === true) {
      newQueryData.pages.push(p);
      continue;
    }
    let beforeIndex: number;
    try {
      beforeIndex = p.data.findIndex(x => dayjs(x.play.data.playDate).isBefore(playedAt));
    } catch (e) {
      console.warn(new Error(`[Insert Page Index ${data.uid}] Error while trying to find index for existing data insert`, { cause: e }));
    }
    if (beforeIndex === -1 || beforeIndex === undefined) {
      if (!inserted) {
        const first = p.data[0].playedAt;
        const last = p.data[p.data.length - 1].playedAt;
        console.debug(`[Insert ${data.uid}] Play playedAt ${data.play.data.playDate} not between ranges on page ${pageIndex}: ${first} to ${last}`);
      }
      newQueryData.pages.push(p);
    } else {
      const first = p.data[0].playedAt;
      const last = p.data[p.data.length - 1].playedAt;
      console.debug(`[Insert ${data.uid}] Play playedAt ${data.play.data.playDate} between ranges on page ${pageIndex}: ${first} to ${last}, inserting at index ${beforeIndex}`);
      inserted = true;
      const {
        data: playData,
        meta
      } = p;
      newQueryData.pages.push({
        meta,
        data: [...playData.slice(0, beforeIndex),
        {
          ...data,
          // @ts-expect-error only used for inserts in this context
          isNew: true
        }
          , ...playData.slice(beforeIndex)]
      });
    }
    pageIndex++;
  }

  return newQueryData;
}

// const updateInfinitePlay = (data: PlayApiCommonDetailed, queryData: InfiniteData<PaginatedResponse<PlayApiCommonDetailed>, unknown>): InfiniteData<PaginatedResponse<PlayApiCommonDetailed>, unknown> => {
//   const newQueryData: InfiniteData<PaginatedResponse<PlayApiCommonDetailed>, unknown> = {
//     pages: [],
//     pageParams: {...queryData.pageParams}
//   };

//   for(const p of queryData.pages) {
//     const afterIndex = p.data.findIndex(x => x.uid === data.uid);
//     if(afterIndex === -1) {
//       newQueryData.pages.push(p);
//     } else {
//       const {
//         data: playData,
//         meta
//       } = p;
//       newQueryData.pages.push({
//         meta,
//         data: [...playData.slice(0, afterIndex), {...p.data[afterIndex], ...data}, ...playData.slice(afterIndex)]
//       });
//     }
//   }

//   return newQueryData;
// }

const playInWindow = (data: PlayApiCommonDetailed, query: QueryPlaysOptsJson): boolean => {
  if (query.state !== undefined && !query.state.includes(data.state)) {
    console.debug(`[Insert Check ${data.uid}] Play is in state ${data.state} not included in current filters of ${query.state.join(',')}`);
    return false;
  }
  if (query.text !== undefined) {
    let someFound = false;
    for (const t of query.text) {
      if (data.play.data.track?.toLocaleLowerCase().includes(t)) {
        someFound = true;
        break;
      }
      if (data.play.data.track.toLocaleLowerCase().includes(t)) {
        someFound = true;
        break;
      }
      if ((data.play.data.artists ?? []).some(x => x.name.toLocaleLowerCase().includes(t))) {
        someFound = true;
      }
    }
    if (!someFound) {
      console.debug(`[Insert Check ${data.uid}] Play does not match current phrase filters`);
      return false;
    }
  }
  const played = dayjs(data.play.data.playDate);
  if (query.playedAt.type === 'between' && (
    !played.isAfter(dayjs(query.playedAt.range[0]))
    || !played.isBefore(dayjs(query.playedAt.range[1])))) {
      console.debug(`[Insert Check ${data.uid}] Play playedAt ${data.play.data.playDate} is not between filter date range of ${query.playedAt.range[0]} and ${query.playedAt.range[1]}`);
    return false;
  }
  // TODO playedAt with comparisons that aren't between
  return true;
}

export const ListContainerFilterable = (props: { componentId: number, componentType: ComponentType } & Pick<ComponentProps<typeof ActivityList>, 'render'>) => {
  const {componentType} = props;
  const [filters, setFilter] = useState<QueryPlaysOptsJsonRefreshable>({
    playedAt: {
      type: 'between',
      range: todayRange,
      inclusive: true
    },
    order: 'desc',
    sort: 'playedAt'
  });
  return (
    <Stack width="100%" gap="4">
      <Heading size="3xl" width="100%">{componentType === 'source' ? 'Plays' : 'Scrobbles'}<ListRefereshButton size="md" componentId={props.componentId} filters={filters}/></Heading>
      <ListFilters componentType={props.componentType} filters={filters} onChange={setFilter}/>
      <ListContainerFetchable {...props} filters={filters} />
    </Stack>
  )
}