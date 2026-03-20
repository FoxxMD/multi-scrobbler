import { ComponentProps, Fragment } from "react"
import { Timeline, Icon, Span, Stack, Heading, Box, Text } from '@chakra-ui/react';
import { JsonPlayObject, LifecycleStep } from "../../core/Atomic";
import { PlayData } from "./PlayData";
import { ErrorAlert } from "./ErrorAlert";
import { BiWrench } from "react-icons/bi";
import { MdMusicNote } from "react-icons/md";
import { ChakraCodeBlockShort, ChakraPlainBlockShort } from "./CodeBlock";
import { JsonDiffPatch } from "./JsonDiff";
import { jdiff } from "../../core/DataUtils";
import { MSCollapsible, MSCollapsibleExternalProps } from "./MSCollapsible";

export interface LifeycleStepsTimelineProps extends MSCollapsibleExternalProps {
    steps: LifecycleStep[]
    original: JsonPlayObject
}

export const TransformSteps = (props: LifeycleStepsTimelineProps) => {
    const {
        steps,
        original,
        collapsibleOpen
    } = props;

    let currentPlay: JsonPlayObject = JSON.parse(JSON.stringify(original)),
    patchFailed = false;

    return (
        <Timeline.Root  variant="subtle" css={{ "--timeline-separator-display": 'block' }}>
            {steps.map((x, index) => {
                const {
                    patch,
                    inputs,
                    source,
                    name
                } = x;
                let err: Error;

                let left: JsonPlayObject;
                if(!patchFailed) {
                    left = JSON.parse(JSON.stringify(currentPlay));
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
                }

                if (!patchFailed && patch !== undefined) {
                    try {
                        currentPlay = jdiff.patch(currentPlay, patch) as JsonPlayObject;
                    } catch (e) {
                        err = new Error('Could not patch Play object', { cause: e });
                        patchFailed = true;
                    }
                }
                let diffElm: JSX.Element;

                if(err) {
                    diffElm = <Fragment><ErrorAlert error={err} /><ChakraCodeBlockShort title="Diff Patch" key={`diffblockfallback-${index}`} code={patch} /></Fragment>
                } else if(patch === undefined) {
                    diffElm = <Text>Play was identical after Transform.</Text>
                } else if(patchFailed) {
                    diffElm = <ChakraCodeBlockShort key={`diffblockfallback-${index}`} title="Diff Patch" code={patch} />
                } else {
                    diffElm = <ChakraPlainBlockShort title="Play Diff" key={`diffblock-${index}`} code={left}>
                        <JsonDiffPatch key={`diff-${index}`} left={left} right={JSON.parse(JSON.stringify(currentPlay))} />
                    </ChakraPlainBlockShort>;
                }

                const showAnyDetails = inputs !== undefined || diffElm !== undefined || err !== undefined;
                return <Timeline.Item key={index}>
                    <Timeline.Connector>
                        <Timeline.Separator />
                        <Timeline.Indicator>
                            <Icon fontSize="lg">
                                <BiWrench />
                            </Icon>
                        </Timeline.Indicator>
                    </Timeline.Connector>
                    <Timeline.Content>
                        <Timeline.Title>
                            {name} <Span color="fg.muted">with</Span> {source}
                        </Timeline.Title>

                        {showAnyDetails ? <MSCollapsible indicator="Show Details" defaultOpen={collapsibleOpen} hideBelow="sm">
                            <Stack gap="2">
                                <Heading size="sm">Diff</Heading>
                                {diffElm}
                                {inputs !== undefined ? (
                                    <Fragment>
                                        <Heading size="sm">Inputs</Heading>
                                        <Stack gap="1">
                                            {x.inputs.map((y, inputsIndex) => {
                                                return <ChakraCodeBlockShort key={`inputs-${inputsIndex}`} code={y.input} title={y.type} />
                                            })}
                                        </Stack></Fragment>) : null}
                            </Stack>
                        </MSCollapsible> : null }
                    </Timeline.Content>
                </Timeline.Item>
            })}
            {currentPlay !== false ? (
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
                        <PlayData play={original} final={currentPlay} dates={false} compareDefault="Final" />
                    </Timeline.Content>
                </Timeline.Item>
            ) : null}
        </Timeline.Root>
    )
}