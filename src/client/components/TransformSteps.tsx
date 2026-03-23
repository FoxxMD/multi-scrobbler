import { ComponentProps, Fragment, useMemo } from "react"
import { Timeline, Icon, Span, Stack, Heading, Box, Text } from '@chakra-ui/react';
import { JsonPlayObject, LifecycleStep } from "../../core/Atomic";
import { PlayData } from "./PlayData";
import { ErrorAlert } from "./ErrorAlert";
import { BiWrench } from "react-icons/bi";
import { BsSkipForward } from "react-icons/bs";
import { LuCheck, LuCircleX } from "react-icons/lu";
import { BsStoplights } from "react-icons/bs";
import { BsExclamationTriangle, BsExclamationOctagon } from "react-icons/bs";
import { FaStop } from "react-icons/fa";
import { MdMusicNote } from "react-icons/md";
import { ChakraCodeBlockShort, ChakraPlainBlockShort } from "./CodeBlock";
import { JsonDiffPatch } from "./JsonDiff";
import { jdiff } from "../../core/DataUtils";
import { MSCollapsible, MSCollapsibleExternalProps } from "./MSCollapsible";
import { Muted } from "./Typography";

export interface LifeycleStepsTimelineProps extends MSCollapsibleExternalProps {
    steps: LifecycleStep[]
    original: JsonPlayObject
}

const diffElements = (original: JsonPlayObject, steps: LifecycleStep[]): [JSX.Element[], JsonPlayObject?] => {

    let currentPlay: JsonPlayObject = JSON.parse(JSON.stringify(original));
    let patchFailed = false;

    const diffElements: JSX.Element[] | null = [];
    let index = 0;

    for (const step of steps) {
        index++;
        const {
            patch,
            error
        } = step;

        if (patch === undefined) {
            if (error !== undefined) {
                diffElements.push(null);
            } else {
                diffElements.push(<Text>Play was identical after Transform.</Text>);
            }
            continue;
        }

        if (patchFailed) {
            diffElements.push(<ChakraCodeBlockShort key={`diffblockfallback-${index}`} title="Diff Patch" code={patch} />);
            continue;
        }
        let left: JsonPlayObject = JSON.parse(JSON.stringify(currentPlay));
        left.data.meta = {
            ...(left.data.meta ?? {}),
            brainz: {
                ...(left.data.meta?.brainz ?? {})
            }
        }
        currentPlay.data.meta = {
            ...(currentPlay.data.meta ?? {}),
            brainz: {
                ...(currentPlay.data.meta?.brainz ?? {})
            }
        }

        try {
            currentPlay = jdiff.patch(currentPlay, patch) as JsonPlayObject;
            diffElements.push(
                <ChakraPlainBlockShort title="Play Diff" key={`diffblock-${index}`} code={left}>
                    <JsonDiffPatch key={`diff-${index}`} left={left} right={JSON.parse(JSON.stringify(currentPlay))} />
                </ChakraPlainBlockShort>
            )
        } catch (e) {
            diffElements.push(<Fragment><ErrorAlert error={e} /><ChakraCodeBlockShort title="Diff Patch" key={`diffblockfallback-${index}`} code={patch} /></Fragment>);
            patchFailed = true;
        }

    }

    return [diffElements, patchFailed !== undefined ? currentPlay : undefined]
}

export const TransformSteps = (props: LifeycleStepsTimelineProps) => {
    const {
        steps,
        original,
        collapsibleOpen
    } = props;

    const [diffs, finalPlay] = useMemo(() => diffElements(original, steps), [steps, original]);

    return (
        <Timeline.Root  variant="subtle" css={{ "--timeline-separator-display": 'block' }}>
            {steps.map((x, index) => {
                const {
                    patch,
                    inputs,
                    source,
                    error,
                    flowKnownState,
                    flowReason,
                    flowResult,
                    name
                } = x;

                let timelineIcon: JSX.Element,
                iconProps: Record<string, any>,
                summary: JSX.Element,
                alertStatus: "error" | "info" | "warning" | "success" | "neutral";
                if(error === undefined) {
                    timelineIcon = <BsStoplights/>;
                    iconProps = flowResult === 'continue' ? {color: "green.focusRing"} : {color: "red.focusRing"};
                    summary = <Fragment><Muted>was</Muted> completed{flowResult === 'stop' ? <Fragment><Muted> and </Muted> stopped <Muted> due to onSuccess condition</Muted></Fragment> : null}</Fragment>;
                    if(patch === undefined) {
                        summary = <Fragment>{summary}<Muted>with</Muted> no change <Muted>to Play</Muted></Fragment>;
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
                
                return <Timeline.Item key={index}>
                    <Timeline.Connector>
                        <Timeline.Separator />
                        <Timeline.Indicator>
                            <Icon fontSize="lg" {...iconProps}>
                                {timelineIcon}
                            </Icon>
                        </Timeline.Indicator>
                    </Timeline.Connector>
                    <Timeline.Content>
                        <Timeline.Title>
                            <Span color="fg.muted">{name} with</Span> {source} {summary}
                        </Timeline.Title>
                        <MSCollapsible indicator="Show Details" defaultOpen={collapsibleOpen} hideBelow="sm">
                            {error !== undefined ? <ErrorAlert status={alertStatus} error={error}/> : null}
                            <Stack gap="2">
                                {diffs[index] !== null ? (
                                    <Fragment>
                                    <Heading size="sm">Diff</Heading>
                                {diffs[index]}</Fragment>
                            ) : null}
                                {inputs !== undefined && inputs.length > 0 ? (
                                    <Fragment>
                                        <Heading size="sm">Inputs</Heading>
                                        <Stack gap="1">
                                            {x.inputs.map((y, inputsIndex) => {
                                                return <ChakraCodeBlockShort key={`inputs-${inputsIndex}`} code={y.input} title={y.type} />
                                            })}
                                        </Stack></Fragment>) : null}
                            </Stack>
                        </MSCollapsible>
                    </Timeline.Content>
                </Timeline.Item>
            })}
            {finalPlay !== undefined ? (
                <Timeline.Item key="finalPlay" hideBelow="sm">
                    <Timeline.Connector>
                        <Timeline.Separator />
                        <Timeline.Indicator>
                            <Icon fontSize="lg">
                                <MdMusicNote />
                            </Icon>
                        </Timeline.Indicator>
                    </Timeline.Connector>
                    <Timeline.Content>
                        <Timeline.Title>
                            Final Play<Span color="fg.muted">after all Transforms</Span>
                        </Timeline.Title>
                        <PlayData play={original} final={finalPlay} dates={false} compareDefault="Final" />
                    </Timeline.Content>
                </Timeline.Item>
            ) : null}
        </Timeline.Root>
    )
}