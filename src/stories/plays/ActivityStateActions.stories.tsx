import preview from "../../../.storybook/preview.js";
import React from 'react';
import { http, HttpResponse, delay } from 'msw';

import { Container, HStack, Stack, Text } from '@chakra-ui/react';
import { Provider } from "../../client/components/Provider.js";
import { generatePlayApiCommonDetailed } from "../../core/tests/utils/apiFixtures.js";
import { ActivityStateActions } from "../../client/components/ActivityDetail.js";
import { PLAY_STATES, type PlayState } from "../../core/Atomic.js";

const activityInState = (state: PlayState, deadQueue = false) => generatePlayApiCommonDetailed({
  playOpts: [{ state }],
  queueOpts: [{ queueStatus: deadQueue ? 'failed' : 'completed', retries: deadQueue ? 2 : 0 }]
});

// play actions succeed after a short delay so pending (disabled) states are visible
const playActionHandlers = [
  http.post('*/api/components/:componentId/plays/:uid/queue', async () => { await delay(1000); return HttpResponse.json({}); }),
  http.delete('*/api/components/:componentId/plays/:uid/queue', async () => { await delay(1000); return HttpResponse.json({}); }),
  http.post('*/api/components/:componentId/plays/:uid/state', async () => { await delay(1000); return HttpResponse.json({}); }),
  http.delete('*/api/components/:componentId/plays/:uid', async () => { await delay(1000); return HttpResponse.json({}); }),
];

const meta = preview.meta({
  title: 'Plays/State Actions',
  component: ActivityStateActions,
  parameters: {
    layout: 'padded',
    msw: {
      handlers: playActionHandlers
    }
  },
  tags: ['autodocs'],
  args: {
    activity: activityInState('queued'),
    componentType: 'source' as const
  },
  argTypes: {
    componentType: {
      control: { type: 'select' },
      options: ['source', 'client'],
    }
  },
  decorators: [
    (Story) => (<Provider><Container maxWidth="2xl"><Story/></Container></Provider>),
  ]
});

export const AllStates = meta.story({
  render: function Render(args) {
    return (
      <Stack gap="4">
        {PLAY_STATES.map(state => (
          <HStack key={state} justifyContent="space-between">
            <Text>{state}</Text>
            <ActivityStateActions componentType={args.componentType} activity={activityInState(state as PlayState)}/>
          </HStack>
        ))}
        <HStack justifyContent="space-between">
          <Text>failed (with dead queue)</Text>
          <ActivityStateActions componentType={args.componentType} activity={activityInState('failed', true)}/>
        </HStack>
      </Stack>
    );
  }
});

export const Queued = meta.story({ args: { activity: activityInState('queued') } });
export const Failed = meta.story({ args: { activity: activityInState('failed') } });
export const FailedDeadQueue = meta.story({ args: { activity: activityInState('failed', true) } });
export const Review = meta.story({ args: { activity: activityInState('review') } });
export const Discovered = meta.story({ args: { activity: activityInState('discovered') } });
export const Scrobbled = meta.story({ args: { activity: activityInState('scrobbled'), componentType: 'client' as const } });
export const Discarded = meta.story({ args: { activity: activityInState('discarded') } });
export const Duped = meta.story({ args: { activity: activityInState('duped') } });
