import preview from "../../../.storybook/preview.js";
import React from 'react';
import { http, HttpResponse } from 'msw';

import { Container } from '@chakra-ui/react';
import {Provider} from "../../client/components/Provider.js";
import { logsApiResponse } from "../../core/tests/utils/apiFixtures.js";
import { RightHeaderFloatingLogs } from "../../client/components/AppHeader.js";

// More on how to set up stories at: https://storybook.js.org/docs/writing-stories#default-export
const meta = preview.meta({
  title: 'Logs/Floating Panel',
  component: RightHeaderFloatingLogs,
  parameters: {
    // Optional parameter to center the component in the Canvas. More info: https://storybook.js.org/docs/configure/story-layout
    layout: 'padded',
      msw: {
        handlers: [
          http.get<{uid: string}>('/api/logs', async ({ params }) => {
            return HttpResponse.json(logsApiResponse());
          }),
        ],
      },
  },
  // This component will have an automatically generated Autodocs entry: https://storybook.js.org/docs/writing-docs/autodocs
  tags: ['autodocs'],
  // More on argTypes: https://storybook.js.org/docs/api/argtypes
  args: {
     streamable: false,
  },
  render: function Render(args) {
     return (<RightHeaderFloatingLogs {...args} />) 
    },
decorators: [
    (Story) => (<Provider><Container fluid><Story/></Container></Provider>),
  ]
  // Use `fn` to spy on the onClick arg, which will appear in the actions panel once invoked: https://storybook.js.org/docs/essentials/actions#story-args
});

export const LogWindow = meta.story({
});