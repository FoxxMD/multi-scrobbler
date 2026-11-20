import preview from "../../../.storybook/preview.js";
import React from 'react';
import { Container } from '@chakra-ui/react';
import dayjs from "dayjs";
import { withRouter } from 'storybook-addon-remix-react-router';
import { MirrorDetail } from "../../client/components/mirrors/Mirrors.js";
import { Provider } from "../../client/components/Provider.js";
import { generateMirrorApiJson } from "../../core/tests/utils/jobFixtures.js";

const meta = preview.meta({
  title: 'Mirrors/Mirror Detail',
  component: MirrorDetail,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  decorators: [
    withRouter,
    (Story: React.ComponentType) => (<Provider><Container maxWidth="4xl"><Story/></Container></Provider>),
  ]
});

const day = (n: number) => dayjs().subtract(n, 'day').valueOf();

export const Base = meta.story({
  args: {
    mirror: generateMirrorApiJson({
      coverage: [[day(2400), day(900)], [day(700), day(3)]],
      gaps: [[day(900) + 1, day(700) - 1]],
      jobs: [{id: 1, name: 'Last.fm import'}, {id: 2, name: 'Mirror to Koito'}],
    })
  }
});

export const MixedSources = meta.story({
  args: {
    mirror: generateMirrorApiJson({
      coverage: [[day(5000), day(3)]],
      segments: [
        {range: [day(5000), day(3000)], origin: 'lastfm-benjamin', jobId: 3},
        {range: [day(3000) + 1, day(1000)], origin: 'unknown', jobId: null},
        {range: [day(1000) + 1, day(3)], origin: 'lastfm', jobId: 1},
      ],
      jobs: [{id: 1, name: 'Last.fm import'}],
    })
  }
});

export const Locked = meta.story({
  args: {
    mirror: generateMirrorApiJson({
      name: 'teal.fm history',
      service: 'tealfm',
      account: 'did:plc:abc123',
      locked: true,
    })
  }
});
