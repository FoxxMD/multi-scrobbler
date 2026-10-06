import preview from "../../../.storybook/preview.js";
import React from 'react';
import { fn } from 'storybook/test';

import { DurationSepEditable } from "../../client/components/play/DurationEditable.js";
import { Provider } from "../../client/components/Provider.js";
import { Container } from '@chakra-ui/react';

type PropsAndCustomArgs = React.ComponentProps<typeof DurationSepEditable>;

const meta = preview.type<{ args: PropsAndCustomArgs }>().meta({
  title: 'Plays/Duration Editable',
  component: DurationSepEditable,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (<Provider><Container maxWidth="md"><Story /></Container></Provider>),
  ],
  args: {
    // 2hr 30min 45sec
    seconds: 9045,
    onChange: fn(),
    allowMouseWheel: true
  },
});

// DurationEditable only reads seconds on mount so key on it to make the control re-seed the component

export const DurationSepEditableStory = meta.story({
  render: (args) => <DurationSepEditable {...args} />
});

// 59min 59sec, one increment of seconds should roll over to 1hr 0min 0sec
export const DurationSepEditableCarryStory = meta.story({
  args: {
    seconds: 3599,
  },
  render: (args) => <DurationSepEditable {...args} />
});
