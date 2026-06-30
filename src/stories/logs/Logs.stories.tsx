import preview from "../../../.storybook/preview.js";
import React from 'react';

import { Container, Box } from '@chakra-ui/react';
import { Logs } from "../../client/components/LogsNext.js";
import {Provider} from "../../client/components/Provider.js";
import { generateClientApiJson, generateSourceApiJson, generateSourcePlayerJson } from "../../core/tests/utils/apiFixtures.js";

const traceMessage = "[2026-06-16 13:02:42.674 -0400] \u001b[90mTRACE\u001b[39m  : \u001b[36m\u001b[90m[App]\u001b[36m \u001b[90m[Scrobblers]\u001b[36m \u001b[90m[Koito - koito]\u001b[36m \u001b[90m[Now Playing]\u001b[36m Not updating, previous matches current update --BUT-- time since last update (194s) is less than max threshold 238.121s\u001b[39m";
const debugMessage = "[2026-06-16 13:03:20.150 -0400] \u001b[34mDEBUG\u001b[39m  : \u001b[36m\u001b[90m[App]\u001b[36m \u001b[90m[Sources]\u001b[36m \u001b[90m[Spotify - default]\u001b[36m Temporarily decreasing polling interval to 1.00s due to Player c98a8fb80e-foxx-arch-SingleUser reporting track duration remaining (2.01s) less than normal interval (10.00s)\u001b[39m";
const verboseMessage = "[2026-06-16 13:03:23.568 -0400] \u001b[35mVERBOSE\u001b[39m: \u001b[36m\u001b[90m[App]\u001b[36m \u001b[90m[Sources]\u001b[36m \u001b[90m[Spotify - default]\u001b[36m \u001b[90m[Player c98a8fb80e-foxx-arch-SingleUser]\u001b[36m New Play: (2KcQh1rHrJ23eaxax1L1PG) Strutman Lane - One of a Kind\u001b[39m";
const infoMessage = "[2026-06-16 13:03:24.129 -0400] \u001b[32mINFO\u001b[39m   : \u001b[36m\u001b[90m[App]\u001b[36m \u001b[90m[Scrobblers]\u001b[36m \u001b[90m[Koito - koito]\u001b[36m Scrobbled (New)     => (Spotify) Couch - Jessie @ 2026-06-16T13:03:23-04:00 (C)\u001b[39m";
const errorMessage = "[2026-06-16 10:41:13.948 -0400] \u001b[31mERROR\u001b[39m  : \u001b[36m\u001b[90m[App]\u001b[36m \u001b[90m[Scrobblers]\u001b[36m \u001b[90m[Lastfm - mylfm]\u001b[36m Scrobble Error (New)\u001b[39m\n    playInfo: \"Alice Auer - Unknown @ 2026-06-16T10:06:07-04:00 (C)\"\n    payload: {\n      \"artist\": \"Alice Auer\",\n      \"track\": \"Unknown\",\n      \"album\": \"Unknown\",\n      \"timestamp\": 1781618767,\n      \"mbid\": \"9957324d-3c86-47cd-b844-0c92cf374ec1\",\n      \"duration\": 214\n    }";

const messages = [traceMessage, debugMessage, verboseMessage, infoMessage, errorMessage];

// More on how to set up stories at: https://storybook.js.org/docs/writing-stories#default-export
const meta = preview.meta({
  title: 'Logs/Log Lines',
  component: Logs,
  parameters: {
    // Optional parameter to center the component in the Canvas. More info: https://storybook.js.org/docs/configure/story-layout
    layout: 'padded',
  },
  // This component will have an automatically generated Autodocs entry: https://storybook.js.org/docs/writing-docs/autodocs
  tags: ['autodocs'],
  // More on argTypes: https://storybook.js.org/docs/api/argtypes
  args: {
     logs: messages.map(x => ({message: x}))
  },
  render: function Render(args) {
     return (<Logs {...args} />) 
    },
decorators: [
    (Story) => (<Provider><Container fluid><Story/></Container></Provider>),
  ]
  // Use `fn` to spy on the onClick arg, which will appear in the actions panel once invoked: https://storybook.js.org/docs/essentials/actions#story-args
});

export const LogLevels = meta.story({
});