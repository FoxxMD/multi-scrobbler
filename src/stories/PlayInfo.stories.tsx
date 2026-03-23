import preview from "../../.storybook/preview.js";
import React from 'react';

import { fn } from 'storybook/test';
import { PlayData } from "../client/components/PlayData.js";
import {Provider} from "../client/components/Provider";
import { Container } from '@chakra-ui/react';
import { generateArtists, generateJsonPlay, generatePlay } from "../core/PlayTestUtils.js"
import clone from "clone";

type PropsAndCustomArgs = React.ComponentProps<typeof PlayData> & {
  includeAlbumArtists?: boolean;
  defaultFinal?: boolean
};
// More on how to set up stories at: https://storybook.js.org/docs/writing-stories#default-export
const meta = preview.type<{args: PropsAndCustomArgs}>().meta({
  title: 'Examples/PlayInfo',
  component: PlayData,
  parameters: {
    // Optional parameter to center the component in the Canvas. More info: https://storybook.js.org/docs/configure/story-layout
    layout: 'padded',
  },
  // This component will have an automatically generated Autodocs entry: https://storybook.js.org/docs/writing-docs/autodocs
  tags: ['autodocs'],
decorators: [
    (Story) => (<Provider><Container maxWidth="2xl"><Story/></Container></Provider>),
  ],
args: {
    play: generateJsonPlay(),
    includeAlbumArtists: false,
    showCodeToggle: true,
    defaultFinal: true
  },
  // Use `fn` to spy on the onClick arg, which will appear in the actions panel once invoked: https://storybook.js.org/docs/essentials/actions#story-args
});

// More on writing stories with args: https://storybook.js.org/docs/writing-stories/args
export const PlayInfoStory = meta.story({
  render: function Render(args) {

    if(args.defaultFinal && args.final === undefined) {
      const final = clone(args.play);
      final.data.track = `${final.data.track} (Album Version)`;
      args.final = final;
    }
    
    if(args.includeAlbumArtists && (args.play.data.albumArtists === undefined || args.play.data.albumArtists.length === 0)) {
      const aa = generateArtists(undefined, 2);
      args.play.data.albumArtists = aa;
      if(args.final !== undefined) {
        args.final.data.albumArtists = aa;
      }
    }
    return (<PlayData {...args}/>) 
  }
});