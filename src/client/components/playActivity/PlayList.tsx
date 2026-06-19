import { Accordion, For, Span, Stack, Text, Box, AbsoluteCenter, Button, Separator, HStack, Flex, Badge, IconButton, Container, Collapsible, SkeletonText } from '@chakra-ui/react';
import { ComponentType, JsonPlayObject, PlayActivity } from '../../../core/Atomic.js';
import { ShortDateDisplay } from '../DateDisplay.js';
import { TextMuted } from '../TextMuted.js';
import { LuChevronRight } from "react-icons/lu"
import { capitalize } from '../../../core/StringUtils.js';
import React, { ComponentProps, useMemo, forwardRef, Fragment } from "react"
import dayjs, { Dayjs } from 'dayjs';
import doy from 'dayjs/plugin/dayOfYear.js';
import { VscDebugRestart } from "react-icons/vsc";
import { GroupedVirtuoso, Components, LogLevel } from 'react-virtuoso'
import { ActivityDetailFetchable, ActivityDetails, ActivitySummary, ActivitySummaryFetchable } from '../ActivityDetail.js';
import { sortByNewestPlayDate, sortByNewestSeenDate } from '../../../core/PlayUtils.js';
import "./PlayList.scss";
import { PlayApiCommon, PlayApiCommonDetailed, SortPlaysByProps } from '../../../core/Api.js';
import { QueryPlaysOpts } from '../../../backend/common/database/drizzle/repositories/PlayRepository.js';
import ky from 'ky';
import { baseUrl } from '../../utils/index.js';
import { PaginatedResponse } from '../../../backend/common/database/drizzle/repositories/BaseRepository.js';
import { QueryFunctionContext, useQuery } from '@tanstack/react-query';
import { ErrorAlert } from '../ErrorAlert.js';
import { useParams } from 'react-router-dom';
import { queries } from 'storybook/test';
import { tanQueries } from '../../queries/index.js';

dayjs.extend(doy);

export interface ActivityLogProps extends SortPlaysByProps {
  data: PlayApiCommon[]
  componentId: number
  componentType: ComponentType
  render?: 'virtCollapse' | 'virtAccordian' | 'accordian'
  query: QueryPlaysOpts
  live?: boolean
}

interface GroupInfo {
  count: number
  date: Dayjs
}

interface GroupData {
  plays: PlayApiCommon[]
  date: Dayjs
}

const generateGroupPlays = (data: PlayApiCommon[]): GroupData[] => {

  if(data.length === 0) {
    return [];
  }
  const groupsReduced = data.reduce((acc: { groups: GroupData[], active?: GroupData }, curr, index) => {
    const date = dayjs(curr.play.data.playDate);
    if (acc.active === undefined) {
      return { ...acc, active: { plays: [curr], date } };
    }
    if (acc.active.date.dayOfYear() !== date.dayOfYear()) {
      return { groups: [...acc.groups, acc.active], active: { plays: [curr], date } }
    }

    return { groups: acc.groups, active: { ...acc.active, plays: acc.active.plays.concat(curr) } };
  }, { groups: [] });

  if(groupsReduced.active !== null && groupsReduced !== undefined) {
    return groupsReduced.groups.concat(groupsReduced.active);
  }

  return groupsReduced.groups;
}

export const PlayList = (props: ActivityLogProps) => {

  const {
    data = [],
    sortBy = 'played',
    render = 'accordian'
  } = props;

  if (render === 'accordian') {
    return <PlainAccordian data={data} sortBy={sortBy} {...props} />
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
        let headerText: string;
        if (g.date.isToday()) {
          headerText = 'Today';
        } else {
          headerText = g.date.format('MMM DD');
          if (g.date.year() !== dayjs().year()) {
            headerText += `, ${g.date.year()}`;
          }
        }
        return (
          <Fragment>
            <Box>
              <Flex direction="row" justify="space-between">

                <Text fontWeight="semibold">{headerText}</Text>

                <IconButton variant="ghost" size="xs" maxWidth="fit-content">
                  <VscDebugRestart />
                </IconButton>
              </Flex>
              <Separator orientation="horizontal" height="4" />
            </Box>
            <Accordion.Root variant="enclosed" collapsible multiple lazyMount>
              {g.plays.map((activity, index) => {
                const { play } = activity;
                return (
                  <Accordion.Item key={index} value={index.toString()}>
                    <Accordion.ItemTrigger truncate cursor="pointer">
                      <Accordion.ItemIndicator />
                    {live ? <ActivitySummaryFetchable activityUid={activity.uid} {...props}/> : <ActivitySummary componentType={props.componentType} activity={activity} sortBy={sortBy}/>}
                    </Accordion.ItemTrigger>
                    <Accordion.ItemContent>
                      <Accordion.ItemBody borderTopColor="gray.border" >
                        {live ? <ActivityDetailFetchable componentId={props.componentId} componentType={props.componentType} query={props.query} uid={activity.uid} /> : <ActivityDetails activity={activity as PlayApiCommonDetailed} {...props}/>}
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
    ...tanQueries.activities.list(props.componentId, {order: 'desc', sort: 'playedAt'})
  });

  let rendered;
  if (isPending && data === undefined) {
    rendered = <PlayListSkeleton/>;
  } else if (isError) {
    rendered = <ErrorAlert error={error} />
  } else {
    rendered = <PlayList data={data.data} live {...props} sortBy="played" query={{order: 'desc', sort: 'playedAt'}} />;
  }

  return rendered; // <Container maxWidth="3xl">{rendered}</Container>
}