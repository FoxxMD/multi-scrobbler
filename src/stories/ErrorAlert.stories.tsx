import preview from "../../.storybook/preview.js";
import React from 'react';
import { Container } from '@chakra-ui/react';

import { fn } from 'storybook/test';
import { ErrorAlert } from "../client/components/ErrorAlert.js";
import {Provider} from "../client/components/Provider";
import { ErrorLike } from "../core/Atomic.js";

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

type PropsAndCustomArgs = React.ComponentProps<typeof ErrorAlert> & {
};
// More on how to set up stories at: https://storybook.js.org/docs/writing-stories#default-export
const meta = preview.type<{args: PropsAndCustomArgs}>().meta({
  title: 'Examples/ErrorAlert',
  component: ErrorAlert,
  parameters: {
    // Optional parameter to center the component in the Canvas. More info: https://storybook.js.org/docs/configure/story-layout
    layout: 'padded',
  },
  // This component will have an automatically generated Autodocs entry: https://storybook.js.org/docs/writing-docs/autodocs
  tags: ['autodocs'],
decorators: [
    (Story) => (<Provider><Container maxWidth="8xl"><Story/></Container></Provider>),
  ],
args: {
    error: errorExample,
  },
  // Use `fn` to spy on the onClick arg, which will appear in the actions panel once invoked: https://storybook.js.org/docs/essentials/actions#story-args
});

// More on writing stories with args: https://storybook.js.org/docs/writing-stories/args
export const ErrorAlertStory = meta.story({
  render: function Render(args) {
    return (<ErrorAlert {...args}/>) 
  }
});