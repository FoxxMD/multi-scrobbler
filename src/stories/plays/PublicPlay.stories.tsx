import preview from "../../../.storybook/preview.js";
import React from 'react';

import {Provider} from "../../client/components/Provider.js";
import { Container } from '@chakra-ui/react';
import { generateArtistCredits, generateJsonPlay, generatePlay, withBrainz } from "../../core/tests/utils/PlayTestUtils.js"
import { asJsonPlayObject } from '../../core/PlayMarshalUtils.js';
import type { JsonPlayObject } from "../../core/PlaySchema.js";
import { PublicPlayData } from "../../client/components/PublicDashboard.js";

type PropsAndCustomArgs = React.ComponentProps<typeof PublicPlayData> & {
  includeAlbumArtists?: boolean;
  brainz?: boolean
  play: JsonPlayObject
};
// More on how to set up stories at: https://storybook.js.org/docs/writing-stories#default-export
const meta = preview.type<{args: PropsAndCustomArgs}>().meta({
  title: 'Plays/Public Play',
  component: PublicPlayData,
  parameters: {
    // Optional parameter to center the component in the Canvas. More info: https://storybook.js.org/docs/configure/story-layout
    layout: 'padded',
  },
  // This component will have an automatically generated Autodocs entry: https://storybook.js.org/docs/writing-docs/autodocs
  tags: ['autodocs'],
decorators: [
    (Story) => (<Provider><Container><Story/></Container></Provider>),
  ],
args: {
    play: generateJsonPlay(),
    includeAlbumArtists: false,
    brainz: true,
  },
  // Use `fn` to spy on the onClick arg, which will appear in the actions panel once invoked: https://storybook.js.org/docs/essentials/actions#story-args
});

// More on writing stories with args: https://storybook.js.org/docs/writing-stories/args
export const PublicPlayStory = meta.story({
  render: function Render(args) {

    if(args.includeAlbumArtists && (args.play.data.albumArtists === undefined || args.play.data.albumArtists.length === 0)) {
      const aa = generateArtistCredits(undefined, 2, {mbidVal: true});
      args.play.data.albumArtists = aa;
    }

    if(args.brainz) {
      args.play = withBrainz(args.play, {include: ['album','recording','track','artist']});
    }

    delete args.play.data.playDate;
    delete args.play.meta.seenAt;
    delete args.play.data.playDateCompleted

    return (<PublicPlayData {...args}/>) 
  }
});

export const PlayPlayDenseStory = meta.story({
  render: (args) => {
    const bigPlay = asJsonPlayObject(withBrainz(generatePlay({
      artists: generateArtistCredits(4,4, {mbidVal: true}),
      albumArtists: generateArtistCredits(undefined, 2, {mbidVal: true})
    }), {include: ['album','recording','track','artist']}));
    return (<PublicPlayData {...args} play={bigPlay}/>) 
  }
});