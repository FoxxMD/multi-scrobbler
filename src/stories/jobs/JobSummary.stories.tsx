import preview from "../../../.storybook/preview.js";
import React from 'react';
import { Container } from '@chakra-ui/react';
import { withRouter } from 'storybook-addon-remix-react-router';
import { JobSummary } from "../../client/components/jobs/JobList.js";
import { Provider } from "../../client/components/Provider.js";
import { generateJobApiJson, generateJobTargetApiJson } from "../../core/tests/utils/jobFixtures.js";

const meta = preview.meta({
  title: 'Jobs/Job Summary',
  component: JobSummary,
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
    job: generateJobApiJson({targets: [generateJobTargetApiJson({name: 'Maloja'})]})
  }
});
