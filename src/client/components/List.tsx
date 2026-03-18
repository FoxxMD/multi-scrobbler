import { Accordion, For, Span, Stack, Text, Box, AbsoluteCenter, Button } from '@chakra-ui/react';

const items = [
  { value: 'a', title: 'First Item', text: 'Some value 1..' },
  { value: 'b', title: 'Second Item', text: 'Some value 2...' },
  { value: 'c', title: 'Third Item', text: 'Some value 3...' },
];


export const CList = (props) =>
(
  <Stack gap="8">
    <Stack gap="2">
      <Text fontWeight="semibold">Today</Text>
      <Accordion.Root variant="enclosed" collapsible defaultValue={['b']}>
        {items.map((item, index) => (
          <Accordion.Item key={index} value={item.value}>
            <Box position="relative">
              <Accordion.ItemTrigger>
                <Accordion.ItemIndicator />
                <Stack gap="1">
                  <Span flex="1">{item.title}</Span>
                  <Text fontSize="sm" color="fg.muted">
                    Click to expand
                  </Text>
                </Stack>
              </Accordion.ItemTrigger>
              <AbsoluteCenter axis="vertical" insetEnd="0" padding="1em">
                <Button variant="subtle" size="xs">
                  Retry
                </Button>
              </AbsoluteCenter>
            </Box>
            <Accordion.ItemContent>
              <Accordion.ItemBody borderTopColor="gray.border" borderTopWidth="1px">{item.text}</Accordion.ItemBody>
            </Accordion.ItemContent>
          </Accordion.Item>
        ))}
      </Accordion.Root>
    </Stack>
  </Stack>

);