import { ComponentProps, useState, Fragment } from "react"
import { Accordion, Timeline, Icon, Span, Stack, Heading, Card, Box, Tabs } from '@chakra-ui/react';
import { ErrorLike, JsonPlayObject, PlayActivity } from "../../core/Atomic";
import { PlayData } from "./PlayData";
import { ErrorAlert } from "./ErrorAlert";
import { IoMdCodeDownload } from "react-icons/io";
import { BiWrench } from "react-icons/bi";
import { IoMusicalNoteOutline } from "react-icons/io5";
import { HiMiniMagnifyingGlass } from "react-icons/hi2";
import { TbDatabaseEdit } from "react-icons/tb";
import { capitalize } from "../../core/StringUtils";
import { shortTodayAwareFormat, todayAwareFormat } from "../../core/TimeUtils";
import dayjs from "dayjs";
import { ChakraCodeBlockShort, ChakraPlainBlockShort } from "./CodeBlock";
import { TransformSteps } from "./TransformSteps";
import { ScrobbleMatchResult } from "./ScrobbleMatchResult";
import { ScrobbleActionResult } from "./ScrobbleActionResult";
import { ExpandCollapse } from "./ExpandCollapse";
import { MSCollapsible } from "./MSCollapsible";
import { TimelineErrorIcon } from "./timeline/TimelineIcon";
import { Muted } from "./Typography";


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
                    payload,
                    error,
                    warnings = []
                } = {},
                scrobble
            },
        } = {}
    } = play;

    let scrobbleSummary: JSX.Element,
        scrobbleIconProps: Record<string, any> = {
            color: 'green.focusRing'
        };
    if (payload !== undefined) {
        if (error !== undefined) {
            scrobbleSummary = <Span>Scrobble attempt <Muted>to Client resulted in</Muted> <Span color="red.solid">an error.</Span></Span>
        } else if (warnings.length > 0) {
            scrobbleSummary = <Span>Scrobbled <Muted>to Client but response </Muted> <Span color="orange.solid">has warnings.</Span></Span>;
            scrobbleIconProps.orange = 'orange.focusRing';
        } else {
            scrobbleSummary = <Span>Scrobbled <Muted>to Client</Muted> successfully.</Span>;
        }
    }

    return (
        <Timeline.Root variant="subtle" size="lg">
            <Timeline.Item>
                <Timeline.Connector>
                    <Timeline.Separator />
                    <Timeline.Indicator>
                        <Icon fontSize="lg">
                            <IoMdCodeDownload />
                        </Icon>
                    </Timeline.Indicator>
                </Timeline.Connector>
                <Timeline.Content>
                    <Timeline.Title>
                        <MSCollapsible
                            indicator={<Span>
                                Discovered <Span color="fg.muted">new (Play) activity from</Span> <Span fontWeight="medium">{capitalize(source)}</Span> <Span color="fg.muted">at {shortTodayAwareFormat(dayjs(playDate))}</Span>
                            </Span>}
                            defaultOpen={collapsibleOpen}
                            timeline
                            disableUntil="md">
                            <Card.Root bgColor="bg.muted" size="sm">
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
                        </MSCollapsible>
                    </Timeline.Title>
                </Timeline.Content>
            </Timeline.Item>
            {steps.length > 0 ? (
                <Timeline.Item>
                    <Timeline.Connector>
                        <Timeline.Separator />
                        <Timeline.Indicator>
                            <Icon fontSize="lg">
                                <BiWrench />
                            </Icon>
                        </Timeline.Indicator>
                    </Timeline.Connector>
                    <Timeline.Content gap="4">
                        <Timeline.Title>
                            <MSCollapsible
                                indicator={<Span>Transformed Play <Span color="fg.muted">using configured Rules</Span></Span>}
                                defaultOpen={collapsibleOpen}
                                timeline>
                                <Card.Root bgColor="bg.muted" size="sm">
                                    <Card.Body textStyle="sm">
                                        <TransformSteps steps={steps} original={original} collapsibleOpen={collapsibleOpen} />
                                    </Card.Body>
                                </Card.Root>
                            </MSCollapsible>
                        </Timeline.Title>
                    </Timeline.Content>
                </Timeline.Item>
            ) : (
                <Timeline.Item>
                    <Timeline.Connector>
                        <Timeline.Separator />
                        <Timeline.Indicator>
                            <Icon fontSize="lg">
                                <BiWrench />
                            </Icon>
                        </Timeline.Indicator>
                    </Timeline.Connector>
                    <Timeline.Content gap="4">
                        <Timeline.Title>
                            Play <Muted>was</Muted> not transformed <Muted>because no</Muted> Transform Rules <Muted> were used/configured.</Muted>
                        </Timeline.Title>
                    </Timeline.Content>
                </Timeline.Item>
            )}
            {match !== undefined ? (
                <Timeline.Item>
                    <Timeline.Connector>
                        <Timeline.Separator />
                        <Timeline.Indicator>
                            <Icon fontSize="lg" color={`${match.match ? 'orange' : 'green'}.focusRing`}>
                                <HiMiniMagnifyingGlass />
                            </Icon>
                        </Timeline.Indicator>
                    </Timeline.Connector>
                    <Timeline.Content gap="4">
                        <Timeline.Title>
                            <MSCollapsible
                                indicator={<Span><Span color="fg.muted">Found </Span>{match.match ? <Span color="orange.solid"> a duplicate Scrobble</Span> : 'no duplicate Scrobbles'}</Span>}
                                defaultOpen={collapsibleOpen}
                                disableUntil="md"
                                timeline>
                                <Card.Root bgColor="bg.muted" size="sm">
                                    <Card.Body textStyle="sm">
                                        <ScrobbleMatchResult match={match} />
                                    </Card.Body>
                                </Card.Root>
                            </MSCollapsible>
                        </Timeline.Title>
                    </Timeline.Content>
                </Timeline.Item>
            ) : null}
            {payload !== undefined ? (
                <Timeline.Item>
                    <Timeline.Connector>
                        <Timeline.Separator />
                        <Timeline.Indicator>
                            {error !== undefined ? <TimelineErrorIcon /> : (
                                <Icon fontSize="lg" {...scrobbleIconProps}>
                                    <TbDatabaseEdit />
                                </Icon>
                            )}
                        </Timeline.Indicator>
                    </Timeline.Connector>
                    <Timeline.Content gap="4">
                        <Timeline.Title>
                            <MSCollapsible
                                indicator={scrobbleSummary}
                                defaultOpen={collapsibleOpen}
                                timeline
                                disableUntil="md">
                                <Card.Root bgColor="bg.muted" size="sm">
                                    <Card.Body textStyle="sm">
                                        <ScrobbleActionResult result={scrobble} scrobbler="Koito" collapsibleOpen={collapsibleOpen} />
                                    </Card.Body>
                                </Card.Root>
                            </MSCollapsible>
                        </Timeline.Title>
                    </Timeline.Content>
                </Timeline.Item>
            ) : null}
        </Timeline.Root>
    )
}