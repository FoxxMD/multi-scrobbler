import preview from "../../../.storybook/preview.js";
import React from 'react';

import { fn } from 'storybook/test';
import { Container } from '@chakra-ui/react';
import { ActivityTimeline } from "../../client/components/ActivityTimeline.js";
import {Provider} from "../../client/components/Provider.js";
import { generateJsonPlays } from "../../core/PlayTestUtils.js";
import { generatePlayApiCommonDetailed } from "../../core/tests/utils/apiFixtures.js";
import { generatePlayWithLifecycle, playWithLifecycleScrobble } from "../../core/tests/utils/fixtures.js";
import { asJsonPlayObject } from '../../core/PlayMarshalUtils.js';

// More on how to set up stories at: https://storybook.js.org/docs/writing-stories#default-export
const meta = preview.meta({
  title: 'Timelines/Play',
  component: ActivityTimeline,
  parameters: {
    // Optional parameter to center the component in the Canvas. More info: https://storybook.js.org/docs/configure/story-layout
    layout: 'padded',
  },
  // This component will have an automatically generated Autodocs entry: https://storybook.js.org/docs/writing-docs/autodocs
  tags: ['autodocs'],
  // More on argTypes: https://storybook.js.org/docs/api/argtypes
  args: {
     //activity: generatePlayApiCommonDetailed(),
     componentType: 'source' as const
  },
  argTypes: {
    componentType: {
      control: { type: 'select' },
      options: ['source', 'client'],
    }
  },
  render: function Render(args, { loaded: { activity } }) {
     return (<ActivityTimeline {...args}  activity={activity}/>) 
    },
decorators: [
    (Story) => (<Provider><Container maxWidth="4xl"><Story/></Container></Provider>),
  ]
  // Use `fn` to spy on the onClick arg, which will appear in the actions panel once invoked: https://storybook.js.org/docs/essentials/actions#story-args
});

export const NotLoaded = meta.story({
});

// More on writing stories with args: https://storybook.js.org/docs/writing-stories/args
export const ActivityTimelineStory = meta.story({
    loaders: [
    async (ctx) => {
      const scrobbleError = asJsonPlayObject(await playWithLifecycleScrobble(generatePlayWithLifecycle(
        {
        lifecycleSteps: {
          preCompare: 1,
          postCompare: 1,
        }
      }
      )));
      return {
        activity: generatePlayApiCommonDetailed({
        playOpts: [{play: scrobbleError}],
        inputOpts: [{play: scrobbleError}]
      }),
    };
    }
  ],
});

export const ScrobbleError = meta.story({
    loaders: [
    async () => {
      const scrobbleError = asJsonPlayObject(await playWithLifecycleScrobble(generatePlayWithLifecycle(), {error: true}));
      return {
        activity: generatePlayApiCommonDetailed({
        playOpts: [{play: scrobbleError}],
        inputOpts: [{play: scrobbleError}]
      })
    }
  }
  ],
});

export const TransformError = meta.story({
    loaders: [
    async () => {
      const scrobbleError = asJsonPlayObject(await generatePlayWithLifecycle({
        lifecycleSteps: {
          preCompare: 2,
          postCompare: [false],
        }
      }));
      return {
        activity: generatePlayApiCommonDetailed({
        playOpts: [{play: scrobbleError}],
        inputOpts: [{play: scrobbleError}]
      })
    }
    }
  ],
});

export const TransformSkip = meta.story({
    loaders: [
    async () => {
      const play = asJsonPlayObject(await generatePlayWithLifecycle({
        lifecycleSteps: {
          preCompare: [true, 'skipped', true],
        }
      }));
      return {
        activity: generatePlayApiCommonDetailed({
        playOpts: [{play}],
        inputOpts: [{play}]
      })
    }
    }
  ],
});

export const TransformPrereq = meta.story({
    loaders: [
    async () => {
      const play = asJsonPlayObject(await generatePlayWithLifecycle({
        lifecycleSteps: {
          preCompare: [true, 'prereq'],
        }
      }));
      return {
        activity: generatePlayApiCommonDetailed({
        playOpts: [{play}],
        inputOpts: [{play}]
      })
    }
    }
  ],
});

export const TransformStop = meta.story({
    loaders: [
    async () => {
      const play = asJsonPlayObject(await generatePlayWithLifecycle({
        lifecycleSteps: {
          preCompare: [true, 'stop'],
        }
      }));
      return {
        activity: generatePlayApiCommonDetailed({
        playOpts: [{play}],
        inputOpts: [{play}]
      })
    }
    }
  ],
});
