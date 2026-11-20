import preview from "../../../.storybook/preview.js";
import React from 'react';
import { withRouter } from 'storybook-addon-remix-react-router';
import { MirrorList } from "../../client/components/mirrors/Mirrors.js";
import { Provider } from "../../client/components/Provider.js";
import { generateMirrorApiJson } from "../../core/tests/utils/jobFixtures.js";

const meta = preview.meta({
  title: 'Mirrors/Mirror List',
  component: MirrorList,
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
    mirrors: [
      generateMirrorApiJson({id: 1}),
      generateMirrorApiJson({id: 2, jobs: [{id: 2, name: 'Last.fm file'}, {id: 3, name: 'Mirror to Koito'}]}),
      generateMirrorApiJson({id: 3, jobs: []}),
    ]
  }
});
