import preview from "../../.storybook/preview.js";
import React from 'react';
import { http, HttpResponse, delay, sse } from 'msw';

import { Container } from '@chakra-ui/react';
import { ComponentDetailedDesktop } from "../client/components/msComponent/MSComponentDetailed.js";
import {Provider} from "../client/components/Provider";
import { generateClientApiJson, generatePlayApiCommonDetailed, generatePlayApiCommonDetailedList, generateSourceApiJson, generateSourcePlayerJson } from "../core/tests/utils/apiFixtures.js";
import { MsSseEvent, PlayApiCommonDetailed } from "../core/Api.js";
import { SSEProvider } from "@flamefrontend/sse-runtime-react";
import { sseProviderOptions } from "../client/AppNext.js";
import { faker } from "@faker-js/faker";
import { PaginatedResponse } from "../backend/common/database/drizzle/repositories/BaseRepository.js";
import dayjs from "dayjs";

let livePlayData: PlayApiCommonDetailed[] = [];

// More on how to set up stories at: https://storybook.js.org/docs/writing-stories#default-export
const meta = preview.meta({
  title: 'Examples/Component Detailed',
  component: ComponentDetailedDesktop,
  parameters: {
    // Optional parameter to center the component in the Canvas. More info: https://storybook.js.org/docs/configure/story-layout
    layout: 'padded',
    msw: {
      handlers: [
        http.get<{ uid: string }>('/api/components/:componentId/plays', async ({ params }) => {
          if(livePlayData.length === 0) {
            livePlayData = await generatePlayApiCommonDetailedList();
          }
          const res: PaginatedResponse<PlayApiCommonDetailed> = {
            data: livePlayData,
            meta: {
              offset: 0,
              limit: 100
            }
          }
          return HttpResponse.json(res);
        }),
        http.get<{ uid: string }>('/api/components/:componentId/plays/:uid', async ({ params }) => {
          if(livePlayData.length === 0) {
            livePlayData = await generatePlayApiCommonDetailedList();
          }
          const existing = livePlayData.find(x => x.uid === params.uid);
          if (existing !== undefined) {
            return HttpResponse.json(existing);
          }
          return HttpResponse.json(generatePlayApiCommonDetailed());
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
     return (<ComponentDetailedDesktop {...args} />) 
    },
decorators: [
    (Story) => (<Provider><Container maxWidth="4xl"><Story/></Container></Provider>),
  ]
  // Use `fn` to spy on the onClick arg, which will appear in the actions panel once invoked: https://storybook.js.org/docs/essentials/actions#story-args
});

export const ClientDetailed = meta.story({
    args: {
      data: generateClientApiJson()
    }
});

const randomQueue = () => faker.helpers.arrayElement(['scrobbleQueued', 'scrobbleDequeued']);

export const ClientDetailedFetchable = meta.story({
    args: {
      data: generateClientApiJson({id: 1}),
      live: true,
      componentId: 1,
    },
    decorators: [
      (Story) => 
        (<Provider><Container maxWidth="4xl"><SSEProvider<MsSseEvent> options={sseProviderOptions}><Story/></SSEProvider></Container></Provider>),
    ],
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

export const SourceDetailed = meta.story({
    args: {
      data: generateSourceApiJson({players: {test: generateSourcePlayerJson(undefined, {art: true}), foo: generateSourcePlayerJson(undefined, {art: true})}})
    }
});

export const SourceDetailedSleeping = meta.story({
    args: {
      data: generateSourceApiJson({sleeping: true, wakeAt: dayjs().add(45, 's').toISOString()})
    }
});