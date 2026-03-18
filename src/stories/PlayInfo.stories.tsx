import preview from "../../.storybook/preview.js";
import React from 'react';

import { fn } from 'storybook/test';
import { PlayInfo } from "../client/components/PlayInfo";
import {Provider} from "../client/components/Provider";
import { generateArtists, generateJsonPlay, generatePlay } from "../backend/tests/utils/PlayTestUtils"
import clone from "clone";

type PropsAndCustomArgs = React.ComponentProps<typeof PlayInfo> & {
  includeAlbumArtists?: boolean;
};
// More on how to set up stories at: https://storybook.js.org/docs/writing-stories#default-export
const meta = preview.type<{args: PropsAndCustomArgs}>().meta({
  title: 'Examples/PlayInfo',
  component: PlayInfo,
  parameters: {
    // Optional parameter to center the component in the Canvas. More info: https://storybook.js.org/docs/configure/story-layout
    layout: 'padded',
  },
  // This component will have an automatically generated Autodocs entry: https://storybook.js.org/docs/writing-docs/autodocs
  tags: ['autodocs'],
decorators: [
    (Story) => (<Provider><Story/></Provider>),
  ],
  // Use `fn` to spy on the onClick arg, which will appear in the actions panel once invoked: https://storybook.js.org/docs/essentials/actions#story-args
});

const orig = generateJsonPlay();
orig.data.playDateCompleted = orig.data.playDate;
const final = clone(orig);
final.data.track = `${final.data.track} (Album Version)`;

// More on writing stories with args: https://storybook.js.org/docs/writing-stories/args
export const PlayInfoStory = meta.story({
  args: {
    play: orig,
    final,
    includeAlbumArtists: false,
    showCodeToggle: true
  },
  render: function Render(args) {
    
    if(args.includeAlbumArtists && (args.play.data.albumArtists === undefined || args.play.data.albumArtists.length === 0)) {
      const aa = generateArtists(undefined, 2);
      args.play.data.albumArtists = aa;
      args.final.data.albumArtists = aa;
    }
    return (<PlayInfo {...args}/>) 
  }
});