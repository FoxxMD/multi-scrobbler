import preview from "../../.storybook/preview.js";
import React from 'react';

import { fn } from 'storybook/test';
import { Container } from '@chakra-ui/react';
import { ActivityTimeline } from "../client/components/ActivityTimeline";
import {Provider} from "../client/components/Provider";
import { generateJsonPlays } from "../core/PlayTestUtils.js";
import { generatePlayApiCommonDetailed } from "../core/tests/utils/apiFixtures.js";
import { generatePlayWithLifecycle, playWithLifecycleScrobble } from "../core/tests/utils/fixtures.js";
import { asJsonPlayObject } from '../core/PlayMarshalUtils.js';
import { ActivityDetails } from "../client/components/ActivityDetail.js";

// More on how to set up stories at: https://storybook.js.org/docs/writing-stories#default-export
const meta = preview.meta({
  title: 'Examples/ActivityDetails',
  component: ActivityDetails,
  parameters: {
    // Optional parameter to center the component in the Canvas. More info: https://storybook.js.org/docs/configure/story-layout
    layout: 'padded',
  },
  // This component will have an automatically generated Autodocs entry: https://storybook.js.org/docs/writing-docs/autodocs
  tags: ['autodocs'],
  // More on argTypes: https://storybook.js.org/docs/api/argtypes
  args: {
     activity: generatePlayApiCommonDetailed(),
     componentType: 'source' as const
  },
  argTypes: {
    componentType: {
      control: { type: 'select' },
      options: ['source', 'client'],
    }
  },
  render: function Render(args, { loaded: { activity } }) {
     return (<ActivityDetails {...args}  activity={activity}/>) 
    },
decorators: [
    (Story) => (<Provider><Container maxWidth="2xl"><Story/></Container></Provider>),
  ]
  // Use `fn` to spy on the onClick arg, which will appear in the actions panel once invoked: https://storybook.js.org/docs/essentials/actions#story-args
});

// More on writing stories with args: https://storybook.js.org/docs/writing-stories/args
export const ActivityDetailStory = meta.story({
    loaders: [
    async (ctx) => {
      const play = asJsonPlayObject(await playWithLifecycleScrobble(generatePlayWithLifecycle(
        {
        lifecycleSteps: {
          preCompare: 1,
          postCompare: 1,
        }
      }
      )));
      return {
        activity: generatePlayApiCommonDetailed({
        playOpts: [{play: play}],
        inputOpts: [{play: play}]
      }),
    };
    }
  ],
});