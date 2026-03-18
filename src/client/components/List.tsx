import { Accordion, For, Span, Stack, Text, Box, AbsoluteCenter, Button, Separator, HStack, Flex, Badge, IconButton } from '@chakra-ui/react';
import { JsonPlayObject } from '../../core/Atomic';
import { ShortDateDisplay } from './DateDisplay';
import { TextMuted } from './TextMuted';
import { capitalize } from '../../core/StringUtils';
import { ComponentProps } from "react"
import { VscDebugRestart } from "react-icons/vsc";
import { PlayInfo } from './PlayInfo';
export interface PlayActivity {
  play: JsonPlayObject
  status: string
}
export interface ActivityLogProps {
  data: PlayActivity[]
}

export const CList = (props: ActivityLogProps) => {
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
                  <Box >
                  <Accordion.Root variant="enclosed" collapsible multiple>
                    <Accordion.Item value="info">
                      <Accordion.ItemTrigger>
                        <Accordion.ItemIndicator />
                        Play Info
                      </Accordion.ItemTrigger>
                      <Accordion.ItemContent>
                        <Accordion.ItemBody>
                          <PlayInfo play={play} final={play}/>
                        </Accordion.ItemBody>
                      </Accordion.ItemContent>
                    </Accordion.Item>
                    <Accordion.Item value="timeline">
                      <Accordion.ItemTrigger>
                        <Accordion.ItemIndicator />
                        Timeline
                      </Accordion.ItemTrigger>
                      <Accordion.ItemContent>
                        <Accordion.ItemBody>
                          test
                          </Accordion.ItemBody>
                      </Accordion.ItemContent>
                    </Accordion.Item>
                  </Accordion.Root>
                </Box>
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