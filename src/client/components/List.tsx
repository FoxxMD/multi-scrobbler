import { Accordion, For, Span, Stack, Text, Box, AbsoluteCenter, Button } from '@chakra-ui/react';

const items = [
  { value: 'a', title: 'First Item', text: 'Some value 1..' },
  { value: 'b', title: 'Second Item', text: 'Some value 2...' },
  { value: 'c', title: 'Third Item', text: 'Some value 3...' },
];


export const CList = (props) => 
    (
        <Stack gap="8">
      <For each={['outline', 'subtle', 'enclosed', 'plain']}>
        {(variant) => (
          <Stack gap="2" key={variant}>
            <Text fontWeight="semibold">{variant}</Text>
            <Accordion.Root variant={variant} collapsible defaultValue={['b']}>
              {items.map((item, index) => (
                <Accordion.Item key={index} value={item.value}>
                  <Box position="relative">
                  <Accordion.ItemTrigger>
                  <Accordion.ItemIndicator />
                    <Span flex="1">{item.title}</Span>
                  </Accordion.ItemTrigger>
                  <AbsoluteCenter axis="vertical" insetEnd="0">
              <Button variant="subtle" colorPalette="blue">
                Action
              </Button>
            </AbsoluteCenter>
                  </Box>
                  <Accordion.ItemContent>
                    <Accordion.ItemBody>{item.text}</Accordion.ItemBody>
                  </Accordion.ItemContent>
                </Accordion.Item>
              ))}
            </Accordion.Root>
          </Stack>
        )}
      </For>
    </Stack>
    
    );