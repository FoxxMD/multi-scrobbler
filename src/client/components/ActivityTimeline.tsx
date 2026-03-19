import { ComponentProps } from "react"
import { Accordion, Timeline, Icon, Span, Stack, Heading, Card, Box } from '@chakra-ui/react';
import { ErrorLike, JsonPlayObject, LifecycleStep, PlayActivity } from "../../core/Atomic";
import { PlayData } from "./PlayData";
import { ErrorAlert } from "./ErrorAlert";
import { IoMdCodeDownload } from "react-icons/io";
import { BiWrench } from "react-icons/bi";
import { IoMusicalNoteOutline } from "react-icons/io5";
import { MdFiberNew } from "react-icons/md";
import { capitalize } from "../../core/StringUtils";
import { shortTodayAwareFormat, todayAwareFormat } from "../../core/TimeUtils";
import dayjs from "dayjs";
import { ChakraCodeBlockShort, ChakraPlainBlockShort } from "./CodeBlock";
import { JsonDiffPatch } from "./JsonDiff";
import { jdiff } from "../../core/DataUtils";


export interface ActivityDetailProps {
    play: JsonPlayObject
}

export const ActivityTimeline = (props: ActivityDetailProps) => {
    const {
        play
    } = props;
    const {
        data: {
            playDate
        },
        meta: {
            source,
            lifecycle: {
                input,
                original,
                steps = []
            },
        } = {}
    } = play;
    return (
        <Timeline.Root size="lg" variant="subtle" maxW="lg">
            <Timeline.Item>
                <Timeline.Connector>
                    <Timeline.Separator />
                    <Timeline.Indicator>
                        <Icon fontSize="xs">
                            <IoMdCodeDownload />
                        </Icon>
                    </Timeline.Indicator>
                </Timeline.Connector>
                <Timeline.Content>
                    <Timeline.Title>
                        Discovered <Span color="fg.muted">new activity from</Span>
                        <Span fontWeight="medium">{capitalize(source)}</Span>
                        <Span color="fg.muted">at {shortTodayAwareFormat(dayjs(playDate))}</Span>
                    </Timeline.Title>
                    <ChakraCodeBlockShort code={input} />
                </Timeline.Content>
            </Timeline.Item>

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
                        <Span color="fg.muted">Created new</Span> Play
                    </Timeline.Title>
                    <PlayData play={original} />
                </Timeline.Content>
            </Timeline.Item>
            {steps.length > 0 ? (
                <Timeline.Item>
                    <Timeline.Connector>
                        <Timeline.Separator />
                        <Timeline.Indicator>
                            <Icon fontSize="xs">
                                <BiWrench />
                            </Icon>
                        </Timeline.Indicator>
                    </Timeline.Connector>
                    <Timeline.Content gap="4">
                        <Timeline.Title>
                            Transforms
                        </Timeline.Title>
                        <TransformSteps steps={steps} original={original} />
                        {/* <Card.Root size="sm">
                            <Card.Body>
                                <TransformSteps steps={steps} original={original} />
                            </Card.Body>
                        </Card.Root> */}
                    </Timeline.Content>
                </Timeline.Item>
            ) : null}
            {/* <Timeline.Item>
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
                        <Span color="fg.muted">Created new</Span> Play
                    </Timeline.Title>
                    test
                </Timeline.Content>
            </Timeline.Item> */}


            {/* <Timeline.Item>
                <Timeline.Connector>
                    <Timeline.Separator />
                    <Timeline.Indicator>
                        <Avatar.Root size="full">
                            <Avatar.Image src="https://i.pravatar.cc/150?u=o" />
                            <Avatar.Fallback />
                        </Avatar.Root>
                    </Timeline.Indicator>
                </Timeline.Connector>
                <Timeline.Content gap="4" mt="-1" w="full">
                    <Input size="sm" placeholder="Add comment..." />
                </Timeline.Content>
            </Timeline.Item> */}
        </Timeline.Root>
    )
}

export interface LifeycleStepsTimelineProps {
    steps: LifecycleStep[]
    original: JsonPlayObject
}

const TransformSteps = (props: LifeycleStepsTimelineProps) => {
    const {
        steps,
        original
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