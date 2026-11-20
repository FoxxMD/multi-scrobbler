import preview from "../../../.storybook/preview.js";
import React from 'react';
import { Container } from '@chakra-ui/react';
import { withRouter } from 'storybook-addon-remix-react-router';
import { MirrorSummary } from "../../client/components/mirrors/Mirrors.js";
import { Provider } from "../../client/components/Provider.js";
import { generateMirrorApiJson } from "../../core/tests/utils/jobFixtures.js";

const meta = preview.meta({
  title: 'Mirrors/Mirror Summary',
  component: MirrorSummary,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  decorators: [
    withRouter,
    (Story: React.ComponentType) => (<Provider><Container maxWidth="sm"><Story/></Container></Provider>),
  ]
});

export const Base = meta.story({
  args: {
    mirror: generateMirrorApiJson()
  }
});
