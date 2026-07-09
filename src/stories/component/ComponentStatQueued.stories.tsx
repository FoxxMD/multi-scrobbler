import preview from "../../../.storybook/preview.js";
import React from 'react';
import { sse } from 'msw';

import { Container } from '@chakra-ui/react';
import { QueuedIndicator } from "../../client/components/msComponent/Stats.js";
import { sseProviderOptions } from "../../client/AppNext.js";
import {Provider} from "../../client/components/Provider.js";
import { SSEProvider } from "@flamefrontend/sse-runtime-react";
import { type MsSseEvent } from "../../core/Api.js";
import { faker } from "@faker-js/faker";

// More on how to set up stories at: https://storybook.js.org/docs/writing-stories#default-export
const meta = preview.meta({
  title: 'Component/Details/Stat Queued',
  component: QueuedIndicator,
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
     return (<QueuedIndicator {...args} />) 
    },
decorators: [
    (Story) => (<Provider><Container maxW="xl"><SSEProvider<MsSseEvent> options={sseProviderOptions}><Story/></SSEProvider></Container></Provider>),
  ]
  // Use `fn` to spy on the onClick arg, which will appear in the actions panel once invoked: https://storybook.js.org/docs/essentials/actions#story-args
});

const randomQueue = () => faker.helpers.arrayElement(['scrobbleQueued', 'scrobbleDequeued']);

export const StatsQueued = meta.story({
  args: {
    data: {
      queued: 3,
      mode: 'client',
      id: 1,
    },
    streamable: true
  },
  parameters: {
      msw: {
        handlers: [
          sse('/api/events?next=true', async ({ params, client }) => {
          setInterval(() => client.send({event: randomQueue(), data: {componentId: 1}}), 2000);
          }),
        ],
      },
  }
});