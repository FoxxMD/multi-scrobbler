import '../../client/wdyr.js';
import preview from "../../../.storybook/preview.js";
import React from 'react';
import { http, HttpResponse, delay, sse } from 'msw';

import { fn } from 'storybook/test';
import { Container } from '@chakra-ui/react';
import { ListContainerFetchable, ListContainerFilterable, ActivityList } from "../../client/components/playActivity/ActivityList.js";
import {Provider} from "../../client/components/Provider.js";
import { generateJsonPlays, generatePlay, normalizePlays } from "../../core/PlayTestUtils.js";
import { ErrorLike, JsonPlayObject, PlayState, qsOptions } from "../../core/Atomic.js";
import {playWithLifecycleScrobble, generatePlayWithLifecycle, randomPlayState} from '../../core/tests/utils/fixtures.js'
import { generateArray } from "../../core/DataUtils.js";
import dayjs from "dayjs";
import qs from 'qs';
import { asJsonPlayObject } from "../../core/PlayMarshalUtils.js";
import { generatePlayApiCommon, generatePlayApiCommonDetailed, generatePlayApiCommonDetailedList } from "../../core/tests/utils/apiFixtures.js";
import { MsSseEvent, PlayApiCommonDetailed } from "../../core/Api.js";
import { CompareDateBetween, PaginatedResponse } from "../../backend/common/database/drizzle/repositories/BaseRepository.js";
import { QueryPlaysOptsJson } from '../../backend/common/database/drizzle/repositories/PlayRepository.js';
import { SSEProvider } from "@flamefrontend/sse-runtime-react";
import { sseProviderOptions } from '../../client/AppNext.js';
import { faker } from '@faker-js/faker';

// More on how to set up stories at: https://storybook.js.org/docs/writing-stories#default-export
const meta = preview.meta({
  title: 'Plays/List',
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
    (Story) => (<Provider><Container maxWidth="4xl"><SSEProvider<MsSseEvent> options={sseProviderOptions}><Story/></SSEProvider></Container></Provider>),
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

export const ListLiveUpdates = meta.story({
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
          debugger;
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
          debugger;
          if(livePlayData.length === 0) {
            livePlayData = await generatePlayApiCommonDetailedList();
          }
          const existingIndex = livePlayData.findIndex(x => x.uid === params.uid);
          if (existingIndex !== -1) {
            debugger;
            const existing = livePlayData[existingIndex];
            let newState: PlayState = existing.state;
            while(newState === existing.state) {
              newState = randomPlayState();
            }
            existing.play.data.track = faker.music.songName();
            livePlayData[existingIndex].state = newState;
            const updated = {...existing, state: newState};
            return HttpResponse.json(updated);
          }
          return HttpResponse.json(generatePlayApiCommonDetailed());
        }),
        sse('/api/events?next=true', async ({ params, client }) => {
          debugger;
            setInterval(() => client.send({
              //@ts-expect-error
              event: 'playUpdate', 
              data: {componentId: 1, data: {uid: livePlayData[1].uid}}}), 2000);
        })
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

let livePlayInsertData: PlayApiCommonDetailed[] = [];
export const ListLiveInsert = meta.story({
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
          const url = new URL(request.url)
          console.log(url.search);
          const query = qs.parse(url.search, qsOptions) as QueryPlaysOptsJson;
          if(livePlayInsertData.length === 0) {
            livePlayInsertData = await generatePlayApiCommonDetailedList({endDate: dayjs((query.playedAt as CompareDateBetween<string>)?.range[0])});
          }
          console.log(query);
          const res: PaginatedResponse<PlayApiCommonDetailed> = {
            data: livePlayInsertData,
            meta: {
              offset: 0,
              limit: livePlayInsertData.length,
              total: livePlayInsertData.length,
            }
          }
          await delay(1000);
          return HttpResponse.json(res);
        }),
        http.get<{ uid: string }>('/api/components/:componentId/plays/:uid', async ({ params }) => {
          const existing = livePlayInsertData.findIndex(x => x.uid === params.uid);
          if (existing !== undefined) {
            return HttpResponse.json(existing);
          }
          return HttpResponse.json(generatePlayApiCommonDetailed());
        }),
        sse('/api/events?next=true', async ({ params, client }) => {
            setInterval(() => {
              //const first = livePlayInsertData[0].play.data.playDate;
              //const last = livePlayInsertData[livePlayData.length - 1].play.data.playDate;
              const randomIndex = faker.number.int({min: 1, max: livePlayInsertData.length - 2});
              const random = livePlayInsertData[randomIndex];

              const generatedPlayData = generatePlayApiCommonDetailed({
                playOpts: [{
                  
                  play: asJsonPlayObject(generatePlay({playDate: dayjs(random.play.data.playDate).subtract(30, 's')}))
                }]
              });
              livePlayInsertData.splice(randomIndex, 0, generatedPlayData);
              client.send({
              //@ts-expect-error
              event: 'playInsert', 
              data: {componentId: 1, data: generatedPlayData}});

            }, 2000);
        })
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