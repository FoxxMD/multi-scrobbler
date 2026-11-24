import preview from "../../../.storybook/preview.js";
import React from 'react';

import { Container } from '@chakra-ui/react';
import { ActivityTimeline } from "../../client/components/ActivityTimeline.js";
import {Provider} from "../../client/components/Provider.js";
import { generatePlayApiCommonDetailed } from "../../core/tests/utils/apiFixtures.js";
import { generatePlayWithLifecycle, playWithLifecycleScrobble } from "../../core/tests/utils/fixtures.js";
import { asJsonPlayObject } from '../../core/PlayMarshalUtils.js';
import { diffObjects } from '../../core/DataUtils.js';

const submitted = {track: 'Our Wave', artists: ['Chris Lake with Bonobo ft. Alexis Roberts']};
const parseChanges = (artists: string[]) => ({submitted, patch: diffObjects(submitted, {track: 'Our Wave', artists})});

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

export const ParseRejected = meta.story({
    loaders: [
    async () => {
      const {play: generated, steps} = generatePlayWithLifecycle();
      const play = asJsonPlayObject(await playWithLifecycleScrobble(generated));
      return {
        activity: generatePlayApiCommonDetailed({
        playOpts: [{play}],
        inputOpts: [{play}],
        steps,
        parse: {parser: 'listenbrainz', decisions: [
          {step: 'segment', outcome: 'skipped', reason: 'Artist has words that are not part of a reference artist or a joiner'},
          {step: 'joinedNames', outcome: 'skipped', reason: 'No reference artists have delimiters in their names'},
          {step: 'delimiters', outcome: 'applied', reason: 'Split artists using default delimiters and track using default delimiters', candidates: ['Chris Lake with Bonobo', 'Alexis Roberts']},
          {step: 'primaryArtistGate', outcome: 'rejected', reason: "Primary artist candidate 'Chris Lake with Bonobo' did not match any reference artist"},
          {step: 'naive', outcome: 'applied', reason: 'Parsed artists and track from submitted values only, without reference data'},
          {step: 'naiveDelimiters', outcome: 'applied', reason: 'Split only credited (ft./feat./vs) artists using , / \\ and track using default delimiters', candidates: ['Chris Lake with Bonobo', 'Alexis Roberts']},
        ], ...parseChanges(['Chris Lake with Bonobo', 'Alexis Roberts'])}
      })
    }
  }
  ],
});

export const ParseWithReference = meta.story({
    loaders: [
    async () => {
      const {play: generated, steps} = generatePlayWithLifecycle();
      const play = asJsonPlayObject(await playWithLifecycleScrobble(generated));
      return {
        activity: generatePlayApiCommonDetailed({
        playOpts: [{play}],
        inputOpts: [{play}],
        steps,
        parse: {parser: 'listenbrainz', decisions: [
          {step: 'segment', outcome: 'applied', reason: 'Every word of artist is a reference artist or a joiner', candidates: ['Chris Lake', 'Bonobo', 'Alexis Roberts']},
          {step: 'joinedNames', outcome: 'skipped', reason: 'No reference artists have delimiters in their names'},
          {step: 'delimiters', outcome: 'applied', reason: 'Split artists using default delimiters and track using default delimiters', candidates: []},
          {step: 'primaryArtistGate', outcome: 'applied', reason: "Primary artist candidate 'Chris Lake' matched reference artist 'Chris Lake'"},
          {step: 'merge', outcome: 'applied', reason: 'Replaced candidates with matching reference artists and added unmatched reference artists', candidates: ['Chris Lake', 'Bonobo', 'Alexis Roberts']},
          {step: 'trackGate', outcome: 'applied', reason: "Track 'Our Wave' matched reference track 'Our Wave'"},
        ], ...parseChanges(['Chris Lake', 'Bonobo', 'Alexis Roberts'])}
      })
    }
  }
  ],
});
