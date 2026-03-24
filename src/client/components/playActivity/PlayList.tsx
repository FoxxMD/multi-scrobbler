import { Accordion, For, Span, Stack, Text, Box, AbsoluteCenter, Button, Separator, HStack, Flex, Badge, IconButton, Container, Collapsible } from '@chakra-ui/react';
import { JsonPlayObject, PlayActivity } from '../../../core/Atomic.js';
import { ShortDateDisplay } from '../DateDisplay.js';
import { TextMuted } from '../TextMuted.js';
import { LuChevronRight } from "react-icons/lu"
import { capitalize } from '../../../core/StringUtils.js';
import { ComponentProps, useMemo } from "react"
import dayjs, { Dayjs } from 'dayjs';
import doy from 'dayjs/plugin/dayOfYear.js';
import { VscDebugRestart } from "react-icons/vsc";
import { PlayData, PlayInfoContainer } from '../PlayData.js';
import { GroupedVirtuoso } from 'react-virtuoso'
import { ActivityDetails } from '../ActivityDetail.js';
import { sortByNewestPlayDate } from '../../../core/PlayUtils.js';
import "./PlayList.scss";

dayjs.extend(doy);

export interface ActivityLogProps {
  data: PlayActivity[]
  sortBy?: 'played' | 'seen'
  virtual?: boolean
}

interface GroupInfo {
  count: number
  date: Dayjs
}

export const PlayList = (props: ActivityLogProps) => {

  const {
    data = [],
    sortBy = 'played',
    virtual = false,
  } = props;

  if(virtual) {

  

  const sorted = useMemo(() => props.data.toSorted((a, b) => sortByNewestPlayDate(a.play, b.play)), [data, sortBy]);
  const groupsReduced = useMemo(() => {
    return sorted.reduce((acc: { groups: GroupInfo[], active?: GroupInfo }, curr, index) => {
      const date = dayjs(curr.play.data.playDate);
      if (acc.active === undefined) {
        return { ...acc, active: { count: 1, date } };
      }
      if (acc.active.date.dayOfYear() !== date.dayOfYear()) {
        return { groups: [...acc.groups, acc.active], active: { count: 1, date } }
      }

      return { groups: acc.groups, active: { ...acc.active, count: acc.active.count + 1 } };
    }, { groups: [] });
  }, [sorted, sortBy]);

  const allGroups = groupsReduced.groups.concat(groupsReduced.active);

  return (
      <GroupedVirtuoso
        style={{ height: '700px' }}
        fixedItemHeight={80}
        fixedGroupHeight={50}
        groupCounts={allGroups.map(x => x.count)}
        groupContent={(index) => {
          const gData = allGroups[index];
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
          const activity = sorted[index];
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
                    <TextMuted truncate>{play.data.artists.join(' / ')}</TextMuted>
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
                  {activity.status === 'error' ? <IconButton variant="ghost" size="xs" maxWidth="fit-content">
                    <VscDebugRestart />
                  </IconButton> : null}
                </Stack>

              </Flex>
              <Collapsible.Content borderTopColor="gray.border"
                               style={{
                                paddingBlock: "var(--chakra-spacing-4)",
                  paddingInline: "var(--chakra-spacing-4)"
                }}>
                <ActivityDetails activity={activity} />
              </Collapsible.Content>
            </Collapsible.Root>
          )
        }}
      />
  );

}

  return (
    <Stack gap="2">
      <Box>
        <Flex direction="row" justify="space-between">

          <Text fontWeight="semibold">Today</Text>

          <IconButton variant="ghost" size="xs" maxWidth="fit-content">
            <VscDebugRestart />
          </IconButton>
        </Flex>
        <Separator orientation="horizontal" height="4" />
      </Box>
      <Accordion.Root variant="enclosed" collapsible multiple>
        {props.data.map((activity, index) => {
          const { play } = activity;
          return (
            <Accordion.Item key={index} value={index.toString()}>
              <Flex justify="space-between">
                <Accordion.ItemTrigger truncate cursor="pointer">
                  <Accordion.ItemIndicator />
                  <Stack gap="1" truncate>
                    <Span>{play.data.track}</Span>
                    <TextMuted truncate>{play.data.artists.join(' / ')}</TextMuted>
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
                  {activity.status === 'error' ? <IconButton variant="ghost" size="xs" maxWidth="fit-content">
                    <VscDebugRestart />
                  </IconButton> : null}
                </Stack>

              </Flex>
              <Accordion.ItemContent>
                <Accordion.ItemBody borderTopColor="gray.border" >
                  <ActivityDetails activity={activity}/>
                </Accordion.ItemBody>
              </Accordion.ItemContent>
            </Accordion.Item>
          )
        })}
      </Accordion.Root>
    </Stack>
  );
}

const StatusBadge = (props: ComponentProps<typeof Badge> & { data: PlayActivity }) => {

  const { data, ...rest } = props;

  let badgeColor = undefined,
    badgeText = capitalize(data.status);

  switch (data.status) {
    case 'queued':
      badgeColor = 'gray';
      break;
    case 'scrobbled':
      badgeColor = 'green';
      break;
    case 'error':
      badgeColor = 'red';
      break;
  }

  return <Badge variant="surface" colorPalette={badgeColor} {...rest}>{badgeText}</Badge>
}

export const ListContainer = (props?: ComponentProps<typeof PlayList>) => {
  return <Container maxWidth="3xl"><PlayList {...props} /></Container>
}