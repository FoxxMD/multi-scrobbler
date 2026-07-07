import React, { Fragment } from "react"
import { Timeline, Icon, Span, Stack, Alert, List, HStack } from '@chakra-ui/react';
import { ErrorAlert } from "./ErrorAlert";
import { HiOutlineCloudUpload, HiOutlineCloudDownload } from "react-icons/hi";
import { ChakraCodeBlockShort } from "./CodeBlock";
import { capitalize } from "../../core/StringUtils";
import { MSCollapsible, MSCollapsibleExternalProps } from "./MSCollapsible";
import { TimelineErrorIcon } from "./timeline/TimelineIcon";
import { ScrobbleResult } from "../../core/Atomic";

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
        } = {},
        scrobbler,
        collapsibleOpen
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
        responseSuffix = <Fragment>with {warningsElm} and {errorElm}</Fragment>;
    } else if (warningsElm !== undefined || errorElm !== undefined) {
        responseSuffix = <Fragment>with {warningsElm ?? errorElm}</Fragment>;
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
                                indicator={<HStack gap="1"><Span color="fg.muted">Received</Span> Response{scrobbler !== undefined ? <Fragment><Span color="fg.muted">from</Span> {capitalize(scrobbler)}</Fragment> : null}{responseSuffix !== undefined ? <Span> {responseSuffix}</Span> : null}</HStack>}
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