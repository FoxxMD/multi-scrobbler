import preview from "../../.storybook/preview.js";
import React from 'react';
import { http, HttpResponse, delay, sse } from 'msw';

import { Container, Box } from '@chakra-ui/react';
import { CountLiveIndicator } from "../client/components/msComponent/Stats.js";
import { sseProviderOptions } from "../client/AppNext.js";
import {Provider} from "../client/components/Provider";
import { SSEProvider } from "@flamefrontend/sse-runtime-react";
import { generateClientApiJson, generateSourceApiJson, generateSourcePlayerJson, LOG_MESSAGE_FIXTURE, logsApiResponse } from "../core/tests/utils/apiFixtures.js";
import { MsSseEvent } from "../core/Api.js";

// More on how to set up stories at: https://storybook.js.org/docs/writing-stories#default-export
const meta = preview.meta({
  title: 'Examples/Component Details/Stats Count',
  component: CountLiveIndicator,
  parameters: {
    // Optional parameter to center the component in the Canvas. More info: https://storybook.js.org/docs/configure/story-layout
    layout: 'padded',
      msw: {
        handlers: [
          sse('/api/events?next=true', async ({ params, client }) => {
          }),
        ],
      },
  },
  // This component will have an automatically generated Autodocs entry: https://storybook.js.org/docs/writing-docs/autodocs
  tags: ['autodocs'],
  // More on argTypes: https://storybook.js.org/docs/api/argtypes
  // args: {
  //    streamable: false,
  // },
  render: function Render(args) {
     return (<CountLiveIndicator {...args} />) 
    },
decorators: [
    (Story) => (<Provider><Container maxW="xl"><SSEProvider<MsSseEvent> options={sseProviderOptions}><Story/></SSEProvider></Container></Provider>),
  ]
  // Use `fn` to spy on the onClick arg, which will appear in the actions panel once invoked: https://storybook.js.org/docs/essentials/actions#story-args
});

export const StatsCount = meta.story({
  args: {
    data: {
      countLive: 5,
      tracksDiscovered: 2,
      mode: 'source',
      id: 1
    }
  }
});

export const StatsCountLive = meta.story({
  args: {
    data: {
      countLive: 5,
      tracksDiscovered: 2,
      mode: 'source',
      id: 1
    },
    streamable: true
  },
  parameters: {
      msw: {
        handlers: [
          // <{event: 'scrobble', data: {componentId: number}}>
          sse('/api/events?next=true', async ({ params, client }) => {
            setInterval(() => client.send({event: 'scrobble', data: {componentId: 1}}), 2000);
          }),
        ],
      },
  }
});

export const StatsCountLiveReset = meta.story({
  args: {
    data: {
      countLive: 5,
      tracksDiscovered: 2,
      mode: 'source',
      id: 1,
    },
    streamable: true,
    recentTimeout: 2000
  },
  parameters: {
      msw: {
        handlers: [
          // <{event: 'scrobble', data: {componentId: number}}>
          sse('/api/events?next=true', async ({ params, client }) => {
            setInterval(() => client.send({event: 'scrobble', data: {componentId: 1}}), 3000);
          }),
        ],
      },
  }
});