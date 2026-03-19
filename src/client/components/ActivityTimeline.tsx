import { ComponentProps } from "react"
import { Accordion, Timeline, Icon, Span, Stack, Heading, Card, Box } from '@chakra-ui/react';
import { ErrorLike, JsonPlayObject, PlayActivity } from "../../core/Atomic";
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
import { TransformSteps } from "./TransformSteps";
import { ScrobbleMatchResult } from "./ScrobbleMatchResult";


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
                steps = [],
                scrobble: {
                    match,
                } = {}
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
                    </Timeline.Content>
                </Timeline.Item>
            ) : null}
            {match !== undefined ? (
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
                            Duplicate Match Check
                        </Timeline.Title>
                        <ScrobbleMatchResult match={match}/>
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
        </Timeline.Root>
    )
}