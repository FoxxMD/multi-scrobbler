import { Accordion, Span, Stack, Text, Box, Separator, HStack, Flex, IconButton, Container, SkeletonText, Collapsible, ScrollArea } from '@chakra-ui/react';
import { ComponentType } from '../../../core/Atomic.js';
import React, { ComponentProps, Fragment, useMemo, useCallback } from "react"
import dayjs, { Dayjs } from 'dayjs';
import doy from 'dayjs/plugin/dayOfYear.js';
import { PlayApiCommon, PlayApiCommonDetailed, SortPlaysByProps } from '../../../core/Api.js';
import { QueryPlaysOpts, QueryPlaysOptsJson } from '../../../backend/common/database/drizzle/repositories/PlayRepository.js';
import { VscDebugRestart } from 'react-icons/vsc';
import { sortByNewestDate } from '../../../core/PlayUtils.js';
import { getAllIndexes } from '../../../core/DataUtils.js';

dayjs.extend(doy);

export interface GroupInfo {
  count: number
  date: Dayjs
}

export interface GroupData {
  plays: PlayApiCommon[]
  date: Dayjs
}

export interface ActivityLogProps extends SortPlaysByProps {
  data: PlayApiCommon[]
  componentId: number
  componentType: ComponentType
  render?: 'virtNormal' | 'virtDynamic' | 'virtExp' | 'accordian'
  query: QueryPlaysOptsJson
  live?: boolean
  total?: number
}


export const GroupHeader = (props: { data: GroupInfo } & ComponentProps<typeof Box>) => {
    const {
        data,
        ...rest
    } = props;
  const gData = data;
  let headerText: string;
  if (gData.date.isToday()) {
    headerText = 'Today';
  } else {
    headerText = gData.date.format('MMM DD');
    if (gData.date.year() !== dayjs().year()) {
      headerText += `, ${gData.date.year()}`;
    }
  }
  return (
    <Box {...rest}>
      <Flex direction="row" justify="space-between">

        <Text fontWeight="semibold">{headerText} ({data.count} Plays)</Text>

        <IconButton variant="ghost" size="xs" maxWidth="fit-content">
          <VscDebugRestart />
        </IconButton>
      </Flex>
      <Separator orientation="horizontal" height="4" />
    </Box>
  )
}

export const isGroupInfo = (val: any): val is GroupInfo => val.date !== undefined;

export const generateGroupInfo = (data: PlayApiCommon[]): GroupInfo[] => {

  const groupsReduced = data.reduce((acc: { groups: GroupInfo[], active?: GroupInfo }, curr, index) => {
    const date = dayjs(curr.play.data.playDate);
    if (acc.active === undefined) {
      return { ...acc, active: { count: 1, date } };
    }
    if (acc.active.date.dayOfYear() !== date.dayOfYear()) {
      return { groups: [...acc.groups, acc.active], active: { count: 1, date } }
    }

    return { groups: acc.groups, active: { ...acc.active, count: acc.active.count + 1 } };
  }, { groups: [] });

  return groupsReduced.groups.concat(groupsReduced.active);
}


export const generateGroupPlays = (data: PlayApiCommon[]): GroupData[] => {

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

export const generateFlatItems = (data: PlayApiCommon[]) => {
    // ensure there are no duplicates
    // this may happen if a play is "bumped" from one "page" to another, based on offset,
    // when new plays are inserted out of order (playedAt)
    const allIds: string[] = [];
    const dupes: string[] = [];
    for(const d of data) {
      if(allIds.includes(d.uid)) {
        console.warn(`Duplicate ID detected ${d.uid}`);
        dupes.push(d.uid);
      } else {
        allIds.push(d.uid);
      }
    }
    for(const uid of dupes) {
      const indexes = getAllIndexes(data, (d) => d.uid === uid);
      // keep only the first one since its likely the freshest
      const oldIndexes = indexes.slice(1);
      for(const old of oldIndexes) {
        data.splice(old, 1);
      }
    }

    const groups = generateGroupPlays(data);
    groups.sort((a, b) => sortByNewestDate(a.date, b.date));
    return groups.map((x) => {
      x.plays.sort((a, b) => sortByNewestDate(a.playedAt, b.playedAt));
      return [{count: x.plays.length, date: x.date, uid: `${x.date.toISOString()}-${x.plays.length}`}, ...x.plays];
    }).flat(1);
}