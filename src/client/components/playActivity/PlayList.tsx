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
import { ActivityDetailFetchable, ActivityDetails } from '../ActivityDetail.js';
import { sortByNewestPlayDate, sortByNewestSeenDate } from '../../../core/PlayUtils.js';
import "./PlayList.scss";
import { PlayApiCommon, PlayApiCommonDetailed } from '../../../core/Api.js';
import { QueryPlaysOpts } from '../../../backend/common/database/drizzle/repositories/PlayRepository.js';
import ky from 'ky';
import { baseUrl } from '../../utils/index.js';
import { PaginatedResponse } from '../../../backend/common/database/drizzle/repositories/BaseRepository.js';
import { QueryFunctionContext, useQuery } from '@tanstack/react-query';
import { ErrorAlert } from '../ErrorAlert.js';
import { useParams } from 'react-router-dom';

dayjs.extend(doy);

export interface ActivityLogProps {
  data: PlayApiCommon[]
  componentId: number
  componentType: ComponentType
  sortBy?: 'played' | 'seen'
  render?: 'virtCollapse' | 'virtAccordian' | 'accordian'
}

interface GroupInfo {
  count: number
  date: Dayjs
}

interface GroupData {
  plays: PlayApiCommon[]
  date: Dayjs
}

const generateGroupInfo = (data: PlayApiCommon[]): GroupInfo[] => {

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

const generateGroupPlays = (data: PlayApiCommon[]): GroupData[] => {

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

  return groupsReduced.groups.concat(groupsReduced.active);
}

export const PlayList = (props: ActivityLogProps) => {

  const {
    data = [],
    sortBy = 'played',
    render = 'accordian'
  } = props;

  const sorted = useMemo(() => props.data.toSorted((a, b) => {
    if(sortBy === 'played') {
      return sortByNewestPlayDate(a.play, b.play)
    }
    return sortByNewestSeenDate(a.play, b.play);
  }), [data, sortBy]);

  if (render === 'accordian') {
    return <PlainAccordian data={sorted} sortBy={sortBy} {...props} />
  }
  if (render === 'virtCollapse') {
    return <VirtualizedCollapse data={sorted} {...props}/>
  }
  if (render === 'virtAccordian') {
    return <VirtualizedAccordian data={sorted} {...props}/>;
  }
}

const VirtualizedCollapse = (props: { data: PlayApiCommon[], componentId: number, componentType: ComponentType }) => {
  const {
    data,
  } = props;
  const groups = useMemo(() => generateGroupInfo(data), [data]);
  return (
    <GroupedVirtuoso
      style={{ height: '700px' }}
      fixedItemHeight={80}
      fixedGroupHeight={50}
      // components={{
      //   List: (args) => {
      //   return <div data-testid={args["data-testid"]} style={args.style}>{args.children}</div>}
      // }}
      groupCounts={groups.map(x => x.count)}
      groupContent={(index) => {
        const gData = groups[index];
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
          <Box paddingY="2">
            <Flex direction="row" justify="space-between">

              <Text fontWeight="semibold">{headerText}</Text>

              <IconButton variant="ghost" size="xs" maxWidth="fit-content">
                <VscDebugRestart />
              </IconButton>
            </Flex>
            <Separator orientation="horizontal" height="4" />
          </Box>
        )
      }}
      itemContent={(index, groupIndex) => {
        const activity = data[index];
        const { play } = activity;
        return (
          <Collapsible.Root key={index}

            lazyMount
            _open={{
              background: "var(--chakra-colors-bg-subtle)"
            }}
            style={{
              borderColor: "var(--chakra-colors-border)",
              borderWidth: '1px',
            }}
          >
            <Flex justify="space-between">
              <Collapsible.Trigger
                userSelect="text"

                paddingY="3"
                display="flex"
                gap="2"
                alignItems="center"
                truncate cursor="pointer"
                style={{
                  paddingBlock: "var(--chakra-spacing-2)",
                  paddingInline: "var(--chakra-spacing-4)"
                }}
              >
                <Collapsible.Indicator
                  transition="transform 0.2s"
                  _open={{ transform: "rotate(90deg)" }}
                >
                  <LuChevronRight />
                </Collapsible.Indicator>
                <Stack gap="1" truncate alignItems="flex-start">
                  <Span>{play.data.track}</Span>
                  <TextMuted truncate>{play.data.artists.map(x => x.name).join(' / ')}</TextMuted>
                  <HStack gap="1">
                    <ShortDateDisplay date={play.data.playDate} prefix="Played" /><Separator orientation="vertical" height="4" />
                    <TextMuted>{play.meta?.source}</TextMuted>
                  </HStack>
                </Stack>
              </Collapsible.Trigger>
              <Stack style={{
                paddingBlock: "var(--chakra-spacing-2)",
                paddingInline: "var(--chakra-spacing-4)"
              }} justify="flex-start" alignItems="flex-end">
                <StatusBadge maxWidth="fit-content" data={activity} />
                {activity.state === 'failed' ? <IconButton variant="ghost" size="xs" maxWidth="fit-content">
                  <VscDebugRestart />
                </IconButton> : null}
              </Stack>

            </Flex>
            <Collapsible.Content borderTopColor="gray.border"
              style={{
                paddingBlock: "var(--chakra-spacing-4)",
                paddingInline: "var(--chakra-spacing-4)"
              }}>
              <ActivityDetailFetchable componentType={props.componentType} componentId={props.componentId} uid={activity.uid} />
            </Collapsible.Content>
          </Collapsible.Root>
        )
      }}
    />
  );
}

const CustomList: Components['List'] = React.forwardRef((args, ref) => {
          // @ts-ignore
          if (args.children.length === 1 && args.children[0].type.name === 'Group') {
            // @ts-ignore
            return <div ref={ref} data-testid={args["data-testid"]} style={args.style}>{args.children}</div>
          }
          // @ts-ignore
          return <Accordion.Root ref={ref} data-testid={args["data-testid"]} style={args.style} lazyMount variant="enclosed" collapsible multiple>{args.children}</Accordion.Root>
});

const CustomGroup: Components['Group'] = React.forwardRef((args) => {
  return <div data-testid={args["data-testid"]} style={args.style}>{args.children}</div>;
});

const ItemComponent = React.memo((props: {index: number, activity, componentId: number}) => {
  const {index, activity} = props;
  const { play } = activity;
  console.log(`render ${play.data.track}`);
  return (
        <Accordion.Item value={index.toString()}>
          <Flex justify="space-between">
            <Accordion.ItemTrigger truncate cursor="pointer">
              <Accordion.ItemIndicator />
              <Stack gap="1" truncate>
                <Span>{play.data.track}</Span>
                <TextMuted truncate>{play.data.artists.map(x => x.name).join(' / ')}</TextMuted>
                <HStack gap="1">
                  <ShortDateDisplay date={play.data.playDate} prefix="Played" /><Separator orientation="vertical" height="4" />
                  <TextMuted>{play.meta?.source}</TextMuted>
                </HStack>
              </Stack>
            </Accordion.ItemTrigger>
            <Stack style={{
              paddingBlock: "var(--accordion-padding-y)",
              paddingInline: "var(--accordion-padding-x)"
            }} justify="flex-start" alignItems="flex-end">
              <StatusBadge maxWidth="fit-content" data={activity} />
              {activity.state === 'failed' ? <IconButton variant="ghost" size="xs" maxWidth="fit-content">
                <VscDebugRestart />
              </IconButton> : null}
            </Stack>

          </Flex>
          <Accordion.ItemContent>
            <Accordion.ItemBody borderTopColor="gray.border" >
              <ActivityDetailFetchable componentType='source' componentId={props.componentId} uid={activity.uid} />
            </Accordion.ItemBody>
          </Accordion.ItemContent>
        </Accordion.Item>
      )
});

const VirtualizedAccordian = (props: { data: PlayApiCommon[], componentId: number, componentType: ComponentType }) => {
  const {
    data,
  } = props;

  const groups = useMemo(() => generateGroupInfo(data), [data]);

  const GroupComponent = (props: {index: number}) => {
    const gData = groups[props.index];
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
          <Box paddingY="2" bgColor="var(--chakra-colors-bg)">
            <Flex direction="row" justify="space-between">

              <Text fontWeight="semibold">{headerText}</Text>

              <IconButton variant="ghost" size="xs" maxWidth="fit-content">
                <VscDebugRestart />
              </IconButton>
            </Flex>
            <Separator orientation="horizontal"/>
          </Box>
        );
  }

  return (
    <GroupedVirtuoso
      style={{ height: '700px' }}
      logLevel={LogLevel.DEBUG}
      fixedItemHeight={80}
      fixedGroupHeight={50}
      components={{
        List: CustomList,
        Group: CustomGroup
      }}
      groupCounts={groups.map(x => x.count)}
      groupContent={(index) => <GroupComponent index={index}/>}
      itemContent={(index) => <ItemComponent index={index} activity={data[index]} componentId={props.componentId}/>}
    />
  );
}

const PlainAccordian = (props: { data: PlayApiCommon[], componentId: number, componentType: ComponentType, sortBy: 'played' | 'seen' }) => {
  const { 
    data = [],
    sortBy
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
                    <Flex justify="space-between">
                      <Accordion.ItemTrigger truncate cursor="pointer">
                        <Accordion.ItemIndicator />
                        <Stack gap="1" truncate>
                          <Span>{play.data.track}</Span>
                          <TextMuted truncate>{play.data.artists.map(x => x.name).join(' / ')}</TextMuted>
                          <HStack gap="1">
                            <ShortDateDisplay date={sortBy === 'played' ? play.data.playDate : play.meta?.seenAt} prefix={sortBy === 'played' ? 'Played' : 'Seen'} /><Separator orientation="vertical" height="4" />
                            <TextMuted>{play.meta?.source}</TextMuted>
                          </HStack>
                        </Stack>
                      </Accordion.ItemTrigger>
                      <Stack style={{
                        paddingBlock: "var(--accordion-padding-y)",
                        paddingInline: "var(--accordion-padding-x)"
                      }} justify="flex-start" alignItems="flex-end">
                        <StatusBadge maxWidth="fit-content" data={activity} />
                        {activity.state === 'failed' ? <IconButton variant="ghost" size="xs" maxWidth="fit-content">
                          <VscDebugRestart />
                        </IconButton> : null}
                      </Stack>

                    </Flex>
                    <Accordion.ItemContent>
                      <Accordion.ItemBody borderTopColor="gray.border" >
                        <ActivityDetailFetchable componentId={props.componentId} componentType={props.componentType} uid={activity.uid} />
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

const StatusBadge = (props: ComponentProps<typeof Badge> & { data: PlayApiCommon }) => {

  const { data, ...rest } = props;

  let badgeColor = undefined,
    badgeText = capitalize(data.state);

  switch (data.state) {
    case 'queued':
      badgeColor = 'gray';
      break;
    case 'scrobbled':
    case 'discovered':
      badgeColor = 'green';
      break;
    case 'failed':
      badgeColor = 'red';
      break;
    case 'discarded':
      badgeColor = 'grey';
      break;
    case 'duped':
      badgeColor = 'orange';
      break;
  }

  return <Badge variant="surface" colorPalette={badgeColor} {...rest}>{badgeText}</Badge>
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
    queryKey: ['components', props.componentId, 'plays', {order: 'desc', sort: 'seenAt'}],
    queryFn: queryFn
  });

  let rendered;
  if (isPending && data === undefined) {
    rendered = <PlayListSkeleton/>;
  } else if (isError) {
    rendered = <ErrorAlert error={error} />
  } else {
    rendered = <PlayList data={data.data} {...props} />;
  }

  return rendered; // <Container maxWidth="3xl">{rendered}</Container>
}

type PlayListQueryKey = ['components', number, 'plays', QueryPlaysOpts];
const queryFn = async (context: QueryFunctionContext<PlayListQueryKey>) => {
    return await ky.get(`components/${context.queryKey[1]}/plays`, {
       baseUrl: baseUrl,
       // @ts-expect-error
       searchParams: context.queryKey[3] 
      }).json<PaginatedResponse<PlayApiCommonDetailed>>();
}