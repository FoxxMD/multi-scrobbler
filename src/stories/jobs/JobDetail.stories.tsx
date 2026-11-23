import preview from "../../../.storybook/preview.js";
import React from 'react';
import { http, HttpResponse } from 'msw';
import { Container } from '@chakra-ui/react';
import { withRouter } from 'storybook-addon-remix-react-router';
import { JobDetail } from "../../client/components/jobs/JobDetail.js";
import { Provider } from "../../client/components/Provider.js";
import { generateJobApiJson, generateJobTargetApiJson, generateMirrorApiJson } from "../../core/tests/utils/jobFixtures.js";

const meta = preview.meta({
  title: 'Jobs/Job Detail',
  component: JobDetail,
  beforeEach({ msw }) {
    msw.use(
      // the cleanup panel reads the job's mirror
      http.get<{ id: string }>('/api/mirrors/:id', ({ params }) => HttpResponse.json(generateMirrorApiJson({id: Number.parseInt(params.id)})))
    );
  },
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
    job: generateJobApiJson()
  }
});

export const ImportAndExport = meta.story({
  args: {
    job: generateJobApiJson({
      targets: [
        generateJobTargetApiJson({name: 'Maloja'}),
        generateJobTargetApiJson({name: 'Koito', type: 'koito', status: 'paused'}),
      ]
    })
  }
});

/** Transforms that discard and review Plays, with those Plays kept in the Client */
export const WithTransforms = meta.story({
  args: {
    job: generateJobApiJson({
      transformOptions: [{type: 'match', artists: 'Unknown Artist', onSuccessAction: 'discard'}, {type: 'match', duration: '< 30 s', onSuccessAction: 'review'}],
      transformSource: {kind: 'preset', name: 'cleanup'},
      exportDiscarded: true,
      targets: [
        generateJobTargetApiJson({name: 'Maloja', stats: {scrobbled: 1200, discarded: 34, review: 12}}),
      ]
    })
  }
});

/** Nothing running, so every cleanup action is available */
export const CleanupAvailable = meta.story({
  args: {
    job: generateJobApiJson({
      status: 'stopped',
      importStatus: 'completed',
      importTotal: 40512,
      importFetched: 40512,
      imported: 40512,
      mirrorPlaysInRange: 40512,
      importCompletedAt: new Date().toISOString(),
      targets: [
        generateJobTargetApiJson({name: 'Maloja', status: 'completed', exported: 40512, queued: 40512, stats: {scrobbled: 37200, duped: 3312}, completedAt: new Date().toISOString()}),
        generateJobTargetApiJson({name: 'Koito', type: 'koito', status: 'stopped'}),
      ]
    })
  }
});
