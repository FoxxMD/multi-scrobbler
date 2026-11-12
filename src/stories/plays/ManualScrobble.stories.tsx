import preview from "../../../.storybook/preview.js";
import React from 'react';

import { ManualScrobbleDialog } from "../../client/components/play/ManualScrobble";
import { Provider } from "../../client/components/Provider.js";
import { Container } from '@chakra-ui/react';
import { http, HttpResponse, delay } from 'msw';

const clients = [
  { id: 1, uid: 'client-1', name: 'My Maloja', type: 'maloja', mode: 'client' },
  { id: 2, uid: 'client-2', name: 'My Last.fm', type: 'lastfm', mode: 'client' },
];

const meta = preview.type<{args: React.ComponentProps<typeof ManualScrobbleDialog>}>().meta({
  title: 'Plays/Manual Scrobble',
  component: ManualScrobbleDialog,
  parameters: {
    layout: 'padded',
    msw: {
      handlers: [
        // track search is mocked in the PlayEdit stories
        http.get('/api/components', () => HttpResponse.json(clients)),
        http.post('/api/scrobble', async () => {
          await delay();
          return HttpResponse.json({ queued: clients.map(x => x.uid) }, { status: 202 });
        }),
      ],
    },
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (<Provider><Container maxWidth="6xl"><Story/></Container></Provider>),
  ],
  args: {
    open: true,
    setOpen: () => undefined,
  },
});

export const ManualScrobbleStory = meta.story({
  render: (args) => {
    const [open, setOpen] = React.useState(args.open);
    return <ManualScrobbleDialog open={open} setOpen={setOpen} />;
  }
});
