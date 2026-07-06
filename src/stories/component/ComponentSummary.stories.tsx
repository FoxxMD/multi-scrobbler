import preview from "../../../.storybook/preview.js";
import React from 'react';
import { http, HttpResponse, delay, sse } from 'msw';

import { Container } from '@chakra-ui/react';
import { MSComponentSummary } from "../../client/components/msComponent/MSComponentSummary.js";
import {Provider} from "../../client/components/Provider.js";
import { generateClientApiJson, generateSourceApiJson, generateSourcePlayerJson } from "../../core/tests/utils/apiFixtures.js";
import { MsSseEvent } from "../../core/Api.js";
import { SSEProvider } from "@flamefrontend/sse-runtime-react";
import { sseProviderOptions } from "../../client/AppNext.js";
import { faker } from "@faker-js/faker";
import { withRouter, reactRouterParameters } from 'storybook-addon-remix-react-router';
import dayjs from "dayjs";

// More on how to set up stories at: https://storybook.js.org/docs/writing-stories#default-export
const meta = preview.meta({
  title: 'Component/Summary',
  component: MSComponentSummary,
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
  //    data: generatePlayApiCommonDetailed(),
  // },
  // argTypes: {
  //   componentType: {
  //     control: { type: 'select' },
  //     options: ['source', 'client'],
  //   }
  // },
  render: function Render(args) {
     return (<MSComponentSummary {...args} />) 
    },
decorators: [
    (Story) => (<Provider><Container maxWidth="4xl"><SSEProvider<MsSseEvent> options={sseProviderOptions}><Story/></SSEProvider></Container></Provider>),
    withRouter
  ]
  // Use `fn` to spy on the onClick arg, which will appear in the actions panel once invoked: https://storybook.js.org/docs/essentials/actions#story-args
});

// More on writing stories with args: https://storybook.js.org/docs/writing-stories/args
export const SourceSummary = meta.story({
    args: {
      data: generateSourceApiJson()
    }
});

export const SourceSummaryFetchable = meta.story({
    args: {
      data: generateSourceApiJson({id: 1}),
      fetchable: true,
      componentId: 1,
    },
    parameters: {
        msw: {
          handlers: [
            sse('/api/events?next=true', async ({ params, client }) => {
            setInterval(() => client.send({
              // @ts-expect-error
              event: 'discovered', 
              data: {componentId: 1}}), 2000);
            }),
          ],
        },
    }
});

export const SourceSleeping = meta.story({
    args: {
      data: generateSourceApiJson({sleeping: true, wakeAt: dayjs().add(45, 's').toISOString()})
    }
});

export const SourceWithPlayerSummary = meta.story({
    args: {
      data: generateSourceApiJson({players: {test: generateSourcePlayerJson(undefined, {art: true})}})
    }
});

export const ClientSummary = meta.story({
    args: {
      data: generateClientApiJson()
    }
});

export const ClientSummaryWithNowPlaying = meta.story({
    args: {
      data: generateClientApiJson({players: {test: generateSourcePlayerJson(undefined, {art: true})}})
    }
});

const randomQueue = () => faker.helpers.arrayElement(['scrobbleQueued', 'scrobbleDequeued']);

export const ClientSummaryFetchable = meta.story({
    args: {
      data: generateClientApiJson({id: 1}),
      fetchable: true,
      componentId: 1,
    },
    parameters: {
        msw: {
          handlers: [
            sse('/api/events?next=true', async ({ params, client }) => {
            setInterval(() => client.send({
              //@ts-expect-error
              event: randomQueue(), 
              data: {componentId: 1}}), 2000);
            setInterval(() => client.send({
              //@ts-expect-error
              event: 'deadLetter', 
              data: {componentId: 1}}), 3000);
            setInterval(() => client.send({
              //@ts-expect-error
              event: 'scrobble', 
              data: {componentId: 1}}), 2500);
            })
          ],
        },
    }
});