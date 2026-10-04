import preview from "../../../.storybook/preview.js";
import React from 'react';

import { ArtistSearchResultItem } from "../../client/components/play/ArtistSearch.js";
import { Provider } from "../../client/components/Provider.js";
import { Container } from '@chakra-ui/react';
import { generateArtistSearchResult } from "../../core/tests/utils/apiFixtures.js";

type PropsAndCustomArgs = React.ComponentProps<typeof ArtistSearchResultItem> & {
  initial?: string
};
// More on how to set up stories at: https://storybook.js.org/docs/writing-stories#default-export
const meta = preview.type<{ args: PropsAndCustomArgs }>().meta({
  title: 'Plays/Search/Artist Search',
  component: ArtistSearchResultItem,
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
    data: generateArtistSearchResult(),
  },
  // Use `fn` to spy on the onClick arg, which will appear in the actions panel once invoked: https://storybook.js.org/docs/essentials/actions#story-args
});

// More on writing stories with args: https://storybook.js.org/docs/writing-stories/args
export const ArtistResultStory = meta.story({
  render: (args) => <ArtistSearchResultItem {...args} />
});