import { Heading, Box, Icon, Span, Stack, Text, Timeline, Tabs} from '@chakra-ui/react';
import React, { Fragment, useMemo } from "react";
import { BsExclamationTriangle, BsSkipForward, BsStoplights } from "react-icons/bs";
import { MdMusicNote } from "react-icons/md";
import type {ErrorLike, JsonPlayObject, LifecycleStep} from "../../core/Atomic";
import { patchObject } from "../../core/DataUtils";
import { isErrorIsh } from "../../core/ErrorUtils";
import { timelineIconProps, timelineTextFormatting } from "../utils/ComponentUtils";
import { ChakraCodeBlockShort } from "./CodeBlock";
import { ErrorAlert } from "./ErrorAlert";
import { MSCollapsible, type MSCollapsibleExternalProps } from "./MSCollapsible";
import { PlayData } from "./play/PlayData";
import { Muted } from "./Typography";
import { JsonDiffPatch } from "./diffs/JsonDiff";
import type { Changeset } from 'json-diff-ts';

export interface LifeycleStepsTimelineProps extends MSCollapsibleExternalProps {
    steps: LifecycleStep[]
    original: JsonPlayObject
}

export interface DiffElementData<T> {
    input?: object
    original: T
    patch?: Changeset
    patchFailed?: boolean
    error?: ErrorLike
    indexKey?: string | number
}

export interface DiffElementResult<T> {
    input?: React.JSX.Element,
    diff?: React.JSX.Element,
    patch?: React.JSX.Element,
    identical?: boolean,
    final?: T
    error?: React.JSX.Element
    indexKey?: string}

export const diffElement = <T extends object,>(data: DiffElementData<T>): DiffElementResult<T> => {

    const {
        input,
        original,
        patch,
        patchFailed: patchFailedInitial,
        error,
        indexKey = ''
    } = data;

    const inputCode = input !== undefined ? <ChakraCodeBlockShort key={`input${indexKey}`} title="Update Data" code={input} /> : undefined;
    const patchCode = patch !== undefined ? <ChakraCodeBlockShort key={`patch${indexKey}`} title="Diff Patch" code={patch} /> : undefined;

    const baseResult: Partial<DiffElementResult<T>> = {
        input: inputCode,
        patch: patchCode
    }

    if (patch === undefined) {
        if (error !== undefined) {
            return { ...baseResult }
        }
        return { ...baseResult, final: original, identical: true, patch: <Text>Data was identical after patching.</Text> }
    }

    if (patchFailedInitial) {
        return { ...baseResult, patch: undefined, final: original }
    }

    try {
        const current = structuredClone(original);
        const right: T = patchObject(structuredClone(current), patch);
        const diff = <JsonDiffPatch key={`diff${indexKey}`} left={current} right={right} />;
        return { ...baseResult, diff, final: right };
    } catch (e) {
        const error = <ErrorAlert key={`error${indexKey}`} error={isErrorIsh(e) ? e : new Error(String(e))} codeContent={<Stack gapY="2">{inputCode}{patchCode}</Stack>} />;
        return { ...baseResult, final: original, error };
    }
}

export const diffElements = (original: JsonPlayObject, steps: LifecycleStep[]): [(React.JSX.Element | null)[], JsonPlayObject?] => {

    const currentPlay: JsonPlayObject = structuredClone(original); // JSON.parse(JSON.stringify(original));
    let patchFailed = false;

    const diffElements: (React.JSX.Element | null)[] = [];
    let index = 0;

    for (const step of steps) {
        index++;
        const {
            patch,
            error
        } = step;

        const diffElementResults = diffElement({original: structuredClone(currentPlay.data), patch, patchFailed, error, indexKey: index});

        const {
            patch: patchElm,
            diff,
            error: errorElm,
            final,
        } = diffElementResults

        if(errorElm !== undefined) {
            patchFailed = true;
            diffElements.push(errorElm);
        } else if(diff !== undefined) {
            diffElements.push(diff);
            if(final !== undefined) {
                currentPlay.data = final;
            }
        } else if (patchElm !== undefined) {
            diffElements.push(patchElm);
        } else {
            diffElements.push(null);
        }
    }

    return [diffElements, !patchFailed ? currentPlay : undefined]
}

export const TransformSteps = (props: LifeycleStepsTimelineProps) => {
    const {
        steps,
        original,
        collapsibleOpen
    } = props;

    const [diffs, finalPlay] = useMemo(() => diffElements(original, steps), [steps, original]);

    return (
        <Timeline.Root  variant="subtle" size="lg" css={{ "--timeline-separator-display": 'block' }}>
            {steps.map((x, index) => {
                const {
                    patch,
                    inputs,
                    source,
                    error,
                    flowKnownState,
                    flowReason,
                    flowResult,
                    stageName,
                    stageType,
                    hook
                } = x;

                let timelineIcon: React.JSX.Element,
                iconProps: Record<string, any> = {},
                summary: React.JSX.Element,
                alertStatus: "error" | "info" | "warning" | "success" | "neutral" | undefined = undefined;
                if(error === undefined && error !== null) {
                    timelineIcon = <BsStoplights/>;
                    iconProps = flowResult === 'continue' ? {color: "green.focusRing"} : {color: "red.focusRing"};
                    summary = <Fragment><Muted>was</Muted> completed{flowResult === 'stop' ? <Fragment><Muted> and </Muted> stopped <Muted> due to onSuccess condition</Muted></Fragment> : null}</Fragment>;
                    if(patch === undefined) {
                        summary = <Fragment>{summary}<Muted> with</Muted> no change <Muted>to Play</Muted></Fragment>;
                    }
                } else {
                    if(flowKnownState === 'skip') {
                        timelineIcon = <BsSkipForward/>;
                        summary = <Fragment><Muted>was</Muted> skipped.</Fragment>;
                        alertStatus = 'info';
                    } else if(flowKnownState === 'prereq') {
                        timelineIcon = <BsExclamationTriangle/>;
                        iconProps = {color: "orange.focusRing"};
                        summary = <Fragment><Muted>was</Muted> not completed <Muted>due to</Muted> prerequisite failure.</Fragment>;
                        alertStatus = "warning";
                    } else {
                        if(flowResult === 'continue') {
                            timelineIcon = <BsStoplights/>;
                            iconProps = {color: "orange.focusRing"};
                            summary = <Fragment>encountered an error <Muted>but</Muted> will continue <Muted>due to onFailure condition.</Muted></Fragment>;
                        } else {
                            timelineIcon = <BsExclamationTriangle/>;
                            iconProps = {color: "red.focusRing"};
                            summary = <Fragment>encountered an error.</Fragment>
                        }
                    }
                }

                let inputsElm: React.JSX.Element | undefined = undefined;
                if(inputs !== undefined && inputs.length > 0) {
                    inputsElm = (
                        <Stack gap="1">
                            {inputs.map((y, inputsIndex) => <ChakraCodeBlockShort key={`inputs-${inputsIndex}`} code={y.input} title={y.type} />)}
                        </Stack>
                    );
                }
                let diffElm: React.JSX.Element | undefined = undefined;
                if(diffs[index] !== null) {
                    diffElm = <MSCollapsible collapsedHeight="200px" title="Diff" overlay>{diffs[index]}</MSCollapsible>
                }
                
                return <Timeline.Item key={index}>
                    <Timeline.Connector>
                        <Timeline.Separator />
                        <Timeline.Indicator>
                            <Icon {...timelineIconProps} {...iconProps}>
                                {timelineIcon}
                            </Icon>
                        </Timeline.Indicator>
                    </Timeline.Connector>
                    <Timeline.Content>
                        <Timeline.Title>
                            <MSCollapsible
                                indicator={<Span {...timelineTextFormatting}><Span color="fg.muted">Stage </Span>{stageType}-{stageName}<Span color="fg.muted"> in Hook </Span>{hook} <Span color="fg.muted">from</Span> {source} {summary}</Span>}
                                defaultOpen={collapsibleOpen}
                                disableUntil="md"
                                unmountOnExit
                                timeline>
                                {error !== undefined && error !== null ? <Box mb="3"><ErrorAlert status={alertStatus} error={error}/></Box> : null}
                            <Tabs.Root size="sm" variant="outline" defaultValue="Inputs">
                                <Tabs.List>
                                    <Tabs.Trigger value="Inputs">Inputs</Tabs.Trigger>
                                    <Tabs.Trigger value="Diff">Diff</Tabs.Trigger>
                                </Tabs.List>
                                <Tabs.Content value="Inputs">
                                    {inputsElm ?? <Text>No Inputs recorded</Text>}
                                </Tabs.Content>
                                <Tabs.Content value="Diff">
                                    {diffElm ?? <Text>No diff recorded or Play was identical after transform</Text>}
                                </Tabs.Content>
                            </Tabs.Root>
                            </MSCollapsible>
                        </Timeline.Title>
                    </Timeline.Content>
                </Timeline.Item>
            })}
            {finalPlay !== undefined ? (
                <Timeline.Item key="finalPlay" hideBelow="sm">
                    <Timeline.Connector>
                        <Timeline.Separator />
                        <Timeline.Indicator>
                            <Icon {...timelineIconProps}>
                                <MdMusicNote />
                            </Icon>
                        </Timeline.Indicator>
                    </Timeline.Connector>
                    <Timeline.Content>
                        <Timeline.Title {...timelineTextFormatting}>
                            Final Play <Span color="fg.muted">after all Transforms</Span>
                        </Timeline.Title>
                        <PlayData play={original} final={finalPlay} dates={false} compareDefault="Final" />
                    </Timeline.Content>
                </Timeline.Item>
            ) : null}
        </Timeline.Root>
    )
}