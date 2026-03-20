import { ComponentProps, Fragment } from "react"
import { Timeline, Icon, Span, Stack, Heading, Tabs, DataList, List } from '@chakra-ui/react';
import { JsonPlayObject, LifecycleStep, PlayMatchResult } from "../../core/Atomic";
import { PlayData } from "./PlayData";
import { ErrorAlert } from "./ErrorAlert";
import { BiWrench } from "react-icons/bi";
import { IoMusicalNoteOutline } from "react-icons/io5";
import { LuCheck, LuCircleX, LuX } from "react-icons/lu";
import { ChakraCodeBlockShort, ChakraPlainBlock, ChakraPlainBlockShort } from "./CodeBlock";
import { JsonDiffPatch } from "./JsonDiff";
import { formatNumber, jdiff } from "../../core/DataUtils";

export interface ScrobbleMatchResultProps {
    match: PlayMatchResult
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
                                {match.breakdowns.map((x) => {
                                    if (x.includes('Time Detail')) {
                                        const sub = x.substring(15).split('|');
                                        return (
                                            <List.Root ps="5">
                                                {sub.map((y) => <List.Item>{y}</List.Item>)}
                                            </List.Root>

                                        )
                                    }
                                    return <List.Item>{x}</List.Item>
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