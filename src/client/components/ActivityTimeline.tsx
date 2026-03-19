import { ComponentProps, useState } from "react"
import { Accordion, Timeline, Icon, Span, Stack, Heading, Card, Box, Tabs } from '@chakra-ui/react';
import { ErrorLike, JsonPlayObject, PlayActivity } from "../../core/Atomic";
import { PlayData } from "./PlayData";
import { ErrorAlert } from "./ErrorAlert";
import { IoMdCodeDownload } from "react-icons/io";
import { BiWrench } from "react-icons/bi";
import { IoMusicalNoteOutline } from "react-icons/io5";
import { TbDatabaseEdit } from "react-icons/tb";
import { MdFiberNew } from "react-icons/md";
import { capitalize } from "../../core/StringUtils";
import { shortTodayAwareFormat, todayAwareFormat } from "../../core/TimeUtils";
import dayjs from "dayjs";
import { ChakraCodeBlockShort, ChakraPlainBlockShort } from "./CodeBlock";
import { TransformSteps } from "./TransformSteps";
import { ScrobbleMatchResult } from "./ScrobbleMatchResult";
import { ScrobbleActionResult } from "./ScrobbleActionResult";
import { ExpandCollapse } from "./ExpandCollapse";
import { MSCollapsible } from "./MSCollapsible";


export interface ActivityDetailProps {
    play: JsonPlayObject
    collapsibleOpen?: boolean
}

export const ActivityTimeline = (props: ActivityDetailProps) => {
    const {
        play,
        collapsibleOpen
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
                    payload
                } = {},
                scrobble
            },
        } = {}
    } = play;

    const [scrobbleCollapsibleOpen, setScrobbleCollapsibleOpen] = useState(false);

    return (
        <Timeline.Root size="lg" variant="subtle">
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
                        Discovered <Span color="fg.muted">new (Play) activity from</Span>
                        <Span fontWeight="medium">{capitalize(source)}</Span>
                        <Span color="fg.muted">at {shortTodayAwareFormat(dayjs(playDate))}</Span>
                    </Timeline.Title>
                    <Card.Root bgColor="bg.muted" size="sm" hideBelow="sm">
                        <Card.Body textStyle="sm">
                            <Tabs.Root size="sm" variant="outline" defaultValue="play">
                                <Tabs.List>
                                    <Tabs.Trigger value="play">Play</Tabs.Trigger>
                                    <Tabs.Trigger value="source">Source Data</Tabs.Trigger>
                                </Tabs.List>
                                <Tabs.Content value="play">
                                    <PlayData play={original} />
                                </Tabs.Content>
                                <Tabs.Content value="source">
                                    <ChakraCodeBlockShort code={input} />
                                </Tabs.Content>
                            </Tabs.Root>
                        </Card.Body>
                    </Card.Root>
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
                            Transformed Play <Span color="fg.muted">using configured Rules</Span>
                        </Timeline.Title>
                        <Card.Root bgColor="bg.muted" size="sm">
                            <Card.Body textStyle="sm">
                                <TransformSteps steps={steps} original={original} collapsibleOpen={collapsibleOpen} />
                            </Card.Body>
                        </Card.Root>
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
                            <Span color="fg.muted">Found </Span>{match.match ? <Span color="orange.solid"> a duplicate Scrobble</Span> : 'no duplicate Scrobbles'}
                        </Timeline.Title>
                        <Card.Root bgColor="bg.muted" size="sm" hideBelow="sm">
                            <Card.Body textStyle="sm">
                                <MSCollapsible indicator="Show Details" defaultOpen={collapsibleOpen}>
                                    <ScrobbleMatchResult match={match} />
                                </MSCollapsible>
                            </Card.Body>
                        </Card.Root>
                    </Timeline.Content>
                </Timeline.Item>
            ) : null}
            {payload !== undefined ? (
                <Timeline.Item>
                    <Timeline.Connector>
                        <Timeline.Separator />
                        <Timeline.Indicator>
                            <Icon fontSize="xs">
                                <TbDatabaseEdit />
                            </Icon>
                        </Timeline.Indicator>
                    </Timeline.Connector>
                    <Timeline.Content gap="4">
                        <Timeline.Title>
                            <Span color="fg.muted">Attmpted to</Span> Scrobble
                        </Timeline.Title>
                        <Card.Root bgColor="bg.muted" size="sm">
                            <Card.Body textStyle="sm">
                                <ScrobbleActionResult result={scrobble} scrobbler="Koito" collapsibleOpen={collapsibleOpen} />
                            </Card.Body>
                        </Card.Root>
                    </Timeline.Content>
                </Timeline.Item>
            ) : null}
        </Timeline.Root>
    )
}