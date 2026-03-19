import { ComponentProps } from "react"
import { Timeline, Icon, Span, Stack, Heading } from '@chakra-ui/react';
import { JsonPlayObject, LifecycleStep } from "../../core/Atomic";
import { PlayData } from "./PlayData";
import { ErrorAlert } from "./ErrorAlert";
import { BiWrench } from "react-icons/bi";
import { IoMusicalNoteOutline } from "react-icons/io5";
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

    return (
        <Timeline.Root size="lg" variant="subtle" maxW="lg" css={{ "--timeline-separator-display": 'block' }}>
            {steps.map((x, index) => {
                let err: Error;
                const left = JSON.parse(JSON.stringify(currentPlay));
                if (currentPlay !== false) {
                    try {
                        currentPlay = jdiff.patch(currentPlay, x.patch) as JsonPlayObject;
                    } catch (e) {
                        err = new Error('Could not patch Play object', { cause: e });
                        currentPlay = false;
                    }
                }
                return <Timeline.Item>
                    <Timeline.Connector>
                        <Timeline.Separator />
                        <Timeline.Indicator>
                            <Icon fontSize="xs">
                                <BiWrench />
                            </Icon>
                        </Timeline.Indicator>
                    </Timeline.Connector>
                    <Timeline.Content>
                        <Timeline.Title>
                            {x.name} <Span color="fg.muted">with</Span> {x.source}
                        </Timeline.Title>
                        <MSCollapsible indicator="Show Details" defaultOpen={collapsibleOpen}>
                            <Heading size="sm">Diff</Heading>
                            {err !== undefined ? <ErrorAlert error={err} /> : null}

                            {left !== false && currentPlay !== false ? (
                                <ChakraPlainBlockShort code={left}>
                                    <JsonDiffPatch left={left} right={currentPlay} />
                                </ChakraPlainBlockShort>
                            ) : <ChakraCodeBlockShort code={x.patch} />}
                            <Heading size="sm">Inputs</Heading>
                            <Stack gap="1">
                                {x.inputs.map((y) => {
                                    return <ChakraCodeBlockShort code={y.input} title={y.type} />
                                })}
                            </Stack>
                        </MSCollapsible>
                    </Timeline.Content>
                </Timeline.Item>
            })}
            {currentPlay !== false ? (
                <Timeline.Item>
                    <Timeline.Connector>
                        <Timeline.Separator />
                        <Timeline.Indicator>
                            <Icon fontSize="xs">
                                <IoMusicalNoteOutline />
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