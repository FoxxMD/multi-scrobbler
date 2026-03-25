import preview from "../../.storybook/preview.js";
import React from 'react';

import { fn } from 'storybook/test';
import { Container } from '@chakra-ui/react';
import { TransformSteps } from "../client/components/TransformSteps.js";
import {Provider} from "../client/components/Provider";
import { generateJsonPlays } from "../core/PlayTestUtils.js";
import { ErrorLike, JsonPlayObject, PlayLifecycle } from "../core/Atomic.js";
import { examplePlay, lastfmErrorExample } from "./storyUtils.js";
import {asJsonPlayObject, generatePlayWithLifecycle} from '../core/tests/utils/fixtures'

// More on how to set up stories at: https://storybook.js.org/docs/writing-stories#default-export
const meta = preview.meta({
  title: 'Examples/TransformSteps',
  component: TransformSteps,
  parameters: {
    // Optional parameter to center the component in the Canvas. More info: https://storybook.js.org/docs/configure/story-layout
    layout: 'padded',
  },
  // This component will have an automatically generated Autodocs entry: https://storybook.js.org/docs/writing-docs/autodocs
  tags: ['autodocs'],
  // More on argTypes: https://storybook.js.org/docs/api/argtypes
decorators: [
    (Story) => (<Provider><Container maxWidth="4xl"><Story/></Container></Provider>),
  ]
  // Use `fn` to spy on the onClick arg, which will appear in the actions panel once invoked: https://storybook.js.org/docs/essentials/actions#story-args
});

const multiPlay = asJsonPlayObject(generatePlayWithLifecycle({lifecycleSteps: { preCompare: 2}}));
// More on writing stories with args: https://storybook.js.org/docs/writing-stories/args
export const Multiple = meta.story({
  args: {
    steps: multiPlay.meta.lifecycle.steps,
    original: multiPlay.meta.lifecycle.original,
    collapsibleOpen: true
  }
  //render: function Render(args) { return (<ChakraProvider><MyList></MyList></ChakraProvider>) }
});
