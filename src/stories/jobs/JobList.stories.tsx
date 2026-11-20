import preview from "../../../.storybook/preview.js";
import React from 'react';
import { withRouter } from 'storybook-addon-remix-react-router';
import { JobList } from "../../client/components/jobs/JobList.js";
import { Provider } from "../../client/components/Provider.js";
import { generateJobApiJson, generateJobTargetApiJson } from "../../core/tests/utils/jobFixtures.js";

const meta = preview.meta({
  title: 'Jobs/Job List',
  component: JobList,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  decorators: [
    withRouter,
    (Story: React.ComponentType) => (<Provider><Story/></Provider>),
  ]
});

export const Base = meta.story({
  args: {
    jobs: [
      generateJobApiJson({id: 1, targets: [generateJobTargetApiJson({name: 'Maloja'}), generateJobTargetApiJson({name: 'Koito', type: 'koito', status: 'paused'})]}),
      generateJobApiJson({id: 2, name: 'Last.fm file', status: 'completed', importStatus: 'completed', importTotal: 40512, importFetched: 40512, imported: 40512, importCompletedAt: new Date().toISOString(), importFrom: {kind: 'file', originalName: 'scrobbles.json', format: 'lastfm-ghan-json', size: 24 * 1024 * 1024}}),
      generateJobApiJson({id: 3, name: 'Mirror to Koito', status: 'idle', importStatus: 'completed', importFrom: {kind: 'mirror'}, targets: [generateJobTargetApiJson({name: 'Koito', type: 'koito', status: 'idle'})]}),
    ]
  }
});
