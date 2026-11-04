import React, { type ComponentProps } from "react"
import { Stack, Wrap, HStack, Stat, Tag } from '@chakra-ui/react';
import type { ClientType, SourceType } from "../../core/Atomic";
import { type CountUpStat, CountUpValueText } from "./CountUpStat";
import { capitalize, capitalizeWords } from "../../core/StringUtils";
import { getMusicServiceIcon } from "./icons/ChakraIcons";

export interface ComponentStat {
    count: number,
    types?: (SourceType | ClientType)[]
}

export interface PublicDashboardData {
    scrobbles?: number
    plays?: number
    listened?: number
    sources?: ComponentStat
    clients?: ComponentStat
}

export const PublicDashboard = (props: PublicDashboardData) => {
    return (
        <Stack>
            <CountStats {...props} />
            <ComponentStats {...props} />
        </Stack>
    )
}

export const CountStats = (props: Pick<PublicDashboardData, 'scrobbles' | 'plays' | 'listened'>) => {
    const statProps: ComponentProps<typeof CountUpStat>[] = [];
    if (props.plays !== undefined) {
        statProps.push({ value: props.plays, label: 'Plays' });
    }
    if (props.scrobbles !== undefined) {
        statProps.push({ value: props.scrobbles, label: 'Scrobbles' });
    }
    if (props.listened !== undefined) {
        statProps.push({ value: props.listened / 60, label: 'Listened For', helpText: 'Minutes' });
    }
    if (statProps.length === 0) {
        return undefined;
    }
    return <Wrap gap="10" justify="space-evenly">{statProps.map((x, i) => (
        // Stat.Root has flex: 1 by default, which would stretch a wrapped item to the full row and left align it
        <Stat.Root key={i} size="lg" flex="none">
            <Stat.Label textStyle="3xl">{x.label}</Stat.Label>
            <CountUpValueText textStyle="6xl" {...x} />
            {x.helpText !== undefined && <Stat.HelpText textStyle="2xl">{x.helpText}</Stat.HelpText>}
        </Stat.Root>
    ))}</Wrap>
}

export const ComponentStats = (props: Pick<PublicDashboardData, 'sources' | 'clients'>) => {
    const componentStats: React.JSX.Element[] = [];
    for (const [key, val] of Object.entries(props)) {
        if (key !== 'sources' && key !== 'clients') {
            continue;
        }
        componentStats.push(<HStack key={key}>
            <Stat.Root>
                <Stat.Label textStyle="3xl">{capitalize(key)}</Stat.Label>
                <CountUpValueText delay={componentStats.length * 300} textStyle="6xl" value={val.count} />
            </Stat.Root>
            {/* <CountUpStat textStyle="4xl" value={val.count} label={capitalize(key)} delay={componentStats.length * 300} /> */}
            {val.types !== undefined ? (<Wrap>

                {val.types.map((x) => {
                    let iconElement: React.JSX.Element | undefined = undefined;
                    const Icon = getMusicServiceIcon(x);
                    if (Icon !== undefined) {
                        iconElement = <Tag.StartElement><Icon /></Tag.StartElement>
                    }
                    return (<Tag.Root size="lg" key={x}>
                        {iconElement}
                        <Tag.Label>{capitalizeWords(x)}</Tag.Label>
                    </Tag.Root>)
                })}
            </Wrap>) : undefined}
        </HStack>);
    }
    if (componentStats.length === 0) {
        return undefined;
    }
    return <Wrap gap="10" justify="space-evenly">{componentStats}</Wrap>
}