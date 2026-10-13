import preview from "../../../.storybook/preview.js";
import React from 'react';

import { PlayEdit } from "../../client/components/play/PlayEdit";
import { PlayEditable, PlayEditableMutable } from "../../client/components/play/PlayEditable";
import {Provider} from "../../client/components/Provider.js";
import { Container } from '@chakra-ui/react';
import { generateArtistCredits, generateJsonPlay, withBrainz } from "../../core/tests/utils/PlayTestUtils.js"
import { asJsonPlayObject } from '../../core/PlayMarshalUtils.js';
import type {Credit, PlayObjectMinimal} from "../../core/Atomic.js";
import { http, HttpResponse, delay } from 'msw';
import { generateAlbumSearchResults, generateArtistSearchResults, generateMusicService, generateTrackSearchResults } from "../../core/tests/utils/apiFixtures.js";
import { CreditInput } from "../../client/components/play/CreditInput.js";
import { nameToCredit } from "../../core/MusicMetadata.js";
import { NDJSON_MEDIA_TYPE, type MetadataSearchStreamLine } from "../../core/Api.js";

/** Mimics the streamed search response: a fast provider, a failing provider, then a slow provider */
const searchStreamResponse = (generate: () => object[]) => {
  const encoder = new TextEncoder();
  const lines: [number, MetadataSearchStreamLine<object>][] = [
    [300, {type: 'result', service: 'spotify', data: generate()}],
    [500, {type: 'error', service: 'rocksky', error: {name: 'Error', message: 'Provider did not respond'}}],
    [1500, {type: 'result', service: 'musicbrainz', data: generate()}],
    [0, {type: 'done'}],
  ];
  const body = new ReadableStream({
    async start(controller) {
      for (const [wait, line] of lines) {
        await delay(wait);
        controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`));
      }
      controller.close();
    }
  });
  return new HttpResponse(body, {headers: {'Content-Type': NDJSON_MEDIA_TYPE}});
}

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
        http.get<{ query: string }>('/api/metadata/search/artists', () => searchStreamResponse(generateArtistSearchResults)),
        http.post<{ query: string }>('/api/metadata/search/artists', () => searchStreamResponse(generateArtistSearchResults)),
        http.get<{ query: string }>('/api/metadata/search/albums', () => searchStreamResponse(generateAlbumSearchResults)),
        http.post<{ query: string }>('/api/metadata/search/albums', () => searchStreamResponse(generateAlbumSearchResults)),
        http.get<{ query: string }>('/api/metadata/search/tracks', () => searchStreamResponse(generateTrackSearchResults)),
        http.post<{ query: string }>('/api/metadata/search/tracks', () => searchStreamResponse(generateTrackSearchResults)),
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

export const PlayCreditEditStory = meta.story({
  render: (args) => {
    const onChange = (val: Credit) => console.log(val, 'credit input onchange')
    return (<CreditInput value={nameToCredit('test',generateMusicService({name: 'musicbrainz'}))} onChange={onChange}/>) 
  }
});