import preview from "../../../../.storybook/preview.js";
import React from 'react';
import { Container } from '@chakra-ui/react';

import { fn } from 'storybook/test';
import { PhraseFilter } from "../../../client/components/playActivity/ListFilters.js";
import { Provider } from "../../../client/components/Provider.js";


// More on how to set up stories at: https://storybook.js.org/docs/writing-stories#default-export
const meta = preview.meta({
  title: 'Activities/List Filters/Phrase',
  component: PhraseFilter,
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
  },
  // Use `fn` to spy on the onClick arg, which will appear in the actions panel once invoked: https://storybook.js.org/docs/essentials/actions#story-args
});

// More on writing stories with args: https://storybook.js.org/docs/writing-stories/args
export const ListFiltersStory = meta.story({
  render: function Render(args) {
    return (<PhraseFilter {...args}/>) 
  }
});