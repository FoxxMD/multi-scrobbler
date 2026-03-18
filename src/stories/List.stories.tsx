import preview from "../../.storybook/preview.js";
import React from 'react';

import { fn } from 'storybook/test';
import { CList, ListContainer } from "../client/components/List";
import {Provider} from "../client/components/Provider";
import { generateJsonPlays } from "../backend/tests/utils/PlayTestUtils.js";



// More on how to set up stories at: https://storybook.js.org/docs/writing-stories#default-export
const meta = preview.meta({
  title: 'List',
  component: ListContainer,
  parameters: {
    // Optional parameter to center the component in the Canvas. More info: https://storybook.js.org/docs/configure/story-layout
    layout: 'padded',
  },
  // This component will have an automatically generated Autodocs entry: https://storybook.js.org/docs/writing-docs/autodocs
  tags: ['autodocs'],
  // More on argTypes: https://storybook.js.org/docs/api/argtypes
  args: {
     data: (generateJsonPlays(3, undefined, {source: 'Spotify'})).map((x, index) => ({play: x, status: index === 0 ? 'queued' : index === 1 ? 'scrobbled' : index === 2 ? 'error' : 'unknown'})),
  },
decorators: [
    (Story) => (<Provider><Story/></Provider>),
  ]
  // Use `fn` to spy on the onClick arg, which will appear in the actions panel once invoked: https://storybook.js.org/docs/essentials/actions#story-args
});

// More on writing stories with args: https://storybook.js.org/docs/writing-stories/args
export const List = meta.story({
  //render: function Render(args) { return (<ChakraProvider><MyList></MyList></ChakraProvider>) }
});