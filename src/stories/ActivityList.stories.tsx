import '../client/wdyr.js';
import preview from "../../.storybook/preview.js";
import React from 'react';
import { http, HttpResponse, delay } from 'msw';

import { fn } from 'storybook/test';
import { Container } from '@chakra-ui/react';
import { ListContainerFetchable, ListContainerFilterable, ActivityList } from "../client/components/playActivity/ActivityList.js";
import {Provider} from "../client/components/Provider.js";
import { generateJsonPlays, normalizePlays } from "../core/PlayTestUtils.js";
import { ErrorLike, JsonPlayObject, qsOptions } from "../core/Atomic.js";
import {playWithLifecycleScrobble, generatePlayWithLifecycle} from '../core/tests/utils/fixtures.js'
import { generateArray } from "../core/DataUtils.js";
import dayjs from "dayjs";
import qs from 'qs';
import { asJsonPlayObject } from "../core/PlayMarshalUtils.js";
import { generatePlayApiCommon, generatePlayApiCommonDetailed, generatePlayApiCommonDetailedList } from "../core/tests/utils/apiFixtures.js";
import { PlayApiCommonDetailed } from "../core/Api.js";
import { PaginatedResponse } from "../backend/common/database/drizzle/repositories/BaseRepository.js";
import { QueryPlaysOptsJson } from '../backend/common/database/drizzle/repositories/PlayRepository.js';

// More on how to set up stories at: https://storybook.js.org/docs/writing-stories#default-export
const meta = preview.meta({
  title: 'Examples/Activity List',
  component: ActivityList,
  parameters: {
    // Optional parameter to center the component in the Canvas. More info: https://storybook.js.org/docs/configure/story-layout
    layout: 'padded',
  },
  // This component will have an automatically generated Autodocs entry: https://storybook.js.org/docs/writing-docs/autodocs
  tags: ['autodocs'],
  // More on argTypes: https://storybook.js.org/docs/api/argtypes
  // args: {
  //    data:[
  //     ] ,
  // },
  render: function Render(args, { loaded: { data } }) { return (<ActivityList {...args} data={data ?? []}/>) },
decorators: [
    (Story) => (<Provider><Container maxWidth="4xl"><Story/></Container></Provider>),
  ]
  // Use `fn` to spy on the onClick arg, which will appear in the actions panel once invoked: https://storybook.js.org/docs/essentials/actions#story-args
});

let playData: PlayApiCommonDetailed[] = [];
let livePlayData: PlayApiCommonDetailed[] = [];

// More on writing stories with args: https://storybook.js.org/docs/writing-stories/args
export const List = meta.story({
  args: {
    render: "virtDynamic"
  },

  parameters: {
  msw: {
    handlers: [
      http.get<{uid: string}>('/api/components/:componentId/play/:uid', async ({ params }) => {
        const existing = playData.find(x => x.uid === params.uid);
        if(existing !== undefined) {
          return HttpResponse.json(existing);
        }
        return HttpResponse.json(generatePlayApiCommonDetailed());
      }),
    ],
  },
},

  //render: function Render(args) { return (<ChakraProvider><MyList></MyList></ChakraProvider>) }
  loaders: [
  async () => {
    playData = await generatePlayApiCommonDetailedList()
    return {data: playData};
  }
]
});

export const ListLive = meta.story({
  component: ListContainerFetchable,
  render: function Render(args, { loaded: { data } }) { return (<ListContainerFetchable {...args}/>) },
  args: {
    render: "virtDynamic",
    componentId: 1,
    componentType: 'source'
  },
  parameters: {
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
              limit: livePlayData.length
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

  //render: function Render(args) { return (<ChakraProvider><MyList></MyList></ChakraProvider>) }
  loaders: [
    async () => {
      playData = await generatePlayApiCommonDetailedList()
      return { data: playData };
    }
  ]
});

export const ListLiveFilterable = meta.story({
  component: ListContainerFilterable,
  render: function Render(args, { loaded: { data } }) { return (<ListContainerFilterable {...args}/>) },
  args: {
    render: "virtDynamic",
    componentId: 1,
    componentType: 'source'
  },
  parameters: {
    msw: {
      handlers: [
        http.get<{ uid: string }>('/api/components/:componentId/plays', async ({ params, request }) => {
          if(livePlayData.length === 0) {
            livePlayData = await generatePlayApiCommonDetailedList();
          }
          const url = new URL(request.url)
          console.log(url.search);
          const query = qs.parse(url.search, qsOptions);
          console.log(query);
          const res: PaginatedResponse<PlayApiCommonDetailed> = {
            data: livePlayData,
            meta: {
              offset: 0,
              limit: livePlayData.length,
              total: livePlayData.length,
            }
          }
          await delay(1000);
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

  //render: function Render(args) { return (<ChakraProvider><MyList></MyList></ChakraProvider>) }
  loaders: [
    async () => {
      playData = await generatePlayApiCommonDetailedList()
      return { data: playData };
    }
  ]
});

export const ListLiveEmpty = meta.story({
  component: ListContainerFilterable,
  render: function Render(args, { loaded: { data } }) { return (<ListContainerFilterable {...args}/>) },
  args: {
    render: "virtDynamic",
    componentId: 1,
    componentType: 'source'
  },
  parameters: {
    msw: {
      handlers: [
        http.get<{ uid: string }>('/api/components/:componentId/plays', async ({ params, request }) => {
          await delay(2000);
          return HttpResponse.json({data: [], meta: {offset: 0, limit: 100}});
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
  }
});

export const ListLiveNoMorePlay = meta.story({
  component: ListContainerFilterable,
  render: function Render(args) { return (<ListContainerFilterable {...args}/>) },
  args: {
    render: "virtDynamic",
    componentId: 1,
    componentType: 'source'
  },
  parameters: {
    msw: {
      handlers: [
        http.get<{ uid: string }>('/api/components/:componentId/plays', async ({ params, request }) => {

          await delay();
          const url = new URL(request.url)
          console.log(url.search);
          const query = qs.parse(url.search, qsOptions) as QueryPlaysOptsJson;
          console.log(query);
          const offset = Number.parseInt(query.offset as unknown as string);
          if(offset > 0) {
            return HttpResponse.json({
              data: [],
              meta: {
                limit: livePlayData.length,
                offset: query.offset
              }
            });
          }
          if(livePlayData.length === 0) {
            livePlayData = await generatePlayApiCommonDetailedList();
          }
          const res: PaginatedResponse<PlayApiCommonDetailed> = {
            data: livePlayData,
            meta: {
              offset: 0,
              limit: livePlayData.length
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
});
