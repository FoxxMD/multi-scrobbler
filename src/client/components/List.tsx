import { Accordion, For, Span, Stack, Text, Box, AbsoluteCenter, Button, Separator, HStack } from '@chakra-ui/react';
import { JsonPlayObject } from '../../core/Atomic';
import { ShortDateDisplay } from './DateDisplay';
import { truncateStringToLength } from '../../core/StringUtils';
import { TextMuted } from './TextMuted';

const shortArtist = truncateStringToLength(20);

const items = [
  { value: 'a', title: 'First Item', text: 'Some value 1..' },
  { value: 'b', title: 'Second Item', text: 'Some value 2...' },
  { value: 'c', title: 'Third Item', text: 'Some value 3...' },
];

export interface ActivityLogProps {
  plays: JsonPlayObject[]
}

// shortArtist(item.data.artists.join(' / '))

export const CList = (props: ActivityLogProps) => {
  return (
    <Stack gap="2">
      <Text fontWeight="semibold">Today</Text>
      <Accordion.Root variant="enclosed" collapsible>
        {props.plays.map((item, index) => (
          <Accordion.Item key={index} value={index.toString()}>
            <Box position="relative">
              <Accordion.ItemTrigger>
                <Accordion.ItemIndicator />
                <Stack gap="1">
                  <Span flex="1">{item.data.track}</Span>
                  <TextMuted overflow="hidden" textOverflow="ellipsis">{item.data.artists.join(' / ')}</TextMuted>
                  <HStack gap="1"><ShortDateDisplay date={item.data.playDate} prefix="Played"/><Separator orientation="vertical" height="4" /><TextMuted>{item.meta?.source}</TextMuted></HStack>
                </Stack>
              </Accordion.ItemTrigger>
              <AbsoluteCenter axis="vertical" insetEnd="0" padding="1em">
                <Button variant="subtle" size="xs">
                  Retry
                </Button>
              </AbsoluteCenter>
            </Box>
            <Accordion.ItemContent>
              <Accordion.ItemBody borderTopColor="gray.border" borderTopWidth="1px">{item.data.track}</Accordion.ItemBody>
            </Accordion.ItemContent>
          </Accordion.Item>
        ))}
      </Accordion.Root>
    </Stack>
  );
}