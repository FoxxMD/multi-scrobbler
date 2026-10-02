import preview from "../../../.storybook/preview.js";
import React from 'react';

import { PlayEdit } from "../../client/components/play/PlayEdit";
import {Provider} from "../../client/components/Provider.js";
import { Container } from '@chakra-ui/react';
import { generateArtistCredits, generateJsonPlay, withBrainz } from "../../core/tests/utils/PlayTestUtils.js"
import clone from "clone";
import { asJsonPlayObject } from '../../core/PlayMarshalUtils.js';
import type {JsonPlayObject} from "../../core/Atomic.js";

type PropsAndCustomArgs = React.ComponentProps<typeof PlayEdit> & {
  includeAlbumArtists?: boolean;
  initialPlay?: boolean
  brainz?: boolean
  play: JsonPlayObject
};
// More on how to set up stories at: https://storybook.js.org/docs/writing-stories#default-export
const meta = preview.type<{args: PropsAndCustomArgs}>().meta({
  title: 'Plays/Play Edit',
  component: PlayEdit,
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
    initialPlay: false,
    brainz: false
  },
  // Use `fn` to spy on the onClick arg, which will appear in the actions panel once invoked: https://storybook.js.org/docs/essentials/actions#story-args
});

// More on writing stories with args: https://storybook.js.org/docs/writing-stories/args
export const PlayEditStory = meta.story({
  render: function Render(args) {
    
    if(args.initialPlay === false) {
      return <PlayEdit/>;
    }

    if(args.includeAlbumArtists && (args.play.data.albumArtists === undefined || args.play.data.albumArtists.length === 0)) {
      const aa = generateArtistCredits(undefined, 2, {mbidVal: true});
      args.play.data.albumArtists = aa;
    }

    if(args.brainz) {
      // @ts-ignore
      args.play = asJsonPlayObject(withBrainz(args.play, {include: ['album','recording','track','artist']}));
    }
    return (<PlayEdit {...args}/>) 
  }
});