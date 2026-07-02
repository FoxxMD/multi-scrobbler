import '../../client/wdyr.js';
import preview from "../../../.storybook/preview.js";
import React from 'react';
import { http, HttpResponse, delay, sse, StrictRequest, DefaultBodyType, JsonBodyType } from 'msw';

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


const handlePlayListRequest = async ({ request, list }: {request: StrictRequest<DefaultBodyType>, list: PlayApiCommonDetailed[]}): Promise<[HttpResponse<JsonBodyType>, PlayApiCommonDetailed[]]> => {
          const url = new URL(request.url)
          console.log(url.search);
          const query = qs.parse(url.search, qsOptions);
          console.log(query);
          let responseData: PlayApiCommonDetailed[] = [];
          if(list.length === 0) {
            list = await generatePlayApiCommonDetailedList();
            responseData = list;
          } else {
            const startDate = dayjs(list[Math.min(Number.parseInt(query.offset as string) - 1, list.length - 1)].playedAt);
            const moreData = await generatePlayApiCommonDetailedList({endDate: startDate});
            list = list.concat(moreData);
            responseData = moreData;
          }
          const res: PaginatedResponse<PlayApiCommonDetailed> = {
            data: responseData,
            meta: {
              offset: Number.parseInt(query.offset as string),
              limit: responseData.length,
              total: list.length,
            }
          }
          return [HttpResponse.json(res), list];
}

type PlayRequestMock = Parameters<Parameters<typeof http.get<{ uid: string }>>[1]>[0];

const handlePlayRequest = async ({params, request}: PlayRequestMock, list: PlayApiCommonDetailed[]): Promise<[HttpResponse<JsonBodyType>, PlayApiCommonDetailed[]]> => {
  if(list.length === 0) {
    list = await generatePlayApiCommonDetailedList();
  }
  const existing = list.find(x => x.uid === params.uid);
  if (existing !== undefined) {
    return [HttpResponse.json(existing), list];
  }
  return [HttpResponse.json(generatePlayApiCommonDetailed()), list];
}

let listLiveData: PlayApiCommonDetailed[] = [];
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
        http.get<{ uid: string }>('/api/components/:componentId/plays', async ({ params, request }) => {
          const [res, newList] = await handlePlayListRequest({request, list: listLiveData});
          await delay(1000);
          listLiveData = newList;
          return res;
        }),
        http.get<{ uid: string }>('/api/components/:componentId/plays/:uid', async (info) => {
          const [res, newList] = await handlePlayRequest(info, listLiveData);
          listLiveData = newList;
          await delay(1000);
          return res;
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


let livePlayData: PlayApiCommonDetailed[] = [];
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
          const [res, newList] = await handlePlayListRequest({request, list: livePlayData});
          await delay(1000);
          livePlayData = newList;
          return res;
        }),
        http.get<{ uid: string }>('/api/components/:componentId/plays/:uid', async (info) => {
          const [res, newList] = await handlePlayRequest(info, livePlayData);
          livePlayData = newList;
          await delay(1000);
          return res;
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
          return new HttpResponse('', {status: 404});
        }),
      ],
    },
  }
});

let liveNoMorePlayData: PlayApiCommonDetailed[] = [];
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
                limit: liveNoMorePlayData.length,
                offset: query.offset
              }
            });
          }
          if(liveNoMorePlayData.length === 0) {
            liveNoMorePlayData = await generatePlayApiCommonDetailedList();
          }
          const res: PaginatedResponse<PlayApiCommonDetailed> = {
            data: liveNoMorePlayData,
            meta: {
              offset: 0,
              limit: livePlayData.length
            }
          }
          return HttpResponse.json(res);
        }),
        http.get<{ uid: string }>('/api/components/:componentId/plays/:uid', async (info) => {
          const [res, newList] = await handlePlayRequest(info, liveNoMorePlayData);
          liveNoMorePlayData = newList;
          await delay(1000);
          return res;
        }),
      ],
    },
  },
});

let liveUpdateData: PlayApiCommonDetailed[] = [];
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
          const [res, newList] = await handlePlayListRequest({request, list: liveUpdateData});
          await delay(1000);
          liveUpdateData = newList;
          return res;
        }),
        http.get<{ uid: string }>('/api/components/:componentId/plays/:uid', async (info) => {
          const [res, newList] = await handlePlayRequest(info, liveUpdateData);
          liveUpdateData = newList;
          await delay(1000);
          return res;
        }),
        sse('/api/events?next=true', async ({ params, client }) => {
            setInterval(() => {

              const index = faker.number.int({min: 0, max: 7});
              let newState: PlayState = liveUpdateData[index].state;
              while(newState === liveUpdateData[index].state) {
                newState = randomPlayState();
              }
              liveUpdateData[index].state = newState;
              liveUpdateData[index].play.data.track = faker.music.songName();
              liveUpdateData[index].updatedAt = dayjs().toISOString();

              client.send({
              //@ts-expect-error
              event: 'playUpdate', 
              data: {componentId: 1, data: {uid: liveUpdateData[index].uid}}})
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
          const [res, newList] = await handlePlayListRequest({request, list: livePlayInsertData});
          await delay(1000);
          livePlayInsertData = newList;
          return res;
        }),
        http.get<{ uid: string }>('/api/components/:componentId/plays/:uid', async (info) => {
          const [res, newList] = await handlePlayRequest(info, livePlayInsertData);
          livePlayInsertData = newList;
          await delay(1000);
          return res;
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