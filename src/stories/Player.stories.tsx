import preview from "../../.storybook/preview.js";
import React from 'react';
import { http, HttpResponse, delay, sse } from 'msw';

import { Container } from '@chakra-ui/react';
import { ChakraPlayer, ChakraPlayerFetchable } from "../client/components/chakraPlayer/Player";
import {Provider} from "../client/components/Provider";
import { generateClientApiJson, generateSourceApiJson, generateSourcePlayerJson } from "../core/tests/utils/apiFixtures.js";
import { MsSseEvent } from "../core/Api.js";
import { SSEProvider } from "@flamefrontend/sse-runtime-react";
import { sseProviderOptions } from "../client/AppNext.js";
import dayjs from "dayjs";

// More on how to set up stories at: https://storybook.js.org/docs/writing-stories#default-export
const meta = preview.meta({
  title: 'Examples/Player',
  component: ChakraPlayer,
  parameters: {
    // Optional parameter to center the component in the Canvas. More info: https://storybook.js.org/docs/configure/story-layout
    layout: 'padded',
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
     return (<ChakraPlayer {...args} />) 
    },
decorators: [
    (Story) => (<Provider><Container maxWidth="lg"><Story/></Container></Provider>),
  ]
  // Use `fn` to spy on the onClick arg, which will appear in the actions panel once invoked: https://storybook.js.org/docs/essentials/actions#story-args
});

// More on writing stories with args: https://storybook.js.org/docs/writing-stories/args
export const PlayerNoArt = meta.story({
    args: {
      data: generateSourcePlayerJson()
    }
});

export const PlayerWithArt = meta.story({
    args: {
      data: generateSourcePlayerJson(undefined, {art: true})
    }
});

export const PlayerNowPlaying = meta.story({
    args: {
      data: {...generateSourcePlayerJson(undefined, {art: true}), nowPlayingMode: true }
    }
});

export const PlayerNoPosition = meta.story({
    args: {
      data: {...generateSourcePlayerJson(undefined, {art: true}), position: undefined }
    }
});

export const PlayerLive = meta.story({
  component: ChakraPlayerFetchable,
  args: {
    platformId: 'test',
    componentId: 1,
    data: generateSourcePlayerJson({platformId: 'test'}, {art: true})
  },
  parameters: {
      msw: {
        handlers: [
          http.get<{componentId: string, platformId: string}>(`/api/sources/:componentId/players/:platformId`, async ({ params }) => {
            return HttpResponse.json(generateSourcePlayerJson({platformId: params.platformId, position: 10}, {art: true}));
          }),
          sse('/api/events?next=true', async ({ params, client }) => {
          const data = generateSourcePlayerJson({platformId: 'test'}, {art: true});
          let position = 10;
          let listenedDur = 10;
          setInterval(() => {
            position += 10;
            listenedDur += 10;
            client.send({
            //@ts-expect-error
            event: 'playerUpdate', 
            data: {componentId: 1, data: {
              ...data,
              playLastUpdatedAt: dayjs().toISOString(),
              playerLastUpdatedAt: dayjs().toISOString(),
              position,
              listenedDuration: listenedDur
            }}});
          }, 10000);
          })
        ],
      },
  },
  render: function Render(args) {
    // @ts-expect-error
    return (<ChakraPlayerFetchable {...args} />) 
  },
  decorators: [
    (Story) => 
      (<Provider><Container maxWidth="4xl"><SSEProvider<MsSseEvent> options={sseProviderOptions}><Story/></SSEProvider></Container></Provider>),
  ],
});