import React, { type ComponentProps } from "react"
import { Stack, Wrap, HStack, Stat, Tag } from '@chakra-ui/react';
import type { ClientType, SourceType } from "../../core/Atomic";
import { type CountUpStat, CountUpValueText } from "./CountUpStat";
import { capitalize, capitalizeWords } from "../../core/StringUtils";
import { getMusicServiceIcon } from "./icons/ChakraIcons";
import { AvatarStack, type AvatarStackItem } from "./AvatarStack";

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
        <Stack gap="10">
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
            {x.helpText !== undefined && <Stat.HelpText textStyle="lg">{x.helpText}</Stat.HelpText>}
        </Stat.Root>
    ))}</Wrap>
}

export const ComponentStats = (props: Pick<PublicDashboardData, 'sources' | 'clients'>) => {
    const componentStats: React.JSX.Element[] = [];
    for (const [key, val] of Object.entries(props)) {
        if (key !== 'sources' && key !== 'clients') {
            continue;
        }
        let avatarItems: AvatarStackItem[] = [];
        if(val.types !== undefined) {
            avatarItems = val.types.map((x) => {
                        const Icon = getMusicServiceIcon(x);
                        if (Icon !== undefined) {
                            return {
                                name: capitalizeWords(x),
                                icon: Icon
                            }
                        }
                        return {
                           name: capitalizeWords(x)
                        }
                    })
        }
        componentStats.push(<HStack key={key}>
            <Stat.Root>
                <Stat.Label textStyle="3xl">{capitalize(key)}</Stat.Label>
                <HStack>
                <CountUpValueText delay={componentStats.length * 300} textStyle="6xl" value={val.count} />
                {avatarItems.length > 0 ? <AvatarStack spread="0.5" items={avatarItems}/> : undefined}
                </HStack>
            </Stat.Root>
        </HStack>);
    }
    if (componentStats.length === 0) {
        return undefined;
    }
    return <Wrap gap="10" justify="space-evenly">{componentStats}</Wrap>
}