import preview from "../../../.storybook/preview.js";
import React from 'react';
import { Container } from '@chakra-ui/react';

import { PublicDashboard } from "../../client/components/PublicDashboard.js";
import { Provider } from "../../client/components/Provider.js";

const meta = preview.type<{ args: React.ComponentProps<typeof PublicDashboard> }>().meta({
    title: 'Misc Components/Public Dashboard',
    component: PublicDashboard,
    parameters: {
        layout: 'padded',
    },
    decorators: [
        (Story) => (<Provider><Container maxWidth="8xl"><Story /></Container></Provider>),
    ],
});

// key forces a remount so the count up animation replays when args change in controls
export const Default = meta.story({
    args: {
        plays: 18342,
        scrobbles: 17906,
        // seconds
        listened: 4_215_380,
        sources: {count: 4, types: ['spotify', 'jellyfin', 'plex', 'listenbrainz']},
        clients: {count: 2, types: ['lastfm', 'maloja']},
    },
    render: function Render(args) {
        return <PublicDashboard key={JSON.stringify(args)} {...args} />;
    }
});
