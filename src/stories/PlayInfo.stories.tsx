import preview from "../../.storybook/preview.js";
import React from 'react';

import { fn } from 'storybook/test';
import { PlayInfo } from "../client/components/PlayInfo";
import {Provider} from "../client/components/Provider";
import { generateJsonPlay, generatePlay } from "../backend/tests/utils/PlayTestUtils"
import clone from "clone";

// More on how to set up stories at: https://storybook.js.org/docs/writing-stories#default-export
const meta = preview.meta({
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
  ]
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
    final
  },
  //render: function Render(args) { return (<ChakraProvider><MyList></MyList></ChakraProvider>) }
});