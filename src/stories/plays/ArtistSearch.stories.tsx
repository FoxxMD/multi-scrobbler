import preview from "../../../.storybook/preview.js";
import React from 'react';

import { ArtistSearch } from "../../client/components/play/ArtistSearch.js";
import { Provider } from "../../client/components/Provider.js";
import { Container } from '@chakra-ui/react';
import { http, HttpResponse } from 'msw';
import { generateArtistSearchResults } from "../../core/tests/utils/apiFixtures.js";

type PropsAndCustomArgs = React.ComponentProps<typeof ArtistSearch> & {
  initial?: string
};
// More on how to set up stories at: https://storybook.js.org/docs/writing-stories#default-export
const meta = preview.type<{ args: PropsAndCustomArgs }>().meta({
  title: 'Plays/Search/Artist Search',
  component: ArtistSearch,
  parameters: {
    // Optional parameter to center the component in the Canvas. More info: https://storybook.js.org/docs/configure/story-layout
    layout: 'padded',
    msw: {
      handlers: [
        http.get<{ query: string }>('/api/artists', async ({ params }) => {
          return HttpResponse.json({data: generateArtistSearchResults()});
        }),
      ],
    },
  },
  // This component will have an automatically generated Autodocs entry: https://storybook.js.org/docs/writing-docs/autodocs
  tags: ['autodocs'],
  decorators: [
    (Story) => (<Provider><Container maxWidth="2xl"><Story /></Container></Provider>),
  ],
  args: {
    initial: undefined,
    onSubmit: (val) => console.log(val)
  },
  // Use `fn` to spy on the onClick arg, which will appear in the actions panel once invoked: https://storybook.js.org/docs/essentials/actions#story-args
});

// More on writing stories with args: https://storybook.js.org/docs/writing-stories/args
export const ArtistSearchStory = meta.story({
  render: (args) => <ArtistSearch {...args} />
});