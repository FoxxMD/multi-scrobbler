import preview from "../../../.storybook/preview.js";
import React from 'react';

import { AlbumSearchResultItem } from "../../client/components/play/AlbumSearch.js";
import { Provider } from "../../client/components/Provider.js";
import { Container } from '@chakra-ui/react';
import { generateAlbumSearchResult } from "../../core/tests/utils/apiFixtures.js";

type PropsAndCustomArgs = React.ComponentProps<typeof AlbumSearchResultItem> & {
  initial?: string
};
// More on how to set up stories at: https://storybook.js.org/docs/writing-stories#default-export
const meta = preview.type<{ args: PropsAndCustomArgs }>().meta({
  title: 'Plays/Search/Album Result',
  component: AlbumSearchResultItem,
  parameters: {
    // Optional parameter to center the component in the Canvas. More info: https://storybook.js.org/docs/configure/story-layout
    layout: 'padded',
  },
  // This component will have an automatically generated Autodocs entry: https://storybook.js.org/docs/writing-docs/autodocs
  tags: ['autodocs'],
  decorators: [
    (Story) => (<Provider><Container maxWidth="md"><Story /></Container></Provider>),
  ],
  args: {
    data: generateAlbumSearchResult(),
  },
  // Use `fn` to spy on the onClick arg, which will appear in the actions panel once invoked: https://storybook.js.org/docs/essentials/actions#story-args
});

// More on writing stories with args: https://storybook.js.org/docs/writing-stories/args
export const AlbumResultStory = meta.story({
  render: (args) => <AlbumSearchResultItem {...args} />
});