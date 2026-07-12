import preview from "../../../.storybook/preview.js";
import React from 'react';


import { Container } from '@chakra-ui/react';
import {Provider} from "../../client/components/Provider.js";;
import { SSEStatusElement } from "../../client/components/AppHeader.js";

// More on how to set up stories at: https://storybook.js.org/docs/writing-stories#default-export
const meta = preview.meta({
  title: 'Header/SSE Status',
  component: SSEStatusElement,
  parameters: {
    // Optional parameter to center the component in the Canvas. More info: https://storybook.js.org/docs/configure/story-layout
    layout: 'padded',
  },
  // This component will have an automatically generated Autodocs entry: https://storybook.js.org/docs/writing-docs/autodocs
  tags: ['autodocs'],
  // More on argTypes: https://storybook.js.org/docs/api/argtypes
  // args: {
  //    streamable: false,
  // },
  render: function Render(args) {
     return (<SSEStatusElement {...args} />) 
    },
decorators: [
    (Story) => (<Provider><Container fluid><Story/></Container></Provider>),
  ]
  // Use `fn` to spy on the onClick arg, which will appear in the actions panel once invoked: https://storybook.js.org/docs/essentials/actions#story-args
});

export const LogWindow = meta.story({
});