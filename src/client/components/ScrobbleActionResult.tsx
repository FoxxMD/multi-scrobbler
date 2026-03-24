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
import { TimelineErrorIcon } from "./timeline/TimelineIcon";

export interface ScrobbleActionResultProps extends MSCollapsibleExternalProps {
    result: ScrobbleResult<string>,
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

    let responseSuffix: JSX.Element,
        warningsElm: JSX.Element,
        errorElm: JSX.Element | null;

    if (warnings.length > 0) {
        warningsElm = <Span color="orange.solid">warnings</Span>
    }
    if (error !== undefined) {
        errorElm = <Span color="red.solid">an error</Span>
    }

    if (warningsElm !== undefined && errorElm !== undefined) {
        responseSuffix = <Fragment> with {warningsElm} and {errorElm}</Fragment>;
    } else if (warningsElm !== undefined || errorElm !== undefined) {
        responseSuffix = <Fragment> with {warningsElm ?? errorElm}</Fragment>;
    }

    return (
        <Timeline.Root variant="subtle" css={{ "--timeline-separator-display": 'block' }}>
            <Timeline.Item>
                <Timeline.Connector>
                    <Timeline.Separator />
                    <Timeline.Indicator>
                        <Icon fontSize="lg">
                            <HiOutlineCloudUpload />
                        </Icon>
                    </Timeline.Indicator>
                </Timeline.Connector>
                <Timeline.Content>
                    <Timeline.Title>
                        <MSCollapsible indicator={<Fragment><Span color="fg.muted">Sent</Span> Scrobble Payload{scrobbler !== undefined ? <Fragment><Span color="fg.muted">to</Span> {capitalize(scrobbler)}</Fragment> : null}</Fragment>}
                            defaultOpen={collapsibleOpen}
                            disableUntil="md"
                            timeline>
                            <ChakraCodeBlockShort code={payload} language="json" maxLines={20} />
                        </MSCollapsible>
                    </Timeline.Title>
                </Timeline.Content>
            </Timeline.Item>
            {response !== undefined || error !== undefined ? (
                <Timeline.Item>
                    <Timeline.Connector>
                        <Timeline.Separator />
                        <Timeline.Indicator>
                            {error !== undefined ? <TimelineErrorIcon /> : (
                                <Icon fontSize="lg">
                                    <HiOutlineCloudDownload />
                                </Icon>
                            )}
                        </Timeline.Indicator>
                    </Timeline.Connector>
                    <Timeline.Content>
                        <Timeline.Title>
                            <MSCollapsible
                                indicator={<Fragment><Span color="fg.muted">Received</Span> Response{scrobbler !== undefined ? <Fragment><Span color="fg.muted">from</Span> {capitalize(scrobbler)}</Fragment> : null}{responseSuffix !== undefined ? <Span> {responseSuffix}</Span> : null}</Fragment>}
                                timeline
                                defaultOpen={collapsibleOpen}
                                disableUntil="md">
                                <Stack gap="4">
                                    {error !== undefined ? <ErrorAlert error={error} /> : null}
                                    {response !== undefined ? <ChakraCodeBlockShort code={response} language="json" maxLines={20} /> : null}
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
                                </Stack>
                            </MSCollapsible>
                        </Timeline.Title>
                    </Timeline.Content>
                </Timeline.Item>
            ) : null}
        </Timeline.Root>
    )
}