import { Icon, Tabs, DataList, List } from '@chakra-ui/react';
import type {PlayMatchResult} from "../../core/Atomic";
import { PlayData } from "./PlayData";
import { LuCheck, LuX } from "react-icons/lu";
import { formatNumber } from "../../core/DataUtils";

export interface ScrobbleMatchResultProps {
    match: PlayMatchResult<string>
}

export const ScrobbleMatchResult = (props: ScrobbleMatchResultProps) => {

    const {
        match: {
            closestMatchedPlay
        } = {},
        match
    } = props;

    return (
        <Tabs.Root defaultValue="result" lazyMount unmountOnExit>
            <Tabs.List>
                <Tabs.Trigger value="result">Results</Tabs.Trigger>
                <Tabs.Trigger value="closest">Closest Match</Tabs.Trigger>
            </Tabs.List>
            <Tabs.Content value="result">
                <DataList.Root orientation="horizontal">
                    <DataList.Item>
                        <DataList.ItemLabel flexShrink="1">Matched?</DataList.ItemLabel>
                        <DataList.ItemValue><Icon fontSize="2xl">
                            {match.match ? <LuCheck /> : <LuX />}
                        </Icon></DataList.ItemValue>
                    </DataList.Item>
                    <DataList.Item>
                        <DataList.ItemLabel flexShrink="1">Score</DataList.ItemLabel>
                        <DataList.ItemValue>{formatNumber(match.score)}</DataList.ItemValue>
                    </DataList.Item>
                    <DataList.Item>
                        <DataList.ItemLabel flexShrink="1">Reason</DataList.ItemLabel>
                        <DataList.ItemValue>{match.reason}</DataList.ItemValue>
                    </DataList.Item>
                    <DataList.Item>
                        <DataList.ItemLabel flexShrink="1">Breakdown</DataList.ItemLabel>
                        <DataList.ItemValue>
                            <List.Root>
                                {match.breakdowns.map((x, index) => {
                                    if (x !== null && x !== undefined && x.includes('Time Detail')) {
                                        const sub = x.substring(15).split('|');
                                        return (
                                            <List.Root ps="5">
                                                {sub.map((y, index) => <List.Item key={index}>{y}</List.Item>)}
                                            </List.Root>

                                        )
                                    }
                                    return <List.Item key={index}>{x}</List.Item>
                                })}
                            </List.Root>
                        </DataList.ItemValue>
                    </DataList.Item>
                </DataList.Root>
            </Tabs.Content>
            <Tabs.Content value="closest">
                <PlayData play={closestMatchedPlay} />
            </Tabs.Content>
        </Tabs.Root>
    )
}