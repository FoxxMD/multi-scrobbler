import { ComponentProps, Fragment } from "react"
import { Timeline, Icon, Span, Stack, Heading, Box } from '@chakra-ui/react';
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

    let currentPlay: JsonPlayObject | false = JSON.parse(JSON.stringify(original));
    if(currentPlay !== false) {
        currentPlay.data.meta = {
            ...(currentPlay.data.meta ?? {}),
        }
    }

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
                const left = currentPlay !== false ? JSON.parse(JSON.stringify(currentPlay)) : false;
                if (currentPlay !== false && patch !== undefined) {
                    try {
                        currentPlay = jdiff.patch(currentPlay, patch) as JsonPlayObject;
                    } catch (e) {
                        err = new Error('Could not patch Play object', { cause: e });
                        currentPlay = false;
                    }
                } else {
                    currentPlay = false;
                }
                let diffElm: JSX.Element;
                if(left !== false && currentPlay !== false) {
                    diffElm = <ChakraPlainBlockShort code={left}>
                                    <JsonDiffPatch left={left} right={currentPlay} />
                                </ChakraPlainBlockShort>;
                } else if(patch !== undefined) {
                    diffElm = <ChakraCodeBlockShort code={patch} />;
                }
                const showAnyDetails = inputs !== undefined || diffElm !== undefined || err !== undefined;
                return <Timeline.Item>
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
                                {err !== undefined ? <ErrorAlert error={err} /> : null}
                                {diffElm !== undefined ? <Fragment><Heading size="sm">Diff</Heading>{diffElm}</Fragment> : null }
                                {inputs !== undefined ? (
                                    <Fragment>
                                        <Heading size="sm">Inputs</Heading>
                                        <Stack gap="1">
                                            {x.inputs.map((y) => {
                                                return <ChakraCodeBlockShort code={y.input} title={y.type} />
                                            })}
                                        </Stack></Fragment>) : null}
                            </Stack>
                        </MSCollapsible> : null }
                    </Timeline.Content>
                </Timeline.Item>
            })}
            {currentPlay !== false ? (
                <Timeline.Item hideBelow="sm">
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