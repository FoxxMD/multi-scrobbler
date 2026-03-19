import { ComponentProps, Fragment } from "react"
import { Timeline, Icon, Span, Stack, Heading, Tabs, DataList, Alert, List } from '@chakra-ui/react';
import { JsonPlayObject, LifecycleStep, PlayLifecycle, PlayMatchResult, ScrobbleResult } from "../../core/Atomic";
import { PlayData } from "./PlayData";
import { ErrorAlert } from "./ErrorAlert";
import { BiWrench } from "react-icons/bi";
import { IoMusicalNoteOutline } from "react-icons/io5";
import { HiOutlineCloudUpload, HiOutlineCloudDownload } from "react-icons/hi";
import { LuCheck, LuCircleX, LuX } from "react-icons/lu";
import { ChakraCodeBlockShort, ChakraPlainBlock, ChakraPlainBlockShort } from "./CodeBlock";
import { JsonDiffPatch } from "./JsonDiff";
import { formatNumber, jdiff } from "../../core/DataUtils";
import { capitalize } from "../../core/StringUtils";
import { MSCollapsible, MSCollapsibleExternalProps } from "./MSCollapsible";

export interface ScrobbleActionResultProps extends MSCollapsibleExternalProps {
    result: ScrobbleResult,
    scrobbler?: string,
}

export const ScrobbleActionResult = (props: ScrobbleActionResultProps) => {

    const {
        result: {
            error,
            warnings = [],
            payload,
            response,
            mergedScrobble
        } = {},
        scrobbler,
        collapsibleOpen
    } = props;

    return (
        <Timeline.Root size="lg" variant="subtle" maxW="lg" css={{ "--timeline-separator-display": 'block' }}>
            <Timeline.Item>
                <Timeline.Connector>
                    <Timeline.Separator />
                    <Timeline.Indicator>
                        <Icon fontSize="xs">
                            <HiOutlineCloudUpload />
                        </Icon>
                    </Timeline.Indicator>
                </Timeline.Connector>
                <Timeline.Content>
                    <Timeline.Title>
                        <Span color="fg.muted">Sent</Span> Scrobble Payload{scrobbler !== undefined ? <Fragment><Span color="fg.muted">to</Span> {capitalize(scrobbler)}</Fragment> : null}
                    </Timeline.Title>
                    <MSCollapsible indicator="Show Payload" defaultOpen={collapsibleOpen}>
                        <ChakraCodeBlockShort code={payload} language="json" maxLines={20} />
                    </MSCollapsible>
                </Timeline.Content>
            </Timeline.Item>
            {response !== undefined ? (
                <Timeline.Item>
                    <Timeline.Connector>
                        <Timeline.Separator />
                        <Timeline.Indicator>
                            <Icon fontSize="xs">
                                <HiOutlineCloudDownload />
                            </Icon>
                        </Timeline.Indicator>
                    </Timeline.Connector>
                    <Timeline.Content>
                        <Timeline.Title>
                            <Span color="fg.muted">Received</Span> Response{scrobbler !== undefined ? <Fragment><Span color="fg.muted">from</Span> {capitalize(scrobbler)}</Fragment> : null}{warnings.length > 0 ? <Span color="orange.solid"> with warnings</Span> : null}
                        </Timeline.Title>
                        <MSCollapsible indicator="Show Response" defaultOpen={collapsibleOpen}>
                        <ChakraCodeBlockShort code={response} language="json" maxLines={20} />
                        {warnings.length > 0 ? (
                            <Alert.Root status="warning">
                                <Alert.Indicator />
                                <Alert.Content>
                                    <Alert.Title>Warnings in Response</Alert.Title>
                                    <Alert.Description>
                                        <List.Root>
                                            {warnings.map((x) => <List.Item>{x}</List.Item>)}
                                        </List.Root>
                                    </Alert.Description>
                                </Alert.Content>
                            </Alert.Root>
                        ) : null}
                        </MSCollapsible>
                    </Timeline.Content>
                </Timeline.Item>
            ) : null}
        </Timeline.Root>
    )
}