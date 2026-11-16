import preview from "../../../.storybook/preview.js";
import React from 'react';

import { Container } from '@chakra-ui/react';
import { ActivityTimeline } from "../../client/components/ActivityTimeline.js";
import {Provider} from "../../client/components/Provider.js";
import { generatePlayApiCommonDetailed } from "../../core/tests/utils/apiFixtures.js";
import { generatePlayWithLifecycle, playWithLifecycleScrobble } from "../../core/tests/utils/fixtures.js";
import { asJsonPlayObject } from '../../core/PlayMarshalUtils.js';

// More on how to set up stories at: https://storybook.js.org/docs/writing-stories#default-export
const meta = preview.meta({
  title: 'Plays/Timeline',
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
      const {play: scrobbleErrorGenerated, steps} = generatePlayWithLifecycle(
        {
        lifecycleSteps: {
          preCompare: 1,
          postCompare: 1,
        }
      }
      );
      const scrobbleError = asJsonPlayObject(await playWithLifecycleScrobble(scrobbleErrorGenerated));
      return {
        activity: generatePlayApiCommonDetailed({
        playOpts: [{play: scrobbleError}],
        inputOpts: [{play: scrobbleError}],
        steps
      }),
    };
    }
  ],
});

export const ScrobbleError = meta.story({
    loaders: [
    async () => {
      const {play: scrobbleErrorGenerated, steps} = generatePlayWithLifecycle();
      const scrobbleError = asJsonPlayObject(await playWithLifecycleScrobble(scrobbleErrorGenerated, {error: true}));
      return {
        activity: generatePlayApiCommonDetailed({
        playOpts: [{play: scrobbleError}],
        inputOpts: [{play: scrobbleError}],
        steps
      })
    }
  }
  ],
});

export const TransformError = meta.story({
    loaders: [
    async () => {
      const {play: scrobbleErrorGenerated, steps} = generatePlayWithLifecycle({
        lifecycleSteps: {
          preCompare: 2,
          postCompare: [false],
        }
      });
      const scrobbleError = asJsonPlayObject(scrobbleErrorGenerated);
      return {
        activity: generatePlayApiCommonDetailed({
        playOpts: [{play: scrobbleError}],
        inputOpts: [{play: scrobbleError}],
        steps
      })
    }
    }
  ],
});

export const TransformSkip = meta.story({
    loaders: [
    async () => {
      const {play: playGenerated, steps} = generatePlayWithLifecycle({
        lifecycleSteps: {
          preCompare: [true, 'skipped', true],
        }
      });
      const play = asJsonPlayObject(playGenerated);
      return {
        activity: generatePlayApiCommonDetailed({
        playOpts: [{play}],
        inputOpts: [{play}],
        steps
      })
    }
    }
  ],
});

export const TransformPrereq = meta.story({
    loaders: [
    async () => {
      const {play: playGenerated, steps} = generatePlayWithLifecycle({
        lifecycleSteps: {
          preCompare: [true, 'prereq'],
        }
      });
      const play = asJsonPlayObject(playGenerated);
      return {
        activity: generatePlayApiCommonDetailed({
        playOpts: [{play}],
        inputOpts: [{play}],
        steps
      })
    }
    }
  ],
});

export const TransformStop = meta.story({
    loaders: [
    async () => {
      const {play: playGenerated, steps} = generatePlayWithLifecycle({
        lifecycleSteps: {
          preCompare: [true, 'stop'],
        }
      });
      const play = asJsonPlayObject(playGenerated);
      return {
        activity: generatePlayApiCommonDetailed({
        playOpts: [{play}],
        inputOpts: [{play}],
        steps
      })
    }
    }
  ],
});
