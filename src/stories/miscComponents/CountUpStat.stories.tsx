import preview from "../../../.storybook/preview.js";
import React, { useState } from 'react';
import { Box, Button, Container, HStack, Stat, Text, VStack } from '@chakra-ui/react';

import { CountUpStat, CountUpValueText } from "../../client/components/CountUpStat.js";
import { Provider } from "../../client/components/Provider.js";

const meta = preview.type<{ args: React.ComponentProps<typeof CountUpStat> }>().meta({
    title: 'Misc Components/Count Up Stat',
    component: CountUpStat,
    parameters: {
        layout: 'padded',
    },
    tags: ['autodocs'],
    decorators: [
        (Story) => (<Provider><Container maxWidth="8xl"><Story /></Container></Provider>),
    ],
    args: {
        label: 'Scrobbles',
        value: 12345,
        duration: 1400,
        delay: 0,
        decimals: 0,
        reduceMotion: false,
    },
});

// key forces a remount so the animation replays when args change in controls
export const Default = meta.story({
    render: function Render(args) {
        return <CountUpStat key={JSON.stringify(args)} {...args} />;
    }
});

export const PrefixSuffixDecimals = meta.story({
    args: {
        label: 'Match Rate',
        value: 98.75,
        decimals: 2,
        suffix: '%',
        helpText: 'Last 30 days',
    },
    render: function Render(args) {
        return <CountUpStat key={JSON.stringify(args)} {...args} />;
    }
});

export const ReducedMotion = meta.story({
    args: {
        reduceMotion: true,
    },
    render: function Render(args) {
        return <CountUpStat key={JSON.stringify(args)} {...args} />;
    }
});

export const Row = meta.story({
    render: function Render(args) {
        return (
            <HStack gap={8} key={JSON.stringify(args)}>
                <CountUpStat {...args} label="Discovered" value={3021} size="lg" />
                <CountUpStat {...args} label="Scrobbled" value={2987} delay={200} size="lg" />
                <CountUpStat {...args} label="Queued" value={34} delay={400} size="lg" />
            </HStack>
        );
    }
});

export const ComposedWithStatParts = meta.story({
    render: function Render(args) {
        return (
            <Stat.Root key={JSON.stringify(args)} size="lg">
                <Stat.Label>Revenue</Stat.Label>
                <HStack>
                    <CountUpValueText value={args.value} duration={args.duration} reduceMotion={args.reduceMotion} prefix="$" decimals={2} />
                    <Stat.UpIndicator />
                </HStack>
                <Stat.HelpText>since last month</Stat.HelpText>
            </Stat.Root>
        );
    }
});

export const ScrollIntoView = meta.story({
    render: function Render(args) {
        return (
            <Box key={JSON.stringify(args)}>
                <Text>Scroll down, counting starts when the stat enters the viewport.</Text>
                <Box height="150vh" />
                <CountUpStat {...args} />
            </Box>
        );
    }
});

// value changes while mounted animate from the current number to the new one
export const ChangingValue = meta.story({
    render: function Render(args) {
        const [value, setValue] = useState(args.value);
        return (
            <VStack align="start" gap={4}>
                <CountUpStat {...args} value={value} />
                <HStack>
                    <Button size="sm" onClick={() => setValue(v => v + Math.ceil(Math.random() * 500))}>Increase</Button>
                    <Button size="sm" onClick={() => setValue(v => Math.max(0, v - Math.ceil(Math.random() * 500)))}>Decrease</Button>
                    <Button size="sm" onClick={() => setValue(Math.round(Math.random() * 100000))}>Random</Button>
                </HStack>
            </VStack>
        );
    }
});
