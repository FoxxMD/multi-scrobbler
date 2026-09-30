import { Box, Flex, Separator, Text } from '@chakra-ui/react';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import type {ComponentProps} from "react";
import type {PlayApiCommonDetailed, QueryPlaysOptsJson, SortPlaysByProps} from '../../../core/Api.js';
import type {ComponentType} from '../../../core/Atomic.js';
import { sortByNewestDate } from '../../../core/PlayUtils.js';

export interface GroupInfo {
  count: number
  date: Dayjs
  uid: string
}

export interface GroupData {
  plays: PlayApiCommonDetailed[]
  date: Dayjs
}

export interface ActivityLogProps extends SortPlaysByProps {
  data: PlayApiCommonDetailed[]
  componentId: number
  componentType: ComponentType
//  render?: 'virtNormal' | 'virtDynamic' | 'virtExp' | 'accordian'
  query: QueryPlaysOptsJson
  live?: boolean
  total?: number
}

export interface GroupHeaderProps {
  data: GroupInfo 
}

export const GroupHeader = (props: GroupHeaderProps & ComponentProps<typeof Box>) => {
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

        {/* <IconButton variant="ghost" size="xs" maxWidth="fit-content">
          <VscDebugRestart />
        </IconButton> */}
      </Flex>
      <Separator orientation="horizontal" height="4" />
    </Box>
  )
}

export const isGroupInfo = (val: any): val is GroupInfo => val.date !== undefined;

export const isGroupHeader = (val: any): val is ComponentProps<typeof GroupHeader> => `data` in val && val.data.date !== undefined;

export const generateGroupPlays = (data: PlayApiCommonDetailed[]): GroupData[] => {

  if(data.length === 0) {
    return [];
  }
  const groupsReduced = data.reduce((acc: { groups: GroupData[], active?: GroupData }, curr, index) => {
    const date = dayjs(curr.play.data.playDate);
    if (acc.active === undefined) {
      return { ...acc, active: { plays: [curr], date } };
    }
    if (!acc.active.date.isSame(date, 'day')) {
      return { groups: [...acc.groups, acc.active], active: { plays: [curr], date } }
    }

    return { groups: acc.groups, active: { ...acc.active, plays: acc.active.plays.concat(curr) } };
  }, { groups: [] });

  if(groupsReduced.active !== null && groupsReduced.active !== undefined) {
    return groupsReduced.groups.concat(groupsReduced.active);
  }

  return groupsReduced.groups;
}

export const generateFlatItems = (data: PlayApiCommonDetailed[]): (PlayApiCommonDetailed | GroupInfo)[] => {
    // ensure there are no duplicates
    // this may happen if a play is "bumped" from one "page" to another, based on offset,
    // when new plays are inserted out of order (playedAt)
    // keep only the first one since its likely the freshest
    // (filter into a new array so the caller's (query cache) data is not mutated)
    const seenIds = new Set<string>();
    const deduped = data.filter((d) => {
      if(seenIds.has(d.uid)) {
        console.warn(`Duplicate ID detected ${d.uid}`);
        return false;
      }
      seenIds.add(d.uid);
      return true;
    });

    const groups = generateGroupPlays(deduped);
    groups.sort((a, b) => sortByNewestDate(a.date, b.date));
    return groups.map((x) => {
      x.plays.sort((a, b) => sortByNewestDate(a.playedAt, b.playedAt));
      return [{count: x.plays.length, date: x.date, uid: `${x.date.toISOString()}-${x.plays.length}`}, ...x.plays];
    }).flat(1);
}