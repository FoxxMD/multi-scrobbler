import preview from "../../../.storybook/preview.js";
import React from 'react';
import { Container } from '@chakra-ui/react';

import { AvatarStack } from "../../client/components/AvatarStack.js";
import { Provider } from "../../client/components/Provider.js";
import { getMusicServiceChakraIcon, getMusicServiceIcon } from "../../client/components/icons/ChakraIcons.js";

const meta = preview.type<{ args: React.ComponentProps<typeof AvatarStack> }>().meta({
    title: 'Misc Components/Avatar Stack',
    component: AvatarStack,
    parameters: {
        layout: 'padded',
    },
    decorators: [
        (Story) => (<Provider><Container maxWidth="8xl" pt="10"><Story /></Container></Provider>),
    ],
    args: {
        size: 'lg',
        max: 5,
        items: [
            {name: 'Spotify', icon: getMusicServiceIcon('spotify'), colorPalette: 'green'},
            {name: 'Jellyfin', icon: getMusicServiceChakraIcon('jellyfin'), colorPalette: 'purple'},
            {name: 'Listenbrainz', icon: getMusicServiceIcon('listenbrainz'), colorPalette: 'yellow'},
            {name: 'Plex', icon: getMusicServiceIcon('plex'), colorPalette: 'orange'},
            // no icon available, falls back to initials
            {name: 'Maloja', icon: getMusicServiceIcon('maloja'), colorPalette: 'blue'},
            {name: 'Last FM', colorPalette: 'red'},
            {name: 'Subsonic'},
        ],
    },
});

export const Default = meta.story({});

export const LargeOverflow = meta.story({
    args: {
        max: 3,
        count: 2401,
    }
});
