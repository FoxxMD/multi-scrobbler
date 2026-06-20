import '../client/wdyr.js';
import preview from "../../.storybook/preview.js";
import React from 'react';
import { http, HttpResponse, delay } from 'msw';

import { fn } from 'storybook/test';
import { Container } from '@chakra-ui/react';
import { ListContainerFetchable, ListContainerFilterable, PlayList } from "../client/components/playActivity/PlayList.js";
import {Provider} from "../client/components/Provider";
import { generateJsonPlays, normalizePlays } from "../core/PlayTestUtils.js";
import { ErrorLike, JsonPlayObject } from "../core/Atomic.js";
import {playWithLifecycleScrobble, generatePlayWithLifecycle} from '../core/tests/utils/fixtures'
import { generateArray } from "../core/DataUtils.js";
import dayjs from "dayjs";
import { asJsonPlayObject } from "../core/PlayMarshalUtils.js";
import { generatePlayApiCommon, generatePlayApiCommonDetailed, generatePlayApiCommonDetailedList } from "../core/tests/utils/apiFixtures.js";
import { PlayApiCommonDetailed } from "../core/Api.js";
import { PaginatedResponse } from "../backend/common/database/drizzle/repositories/BaseRepository.js";

const stack = "Scrobble Submit Error: Failed to submit to Listenbrainz (listen_type single)\n    at ListenbrainzApiClient.submitListen (/app/src/backend/common/vendor/ListenbrainzApiClient.ts:246:19)\n    at process.processTicksAndRejections (node:internal/process/task_queues:95:5)\n    at async ListenbrainzScrobbler.doScrobble (/app/src/backend/scrobblers/ListenbrainzScrobbler.ts:87:28)\n    at async ListenbrainzScrobbler.scrobble (/app/src/backend/scrobblers/AbstractScrobbleClient.ts:679:28)\n    at async ListenbrainzScrobbler.processDeadLetterScrobble (/app/src/backend/scrobblers/AbstractScrobbleClient.ts:920:39)\n    at async ListenbrainzScrobbler.processDeadLetterQueue (/app/src/backend/scrobblers/AbstractScrobbleClient.ts:894:43)\n    at async PromisePoolExecutor.handler (/app/src/backend/tasks/heartbeatClients.ts:35:21)\n    at async PromisePoolExecutor.waitForActiveTaskToFinish (/app/node_modules/@supercharge/promise-pool/dist/promise-pool-executor.js:375:9)\n    at async PromisePoolExecutor.waitForProcessingSlot (/app/node_modules/@supercharge/promise-pool/dist/promise-pool-executor.js:368:13)\n    at async PromisePoolExecutor.process (/app/node_modules/@supercharge/promise-pool/dist/promise-pool-executor.js:354:13)";

const errorExample: ErrorLike = {
    showStopper: false,
    name: "Scrobble Submit Error",
    message: "Failed to submit to Listenbrainz (listen_type single)",
    stack: `${stack}`,
    cause: {
      errno: -104,
      code: "ECONNRESET",
      syscall: "read",
      name: "Error",
      message: "read ECONNRESET",
      stack: "Error: read ECONNRESET\n    at TLSWrap.onStreamRead (node:internal/stream_base_commons:218:20)\n    at TLSWrap.callbackTrampoline (node:internal/async_hooks:130:17)"
    }
}

// More on how to set up stories at: https://storybook.js.org/docs/writing-stories#default-export
const meta = preview.meta({
  title: 'Examples/ActivityLog',
  component: PlayList,
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
  render: function Render(args, { loaded: { data } }) { return (<PlayList {...args} data={data ?? []}/>) },
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
    render: "accordian"
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
    render: "accordian",
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
    render: "accordian",
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

  //render: function Render(args) { return (<ChakraProvider><MyList></MyList></ChakraProvider>) }
  loaders: [
    async () => {
      playData = await generatePlayApiCommonDetailedList()
      return { data: playData };
    }
  ]
});