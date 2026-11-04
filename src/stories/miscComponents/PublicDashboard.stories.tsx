import preview from "../../../.storybook/preview.js";
import React from 'react';
import { Container } from '@chakra-ui/react';

import { PublicDashboard } from "../../client/components/PublicDashboard.js";
import { Provider } from "../../client/components/Provider.js";
import { faker } from "@faker-js/faker";
import { generateArray } from "../../core/DataUtils.js";
import { clientTypes, sourceTypes } from "../../core/Atomic.js";

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

const sourceTypesRandom = generateArray(faker.number.int({min: 1, max: 10}), () => faker.helpers.arrayElement(sourceTypes));
const sourceCount = sourceTypesRandom.length;
const sTypes = Array.from(new Set(sourceTypesRandom));

const clientTypesRandom = generateArray(faker.number.int({min: 1, max: 5}), () => faker.helpers.arrayElement(clientTypes));
const clientCount = clientTypesRandom.length;
const cTypes = Array.from(new Set(clientTypesRandom));

// key forces a remount so the count up animation replays when args change in controls
export const Default = meta.story({
    args: {
        plays: faker.number.int({min: 14_000, max: 2_000_000}),
        scrobbles: faker.number.int({min: 14_000, max: 2_000_000}),
        // seconds
        listened: faker.number.int({min: 4_215_380, max: 999_999_999}),
        sources: {count: sourceCount, types: sTypes},
        clients: {count: clientCount, types: cTypes},
    },
    render: function Render(args) {
        return <PublicDashboard key={JSON.stringify(args)} {...args} />;
    }
});
