import preview from "../../../.storybook/preview.js";
import React from 'react';

import { PlayEdit } from "../../client/components/play/PlayEdit";
import { PlayEditable, PlayEditableMutable } from "../../client/components/play/PlayEditable";
import {Provider} from "../../client/components/Provider.js";
import { Container } from '@chakra-ui/react';
import { generateArtistCredits, generateJsonPlay, withBrainz } from "../../core/tests/utils/PlayTestUtils.js"
import { asJsonPlayObject } from '../../core/PlayMarshalUtils.js';
import type {PlayObjectMinimal} from "../../core/Atomic.js";
import { http, HttpResponse, delay } from 'msw';
import { generateAlbumSearchResults, generateArtistSearchResults, generateTrackSearchResults } from "../../core/tests/utils/apiFixtures.js";

type PropsAndCustomArgs = React.ComponentProps<typeof PlayEdit> & {
  includeAlbumArtists?: boolean;
  initialPlay: PlayObjectMinimal<string>
  brainz?: boolean
};
// More on how to set up stories at: https://storybook.js.org/docs/writing-stories#default-export
const meta = preview.type<{args: PropsAndCustomArgs}>().meta({
  title: 'Plays/Play Edit',
  component: PlayEdit,
  parameters: {
    // Optional parameter to center the component in the Canvas. More info: https://storybook.js.org/docs/configure/story-layout
    layout: 'padded',
        msw: {
      handlers: [
        http.get<{ query: string }>('/api/artists', async ({ params }) => {
          await delay();
          return HttpResponse.json({data: generateArtistSearchResults()});
        }),
        http.get<{ query: string }>('/api/albums', async ({ params }) => {
          await delay();
          return HttpResponse.json({data: generateAlbumSearchResults()});
        }),
        http.get<{ query: string }>('/api/tracks', async ({ params }) => {
          await delay();
          return HttpResponse.json({data: generateTrackSearchResults()});
        }),
        http.put('/api/components/1/plays/1234/play', async ({ request}) => {
          await delay();
          return HttpResponse.json(request.clone().json());
        }),
      ],
    },
  },
  // This component will have an automatically generated Autodocs entry: https://storybook.js.org/docs/writing-docs/autodocs
  tags: ['autodocs'],
decorators: [
    (Story) => (<Provider><Container maxWidth="6xl"><Story/></Container></Provider>),
  ],
args: {
    initialPlay: generateJsonPlay(),
    includeAlbumArtists: false,
    brainz: false
  },
  // Use `fn` to spy on the onClick arg, which will appear in the actions panel once invoked: https://storybook.js.org/docs/essentials/actions#story-args
});

// More on writing stories with args: https://storybook.js.org/docs/writing-stories/args
export const PlayEditStory = meta.story({
  render: (args) => {

    if(args.includeAlbumArtists && (args.initialPlay.data.albumArtists === undefined || args.initialPlay.data.albumArtists.length === 0)) {
      const aa = generateArtistCredits(undefined, 2, {mbidVal: true});
      args.initialPlay.data.albumArtists = aa;
    }

    if(args.brainz) {
      // @ts-ignore
      args.initialPlay = asJsonPlayObject(withBrainz(args.initialPlay, {include: ['album','recording','track','artist']}));
    }
    return (<PlayEdit {...args}/>) 
  }
});

export const PlayEditableStory = meta.story({
  render: (args) => {

    if(args.includeAlbumArtists && (args.initialPlay.data.albumArtists === undefined || args.initialPlay.data.albumArtists.length === 0)) {
      const aa = generateArtistCredits(undefined, 2, {mbidVal: true});
      args.initialPlay.data.albumArtists = aa;
    }

    if(args.brainz) {
      // @ts-ignore
      args.initialPlay = asJsonPlayObject(withBrainz(args.initialPlay, {include: ['album','recording','track','artist']}));
    }
    const {initialPlay, ...rest} = args;
    return (<PlayEditable editable play={initialPlay} {...rest}/>) 
  }
});

export const PlayEditableMutateStory = meta.story({
  render: (args) => {

    if(args.includeAlbumArtists && (args.initialPlay.data.albumArtists === undefined || args.initialPlay.data.albumArtists.length === 0)) {
      const aa = generateArtistCredits(undefined, 2, {mbidVal: true});
      args.initialPlay.data.albumArtists = aa;
    }

    if(args.brainz) {
      // @ts-ignore
      args.initialPlay = asJsonPlayObject(withBrainz(args.initialPlay, {include: ['album','recording','track','artist']}));
    }
    const {initialPlay, ...rest} = args;
    return (<PlayEditableMutable componentId="1" uid="1234" editable play={initialPlay} {...rest}/>) 
  }
});