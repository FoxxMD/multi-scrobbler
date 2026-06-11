import preview from "../../.storybook/preview.js";
import React from 'react';

import { Container } from '@chakra-ui/react';
import { ChakraPlayer } from "../client/components/chakraPlayer/Player";
import {Provider} from "../client/components/Provider";
import { generateClientApiJson, generateSourceApiJson, generateSourcePlayerJson } from "../core/tests/utils/apiFixtures.js";

// More on how to set up stories at: https://storybook.js.org/docs/writing-stories#default-export
const meta = preview.meta({
  title: 'Examples/Player',
  component: ChakraPlayer,
  parameters: {
    // Optional parameter to center the component in the Canvas. More info: https://storybook.js.org/docs/configure/story-layout
    layout: 'padded',
  },
  // This component will have an automatically generated Autodocs entry: https://storybook.js.org/docs/writing-docs/autodocs
  tags: ['autodocs'],
  // More on argTypes: https://storybook.js.org/docs/api/argtypes
  // args: {
  //    data: generatePlayApiCommonDetailed(),
  // },
  // argTypes: {
  //   componentType: {
  //     control: { type: 'select' },
  //     options: ['source', 'client'],
  //   }
  // },
  render: function Render(args) {
     return (<ChakraPlayer {...args} />) 
    },
decorators: [
    (Story) => (<Provider><Container maxWidth="lg"><Story/></Container></Provider>),
  ]
  // Use `fn` to spy on the onClick arg, which will appear in the actions panel once invoked: https://storybook.js.org/docs/essentials/actions#story-args
});

// More on writing stories with args: https://storybook.js.org/docs/writing-stories/args
export const PlayerNoArt = meta.story({
    args: {
      data: generateSourcePlayerJson()
    }
});

export const PlayerWithArt = meta.story({
    args: {
      data: generateSourcePlayerJson(undefined, {art: true})
    }
});

export const PlayerNowPlaying = meta.story({
    args: {
      data: {...generateSourcePlayerJson(undefined, {art: true}), nowPlayingMode: true }
    }
});

export const PlayerNoPosition = meta.story({
    args: {
      data: {...generateSourcePlayerJson(undefined, {art: true}), position: undefined }
    }
});