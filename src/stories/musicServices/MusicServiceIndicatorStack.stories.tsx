import preview from "../../../.storybook/preview.js";
import React from 'react';
import { Container } from '@chakra-ui/react';

import { Provider } from "../../client/components/Provider.js";
import { MusicServiceIndicatorStack } from "../../client/components/musicServices/MusicServiceIndicators.js";
import { generateMusicService } from "../../core/tests/utils/apiFixtures.js";

const meta = preview.type<{ args: React.ComponentProps<typeof MusicServiceIndicatorStack> }>().meta({
    title: 'Music Service/Indicator Stack',
    component: MusicServiceIndicatorStack,
    parameters: {
        layout: 'padded',
    },
    decorators: [
        (Story) => (<Provider><Container maxWidth="8xl" pt="10"><Story /></Container></Provider>),
    ],
    args: {
        services: [
            generateMusicService({name: 'musicbrainz'}),
            generateMusicService({name: 'spotify'}),
            generateMusicService({name: 'isrc'}),
            generateMusicService({name: 'musicbrainz'}),
        ],
    },
});

export const Default = meta.story({});

export const Overflow = meta.story({
    args: {
        max: 2,
        count: 2401,
    }
});
