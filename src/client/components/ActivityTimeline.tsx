import React, { Fragment } from "react"
import { Timeline, Icon, Span, Card, Tabs, SkeletonCircle, SkeletonText, HTMLChakraProps } from '@chakra-ui/react';
import { CLIENT_DEAD_QUEUE, CLIENT_INGRESS_QUEUE, ComponentType, QUEUE_STATUS_COMPLETED, QUEUE_STATUS_FAILED, QUEUE_STATUS_QUEUED } from "../../core/Atomic";
import { PlayData } from "./PlayData";
import { ErrorAlert } from "./ErrorAlert";
import { IoMdCodeDownload } from "react-icons/io";
import { BiWrench } from "react-icons/bi";
import { HiMiniMagnifyingGlass } from "react-icons/hi2";
import { TbDatabaseEdit } from "react-icons/tb";
import { capitalize } from "../../core/StringUtils";
import { shortTodayAwareFormat } from "../../core/TimeUtils";
import dayjs, { Dayjs } from "dayjs";
import { ChakraCodeBlockShort } from "./CodeBlock";
import { TransformSteps } from "./TransformSteps";
import { ScrobbleMatchResult } from "./ScrobbleMatchResult";
import { ScrobbleActionResult } from "./ScrobbleActionResult";
import { MSCollapsible } from "./MSCollapsible";
import { TimelineErrorIcon } from "./timeline/TimelineIcon";
import { Muted } from "./Typography";
import { PlayApiCommonDetailed, QueueStateApi } from "../../core/Api";
import { MSErrorBoundary } from "./ErrorBoundary";
import { activityTransformHasIssue, timelineTextFormatting } from "../utils/ComponentUtils";
import { CheckIcon, TimelineIndicatorIconQueued } from "./icons/ChakraIcons";


export interface ActivityDetailProps {
    activity?: PlayApiCommonDetailed
    collapsibleOpen?: boolean,
    componentType?: ComponentType
}

const TimelineLoading = () => {
    return (
        <Timeline.Root variant="subtle" size="lg">
            <Timeline.Item>
                <Timeline.Connector>
                    <Timeline.Separator />
                    <Timeline.Indicator>
                        <Icon fontSize="lg">
                            <SkeletonCircle />
                        </Icon>
                    </Timeline.Indicator>
                </Timeline.Connector>
                <Timeline.Content>
                    <Timeline.Title>
                        <SkeletonText noOfLines={1} />
                    </Timeline.Title>
                    <SkeletonText noOfLines={2} />
                </Timeline.Content>
            </Timeline.Item>
        </Timeline.Root>
    );
}

const QueueTimelineItem = (props: {queueState: QueueStateApi, collapsibleOpen: boolean, /*isBefore?: Dayjs, isAfter?: Dayjs*/}) => {
    const {
        queueState,
        collapsibleOpen,
    } = props;
    if(queueState.queueStatus === QUEUE_STATUS_QUEUED) {
        return (
            <Timeline.Item>
                    <Timeline.Connector>
                        <Timeline.Separator />
                        <Timeline.Indicator>
                            <TimelineIndicatorIconQueued fontSize="lg"/>
                        </Timeline.Indicator>
                    </Timeline.Connector>
                    <Timeline.Content gap="4">
                        <Timeline.Title {...timelineTextFormatting}>
                            {queueState.queueName === CLIENT_DEAD_QUEUE ? 'Dead ' : ''}Queued <Muted>at</Muted> {shortTodayAwareFormat(dayjs(queueState.updatedAt))}
                        </Timeline.Title>
                    </Timeline.Content>
                </Timeline.Item>
        );
    }

    if(queueState.queueStatus === QUEUE_STATUS_COMPLETED) {
        return (
            <Timeline.Item>
                    <Timeline.Connector>
                        <Timeline.Separator />
                        <Timeline.Indicator>
                            <CheckIcon fontSize="lg"/>
                        </Timeline.Indicator>
                    </Timeline.Connector>
                    <Timeline.Content gap="4">
                        <Timeline.Title {...timelineTextFormatting}>
                            {queueState.queueName === CLIENT_DEAD_QUEUE ? 'Dead ' : ''}Queue finished processing <Muted>at</Muted> {shortTodayAwareFormat(dayjs(queueState.updatedAt))}
                        </Timeline.Title>
                    </Timeline.Content>
                </Timeline.Item>
        );
    }

    if(queueState.queueStatus === QUEUE_STATUS_FAILED) {
        let titleContent: React.JSX.Element;
        const titleProps: HTMLChakraProps<"span"> = queueState.error === undefined ? timelineTextFormatting : {};
        if(queueState.error === undefined) {
            titleContent = <>{queueState.queueName === CLIENT_DEAD_QUEUE ? 'Dead ' : ''}Queue failed <Muted>at</Muted> {shortTodayAwareFormat(dayjs(queueState.updatedAt))}</>;
        } else {
            titleContent = (
                <MSCollapsible indicator={<Fragment>{queueState.queueName === CLIENT_DEAD_QUEUE ? 'Dead ' : ''}Queue failed <Muted>at</Muted> {shortTodayAwareFormat(dayjs(queueState.updatedAt))}</Fragment>}
                                            defaultOpen={collapsibleOpen}
                                            disableUntil="md"
                                            timeline>
                                            <ErrorAlert error={queueState.error} />
                                        </MSCollapsible>
            )
        }
        return (
            <Timeline.Item>
                    <Timeline.Connector>
                        <Timeline.Separator />
                        <Timeline.Indicator>
                            <CheckIcon fontSize="lg"/>
                        </Timeline.Indicator>
                    </Timeline.Connector>
                    <Timeline.Content gap="4">
                        <Timeline.Title {...titleProps}>
                            {titleContent}
                        </Timeline.Title>
                    </Timeline.Content>
                </Timeline.Item>
        );
    }
}

const TimeFiltered = (props: {datetime: Dayjs, isBefore?: Dayjs, isAfter?: Dayjs, children: React.ReactNode}) => {
    const {
        isBefore,
        isAfter,
        datetime,
        children
    } = props;
    if(isBefore !== undefined && !datetime.isBefore(isBefore)) {
        return null;
    }
    if(isAfter !== undefined && !datetime.isAfter(isAfter)) {
        return null;
    }

    return children;
}

export const ActivityTimeline = (props: ActivityDetailProps) => {

    if(props.activity === undefined) {
        return <TimelineLoading/>;
    }

    const {
        activity:{
            play,
            input,
            seenAt,
            queueStates,
        } = {},
        collapsibleOpen,
        componentType
    } = props;
    const {
        data: {
            playDate
        },
        meta: {
            source,
        } = {},
        lifecycle: steps = [],
        scrobble: {
            match,
            payload,
            error,
            warnings = []
        } = {},
        scrobble,
    } = play;
    const {
        play: original,
        data: ogInput
    } = input || {};

    let scrobbleSummary: React.JSX.Element;
    const scrobbleIconProps: Record<string, any> = {
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

    let transformVerb: string = 'Transformed Play';

    const transformIssue = activityTransformHasIssue(props.activity);
    let transformResult: React.JSX.Element | undefined;
    if(transformIssue === 'error') {
        transformVerb = 'Transforming Play';
        transformResult = <Span> resulted in <Span color="red.solid">an error</Span></Span>;
    } else if(transformIssue === 'warn') {
        transformVerb = 'Transforming Play';
        transformResult = <Span> resulted in <Span color="orange.solid">warnings</Span></Span>;
    }

    let queueItem: React.JSX.Element | undefined,
    queueDateTime: Dayjs | undefined,
    deadItem: React.JSX.Element | undefined,
    deadDateTime: Dayjs | undefined;
    const ingressQueue = queueStates.find(x => x.queueName === CLIENT_INGRESS_QUEUE);
    if(ingressQueue !== undefined) {
        queueDateTime = dayjs(ingressQueue.updatedAt);
        queueItem = <QueueTimelineItem queueState={ingressQueue} collapsibleOpen={collapsibleOpen}/>
    }
    const deadqueue = queueStates.find(x => x.queueName === CLIENT_DEAD_QUEUE);
    if(deadqueue !== undefined) {
        deadDateTime = dayjs(deadqueue.updatedAt);
        deadItem = <QueueTimelineItem queueState={deadqueue} collapsibleOpen={collapsibleOpen}/>
    }

    const stepsDateTime = steps.length > 0 ? dayjs(steps[0].createdAt) : undefined;
    // TODO add actual timestamp to scrobble action so we can make this more accurate
    const scrobbleDateTime = match !== undefined ? dayjs(match.createdAt) : undefined;

    return (
        <MSErrorBoundary>
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
                               {componentType === 'source' ? 'Discovered' : 'Recieved'} <Span color="fg.muted">new Play from</Span> <Span fontWeight="medium">{capitalize(source)}</Span> <Span color="fg.muted">at {shortTodayAwareFormat(dayjs(seenAt))}</Span>
                            </Span>}
                            defaultOpen={collapsibleOpen}
                            timeline
                            disableUntil="md">
                            <Card.Root bgColor="bg.muted" size="sm">
                                <Card.Body textStyle="sm">
                                    <Tabs.Root size="sm" variant="outline" defaultValue="play">
                                        <Tabs.List>
                                            <Tabs.Trigger value="play">Play</Tabs.Trigger>
                                            {ogInput !== undefined ? <Tabs.Trigger value="source">Source Data</Tabs.Trigger> : null}
                                        </Tabs.List>
                                        <Tabs.Content value="play">
                                            <PlayData play={original} />
                                        </Tabs.Content>
                                        {ogInput !== undefined ?  (<Tabs.Content value="source">
                                            <ChakraCodeBlockShort code={ogInput} />
                                        </Tabs.Content>) : null }
                                    </Tabs.Root>
                                </Card.Body>
                            </Card.Root>
                        </MSCollapsible>
                    </Timeline.Title>
                </Timeline.Content>
            </Timeline.Item>
            {queueItem && stepsDateTime && <TimeFiltered datetime={queueDateTime} isBefore={stepsDateTime}>{queueItem}</TimeFiltered>}
            {deadItem && stepsDateTime && <TimeFiltered datetime={deadDateTime} isBefore={stepsDateTime}>{deadItem}</TimeFiltered>}
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
                                indicator={<Span {...timelineTextFormatting}>{transformVerb} <Span color="fg.muted">using configured Rules</Span>{transformResult}</Span>}
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
                        <Timeline.Title {...timelineTextFormatting}>
                            Play <Muted>was</Muted> not transformed <Muted>because no</Muted> Transform Rules <Muted> were used/configured.</Muted>
                        </Timeline.Title>
                    </Timeline.Content>
                </Timeline.Item>
            )}
            {queueItem && <TimeFiltered datetime={queueDateTime} isAfter={stepsDateTime} isBefore={scrobbleDateTime}>{queueItem}</TimeFiltered>}
            {deadItem && <TimeFiltered datetime={deadDateTime} isAfter={stepsDateTime} isBefore={scrobbleDateTime}>{deadItem}</TimeFiltered>}
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
                                indicator={<Span {...timelineTextFormatting}><Span color="fg.muted">Found </Span>{match.match ? <Span color="orange.solid"> a duplicate Scrobble</Span> : 'no duplicate Scrobbles'}</Span>}
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
            {queueItem && <TimeFiltered datetime={queueDateTime} isAfter={scrobbleDateTime}>{queueItem}</TimeFiltered>}
            {deadItem && <TimeFiltered datetime={deadDateTime} isAfter={scrobbleDateTime}>{deadItem}</TimeFiltered>}
        </Timeline.Root>
        </MSErrorBoundary>
    )
}