import { Accordion, Span, Stack, Text, Box, HStack, Flex, Container, SkeletonText, Wrap, Card } from '@chakra-ui/react';
import { ComponentType, } from '../../../core/Atomic.js';
import React, { ComponentProps, Fragment, useMemo, useCallback, useState } from "react"
import dayjs, { Dayjs } from 'dayjs';
import doy from 'dayjs/plugin/dayOfYear.js';
import { ActivityDetailFetchable, ActivityDetails, ActivitySummary, ActivitySummaryFetchable } from '../ActivityDetail.js';
import "./PlayList.scss";
import { PlayApiCommonDetailed } from '../../../core/Api.js';
import { useQuery } from '@tanstack/react-query';
import { ErrorAlert } from '../ErrorAlert.js';
import { tanQueries } from '../../queries/index.js';
import { VirtualizedListNormal } from './VirtualListNormal.js';
import { VirtualizedListDynamic } from './VirtualListDynamic.js';
import { VirtualizedListExp } from './VirtualListExperimental.js';
import { ActivityLogProps, generateGroupPlays, GroupHeader } from './ListParts.js';
import { PhraseFilter, PlayDateRangeFilter, PlayStateFilter } from './ListFilters.js';
import { cardHeaderSeparator } from '../../utils/ComponentUtils.js';

dayjs.extend(doy);

export const PlayList = (props: ActivityLogProps) => {

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


export const ListContainer = (props?: ComponentProps<typeof PlayList>) => {
  return <Container maxWidth="3xl"><PlayList {...props} /></Container>
}

export const PlayListSkeleton = () => {
  return (
    <Accordion.Root variant="enclosed" collapsible>
      <Accordion.Item value="pending">
        <Accordion.ItemContent>
          <Accordion.ItemBody borderTopColor="gray.border" >
            <SkeletonText noOfLines={2} />
          </Accordion.ItemBody>
        </Accordion.ItemContent>
      </Accordion.Item>
    </Accordion.Root>
  );
}

export const ListContainerFetchable = (props: { componentId: number, componentType: ComponentType } & Pick<ComponentProps<typeof PlayList>, 'render'>) => {

  const { isPending, isError, data, error } = useQuery({
    ...tanQueries.activities.list(props.componentId, { order: 'desc', sort: 'playedAt' })
  });

  let rendered;
  if (isPending && data === undefined) {
    rendered = <PlayListSkeleton />;
  } else if (isError) {
    rendered = <ErrorAlert error={error} />
  } else {
    rendered = <PlayList render="virtDynamic" data={data.data} live {...props} sortBy="played" query={{ order: 'desc', sort: 'playedAt' }} />;
  }

  return rendered; // <Container maxWidth="3xl">{rendered}</Container>
}

// export const ListContainerFilterable = (props: { componentId: number, componentType: ComponentType } & Pick<ComponentProps<typeof PlayList>, 'render'>) => {
//   return (
//     <Stack gap="4">
//       <Card.Root size="sm" variant="outline">
//         <Card.Header {...cardHeaderSeparator}>
//           Filters
//         </Card.Header>
//         <Card.Body px="3" py="4">
//           <Flex wrap="1" gap="10">
//             <PlayStateFilter mode={props.componentType} />
//             <PhraseFilter />
//             <PlayDateRangeFilter />
//           </Flex>
//         </Card.Body>
//       </Card.Root>
//       <ListContainerFetchable {...props} />
//     </Stack>
//   )
// }

export const ListContainerFilterable = (props: { componentId: number, componentType: ComponentType } & Pick<ComponentProps<typeof PlayList>, 'render'>) => {
  return (
    <Stack gap="4">
          <Flex wrap="1" gap="5">
            <PlayStateFilter mode={props.componentType} />
            <PhraseFilter />
            <PlayDateRangeFilter />
          </Flex>
      <ListContainerFetchable {...props} />
    </Stack>
  )
}