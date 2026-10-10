import preview from "../../../.storybook/preview.js";
import React from 'react';

import { PlayEdit } from "../../client/components/play/PlayEdit";
import { PlayEditable, PlayEditableMutable } from "../../client/components/play/PlayEditable";
import {Provider} from "../../client/components/Provider.js";
import { Container } from '@chakra-ui/react';
import { generateArtistCredits, generateJsonPlay, withBrainz } from "../../core/tests/utils/PlayTestUtils.js"
import { asJsonPlayObject } from '../../core/PlayMarshalUtils.js';
import type {PlayObjectMinimal} from "../../core/Atomic.js";
//import { http, HttpResponse, delay } from 'msw';
import { MusicServiceInput } from "../../client/components/musicServices/MusicServiceEditable";

type PropsAndCustomArgs = React.ComponentProps<typeof MusicServiceInput> & {
};
// More on how to set up stories at: https://storybook.js.org/docs/writing-stories#default-export
const meta = preview.type<{args: PropsAndCustomArgs}>().meta({
  title: 'Music Service/Input',
  component: MusicServiceInput,
  parameters: {
    // Optional parameter to center the component in the Canvas. More info: https://storybook.js.org/docs/configure/story-layout
    layout: 'padded',
        msw: {
      handlers: [
      ],
    },
  },
  // This component will have an automatically generated Autodocs entry: https://storybook.js.org/docs/writing-docs/autodocs
  tags: ['autodocs'],
decorators: [
    (Story) => (<Provider><Container maxWidth="6xl"><Story/></Container></Provider>),
  ],
args: {
  },
  // Use `fn` to spy on the onClick arg, which will appear in the actions panel once invoked: https://storybook.js.org/docs/essentials/actions#story-args
});

// More on writing stories with args: https://storybook.js.org/docs/writing-stories/args
export const InputStory = meta.story({
  render: (args) => {
    return (<MusicServiceInput {...args}/>) 
  }
});