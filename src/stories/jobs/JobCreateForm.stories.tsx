import preview from "../../../.storybook/preview.js";
import React from 'react';
import { fn } from 'storybook/test';
import { Container } from '@chakra-ui/react';
import { withRouter } from 'storybook-addon-remix-react-router';
import { JobCreateForm } from "../../client/components/jobs/JobCreate.js";
import { Provider } from "../../client/components/Provider.js";
import { generateJobOptionsApiJson } from "../../core/tests/utils/jobFixtures.js";

const meta = preview.meta({
  title: 'Jobs/Job Create Form',
  component: JobCreateForm,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  decorators: [
    withRouter,
    (Story: React.ComponentType) => (<Provider><Container maxWidth="4xl"><Story/></Container></Provider>),
  ]
});

export const Base = meta.story({
  args: {
    options: generateJobOptionsApiJson(),
    onSubmit: fn(),
  }
});
