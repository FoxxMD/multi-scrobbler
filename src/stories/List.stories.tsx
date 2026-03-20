import preview from "../../.storybook/preview.js";
import React from 'react';

import { fn } from 'storybook/test';
import { Container } from '@chakra-ui/react';
import { CList } from "../client/components/List";
import {Provider} from "../client/components/Provider";
import { generateJsonPlays } from "../core/PlayTestUtils.js";
import { ErrorLike, JsonPlayObject } from "../core/Atomic.js";
import {examplePlay, lastfmErrorExample} from './storyUtils.js';
import {playWithLifecycleScrobble, generatePlayWithLifecycle} from '../core/tests/utils/fixtures'

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
  component: CList,
  parameters: {
    // Optional parameter to center the component in the Canvas. More info: https://storybook.js.org/docs/configure/story-layout
    layout: 'padded',
  },
  // This component will have an automatically generated Autodocs entry: https://storybook.js.org/docs/writing-docs/autodocs
  tags: ['autodocs'],
  // More on argTypes: https://storybook.js.org/docs/api/argtypes
  args: {
     data:[
    //   ...generateJsonPlays(2).map((x) => ({play: x, status: 'queued'})),
    //   {play: examplePlay(), status: 'scrobbled'},
    //   {play: lastfmErrorExample(), status: 'error'}
      ] ,
  },
  render: function Render(args, { loaded: { data } }) { return (<CList {...args} data={data ?? []}/>) },
decorators: [
    (Story) => (<Provider><Container maxWidth="4xl"><Story/></Container></Provider>),
  ]
  // Use `fn` to spy on the onClick arg, which will appear in the actions panel once invoked: https://storybook.js.org/docs/essentials/actions#story-args
});

// More on writing stories with args: https://storybook.js.org/docs/writing-stories/args
export const List = meta.story({
    loaders: [
    async () => {
      const queued = await generatePlayWithLifecycle();
      const scrobbled = await playWithLifecycleScrobble(generatePlayWithLifecycle());
      const scrobbleError = await playWithLifecycleScrobble(generatePlayWithLifecycle(), {error: true});
      return {data: [
        {play: queued, status: 'queued'},
        {play: scrobbled, status: 'scrobbled'},
        {play: scrobbleError, status: 'error'}
      ]};
    }
  ],
  //render: function Render(args) { return (<ChakraProvider><MyList></MyList></ChakraProvider>) }
});