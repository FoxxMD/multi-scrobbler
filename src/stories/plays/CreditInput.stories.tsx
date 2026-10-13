import preview from "../../../.storybook/preview.js";
import React, { useState } from 'react';

import {Provider} from "../../client/components/Provider.js";
import { Container } from '@chakra-ui/react';
import { CreditInput } from "../../client/components/play/CreditInput.js";
import { generateArtistCredit } from "../../core/tests/utils/PlayTestUtils.js";
import type { Credit } from "../../core/Atomic.js";

type PropsAndCustomArgs = React.ComponentProps<typeof CreditInput> & {
};

// CreditInput is controlled, the story holds the credit
const StatefulCreditInput = ({ value: initial, onChange, ...rest }: PropsAndCustomArgs) => {
  const [value, setValue] = useState<Credit | undefined>(initial);
  return <CreditInput {...rest} value={value} onChange={(val) => { onChange(val); setValue(val); }} />;
}

const meta = preview.type<{args: PropsAndCustomArgs}>().meta({
  title: 'Plays/Edit/Credit Input',
  component: CreditInput,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
decorators: [
    (Story) => (<Provider><Container maxWidth="6xl"><Story/></Container></Provider>),
  ],
args: {
  value: generateArtistCredit(),
  onChange: (val) => console.log(val, 'Credit changed'),
  useWith: ['artist']
  },
});

export const Artist = meta.story({
  render: (args) => <StatefulCreditInput {...args}/>
});

export const Blank = meta.story({
  args: { value: undefined },
  render: (args) => <StatefulCreditInput {...args}/>
});
