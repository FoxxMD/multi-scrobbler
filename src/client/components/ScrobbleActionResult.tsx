import React, { Fragment } from "react"
import { Timeline, Icon, Span, Stack, Alert, List } from '@chakra-ui/react';
import { ErrorAlert } from "./ErrorAlert";
import { HiOutlineCloudUpload, HiOutlineCloudDownload } from "react-icons/hi";
import { ChakraCodeBlockShort } from "./CodeBlock";
import { capitalizeWords } from "../../core/StringUtils";
import { MSCollapsible, type MSCollapsibleExternalProps } from "./MSCollapsible";
import { TimelineErrorIcon } from "./timeline/TimelineIcon";
import type {ScrobbleResult} from "../../core/Atomic";
import { TimelineItemSummaryText } from "../utils/ComponentUtils";
import { Muted } from "./Typography";

export interface ScrobbleActionResultProps extends MSCollapsibleExternalProps {
    result: ScrobbleResult<string>,
    scrobbler?: string,
    componentName?: string
}

export const ScrobbleActionResult = (props: ScrobbleActionResultProps) => {

    const {
        result: {
            error,
            warnings = [],
            payload,
            response,
        } = {},
        collapsibleOpen,
        componentName = 'downstream service'
    } = props;

    let responseSuffix: React.JSX.Element,
        warningsElm: React.JSX.Element,
        errorElm: React.JSX.Element | null;

    if (warnings.length > 0) {
        warningsElm = <Span color="orange.solid">warnings</Span>
    }
    if (error !== undefined) {
        errorElm = <Span color="red.solid">an error</Span>
    }

    if (warningsElm !== undefined && errorElm !== undefined) {
        responseSuffix = <Fragment><Muted>with</Muted> {warningsElm} and {errorElm}</Fragment>;
    } else if (warningsElm !== undefined || errorElm !== undefined) {
        responseSuffix = <Fragment><Muted>with</Muted> {warningsElm ?? errorElm}</Fragment>;
    }

    //{capitalizeWords(componentName)}
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
                        <MSCollapsible indicator={<TimelineItemSummaryText><Span color="fg.muted">Sent</Span> Scrobble Payload <Span color="fg.muted"> to {capitalizeWords(componentName)}</Span></TimelineItemSummaryText>}
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
                                indicator={<TimelineItemSummaryText><Span color="fg.muted">Received</Span> Response <Span color="fg.muted"> from {capitalizeWords(componentName)}</Span>{responseSuffix !== undefined ? <Span> {responseSuffix}</Span> : null}</TimelineItemSummaryText>}
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