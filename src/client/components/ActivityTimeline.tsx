import type { Collapsible } from '@chakra-ui/react';
import { Card, Icon, SkeletonCircle, SkeletonText, Span, Tabs, Timeline} from '@chakra-ui/react';
import dayjs from "dayjs";
import React from "react";
import { BiWrench } from "react-icons/bi";
import { HiMiniMagnifyingGlass } from "react-icons/hi2";
import { IoMdCodeDownload } from "react-icons/io";
import { TbDatabaseEdit } from "react-icons/tb";
import type {PlayApiCommonDetailed} from "../../core/Api";
import { DEAD_QUEUE, QUEUE_STATUS_COMPLETED, QUEUE_STATUS_FAILED, QUEUE_STATUS_QUEUED, type ComponentType, type JsonPlayObject, type LifecycleStep, type PlayMatchResult, type ScrobbleResult } from "../../core/Atomic";
import { sortByNewestDate } from "../../core/PlayUtils";
import { capitalizeWords } from "../../core/StringUtils";
import { shortTodayAwareFormat } from "../../core/TimeUtils";
import { activityTransformHasIssue, timelineIconProps, TimelineItemSummaryText } from "../utils/ComponentUtils";
import { ChakraCodeBlockShort } from "./CodeBlock";
import { ErrorAlert } from "./ErrorAlert";
import { MSErrorBoundary } from "./ErrorBoundary";
import { CheckIcon, ExclamationTriangleIcon, TimelineIndicatorIconQueued } from "./icons/ChakraIcons";
import { MSCollapsible } from "./MSCollapsible";
import { PlayData } from "./PlayData";
import { ScrobbleActionResult } from "./ScrobbleActionResult";
import { ScrobbleMatchResult } from "./ScrobbleMatchResult";
import { TimelineErrorIcon } from "./timeline/TimelineIcon";
import { diffElements, TransformSteps } from "./TransformSteps";
import { Muted } from "./Typography";
import type { PlayEventQueueStateChange } from '../../core/PlayEvent';


interface ActivityTimelineProps {
    activity?: PlayApiCommonDetailed
    collapsibleOpen?: boolean,
    componentType?: ComponentType
    componentName?: string
}

const timelineCollapsibleProps: Collapsible.TriggerProps = {alignItems: "flex-end"};

const TimelineLoading = () => (
        <Timeline.Root variant="subtle" size="lg">
            <Timeline.Item>
                <Timeline.Connector>
                    <Timeline.Separator />
                    <Timeline.Indicator>
                        <Icon {...timelineIconProps}>
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
    )

const NewItem = (props: Pick<ActivityTimelineProps, 'collapsibleOpen' | 'activity' | 'componentType'>) => {
    const {
        activity: {
            play,
            input,
            seenAt,
        } = {},
        collapsibleOpen,
        componentType
    } = props;
    const {
        meta: {
            source,
        } = {},
    } = play;
    const {
        play: original,
        data: ogInput
    } = input || {};

    return (
        <Timeline.Item>
            <Timeline.Connector>
                <Timeline.Separator />
                <Timeline.Indicator>
                    <Icon {...timelineIconProps}>
                        <IoMdCodeDownload />
                    </Icon>
                </Timeline.Indicator>
            </Timeline.Connector>
            <Timeline.Content>
                <Timeline.Title>
                    <MSCollapsible
                        triggerProps={timelineCollapsibleProps}
                        indicator={<TimelineItemSummaryText>
                            {componentType === 'source' ? 'Discovered' : 'Recieved'} <Muted>new Play from</Muted> <Span fontWeight="medium">{capitalizeWords(source)}</Span> <Muted>at {shortTodayAwareFormat(dayjs(seenAt))}</Muted>
                        </TimelineItemSummaryText>}
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
                                    {ogInput !== undefined ? (<Tabs.Content value="source">
                                        <ChakraCodeBlockShort code={ogInput} />
                                    </Tabs.Content>) : null}
                                </Tabs.Root>
                            </Card.Body>
                        </Card.Root>
                    </MSCollapsible>
                </Timeline.Title>
            </Timeline.Content>
        </Timeline.Item>
    )
}

const TransformsItem = (props: Pick<ActivityTimelineProps, 'activity' | 'collapsibleOpen'> & { steps: LifecycleStep[], original: JsonPlayObject }) => {
    const {
        steps = [],
        collapsibleOpen,
        original
    } = props;
    let transformVerb: string = 'Transformed Play';

    const transformIssue = activityTransformHasIssue(steps);
    let transformResult: React.JSX.Element | undefined;
    if (transformIssue === 'error') {
        transformVerb = 'Transforming Play';
        transformResult = <Span> <Muted>resulted in</Muted> <Span color="red.solid">an error</Span></Span>;
    } else if (transformIssue === 'warn') {
        transformVerb = 'Transforming Play';
        transformResult = <Span> <Muted>resulted in</Muted> <Span color="orange.solid">warnings</Span></Span>;
    }
    return (<Timeline.Item>
        <Timeline.Connector>
            <Timeline.Separator />
            <Timeline.Indicator>
                <Icon {...timelineIconProps}>
                    <BiWrench />
                </Icon>
            </Timeline.Indicator>
        </Timeline.Connector>
        <Timeline.Content>
            <Timeline.Title>
                <MSCollapsible
                    triggerProps={timelineCollapsibleProps}
                    indicator={<TimelineItemSummaryText>{transformVerb} <Muted>using configured Rules</Muted> <Muted>for</Muted> {steps[0].hook} {transformResult}</TimelineItemSummaryText>}
                    unmountOnExit
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
    )
}

const NoTransformsItem = () => (
    <Timeline.Item>
        <Timeline.Connector>
            <Timeline.Separator />
            <Timeline.Indicator>
                <Icon {...timelineIconProps}>
                    <BiWrench />
                </Icon>
            </Timeline.Indicator>
        </Timeline.Connector>
        <Timeline.Content>
            <Timeline.Title >
                <TimelineItemSummaryText>Play <Muted>was</Muted> not transformed <Muted>because no</Muted> Transform Rules <Muted> were used/configured.</Muted></TimelineItemSummaryText>
            </Timeline.Title>
        </Timeline.Content>
    </Timeline.Item>
)

const ScrobbleMatchItem = (props: Pick<ActivityTimelineProps, 'collapsibleOpen'> & { match: PlayMatchResult<string> }) => {
    const {
        match,
        collapsibleOpen
    } = props;

    return (
        <Timeline.Item>
            <Timeline.Connector>
                <Timeline.Separator />
                <Timeline.Indicator>
                    <Icon {...timelineIconProps} color={`${match.match ? 'orange' : 'green'}.focusRing`}>
                        <HiMiniMagnifyingGlass />
                    </Icon>
                </Timeline.Indicator>
            </Timeline.Connector>
            <Timeline.Content>
                <Timeline.Title>
                    <MSCollapsible
                        triggerProps={timelineCollapsibleProps}
                        indicator={<TimelineItemSummaryText><Muted>Found </Muted>{match.match ? <Span color="orange.solid"> a duplicate Scrobble</Span> : 'no duplicate Scrobbles'}</TimelineItemSummaryText>}
                        defaultOpen={collapsibleOpen}
                        disableUntil="md"
                        unmountOnExit
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
    )

}

const ScrobbleResponseItem = (props: Pick<ActivityTimelineProps, 'collapsibleOpen'> & { scrobble: ScrobbleResult<string>, componentName?: string }) => {
    const {
        scrobble: {
            payload,
            error,
            warnings = []
        } = {},
        scrobble,
        collapsibleOpen,
        componentName = 'downstream service'
    } = props;

    let scrobbleSummary: React.JSX.Element;
    const scrobbleIconProps: Record<string, any> = {
        color: 'green.focusRing'
    };
    if (payload !== undefined) {
        if (error !== undefined) {
            scrobbleSummary = <TimelineItemSummaryText>Scrobble attempt <Muted>to {capitalizeWords(componentName)} resulted in</Muted> <Span color="red.solid">an error.</Span></TimelineItemSummaryText>
        } else if (warnings.length > 0) {
            scrobbleSummary = <TimelineItemSummaryText>Scrobbled <Muted>to {capitalizeWords(componentName)} but response </Muted> <Span color="orange.solid">has warnings.</Span></TimelineItemSummaryText>
        } else {
            scrobbleSummary = <TimelineItemSummaryText>Scrobbled <Muted>to {capitalizeWords(componentName)}</Muted> successfully.</TimelineItemSummaryText>;
        }
    }

    return (
        <Timeline.Item>
            <Timeline.Connector>
                <Timeline.Separator />
                <Timeline.Indicator>
                    {error !== undefined ? <TimelineErrorIcon /> : (
                        <Icon {...timelineIconProps} {...scrobbleIconProps}>
                            <TbDatabaseEdit />
                        </Icon>
                    )}
                </Timeline.Indicator>
            </Timeline.Connector>
            <Timeline.Content >
                <Timeline.Title>
                    <MSCollapsible
                        triggerProps={timelineCollapsibleProps}
                        indicator={scrobbleSummary}
                        defaultOpen={collapsibleOpen}
                        timeline
                        unmountOnExit
                        disableUntil="md">
                        <Card.Root bgColor="bg.muted" size="sm">
                            <Card.Body textStyle="sm">
                                <ScrobbleActionResult componentName={componentName} result={scrobble} collapsibleOpen={collapsibleOpen} />
                            </Card.Body>
                        </Card.Root>
                    </MSCollapsible>
                </Timeline.Title>
            </Timeline.Content>
        </Timeline.Item>
    )
}

const QueueTimelineItem = (props: {queueState: PlayEventQueueStateChange<string>, collapsibleOpen: boolean}) => {
    const {
        queueState: {
            data: {
                queueStatus,
                queueName,
                error,
                retries
            },
            createdAt,
        } = {},
        collapsibleOpen,
    } = props;

    let indicator: React.JSX.Element,
    text: React.JSX.Element,
    title: React.JSX.Element;

    switch(queueStatus) {
        case QUEUE_STATUS_QUEUED:
            indicator = <TimelineIndicatorIconQueued {...timelineIconProps} />;
            text = <TimelineItemSummaryText>{queueName === DEAD_QUEUE ? 'Dead ' : ''}Queued <Muted>at</Muted> {shortTodayAwareFormat(dayjs(createdAt))}</TimelineItemSummaryText>;
            break;
        case QUEUE_STATUS_COMPLETED:
            indicator = <CheckIcon color="green.focusRing" {...timelineIconProps}/>;
            text = <TimelineItemSummaryText>{queueName === DEAD_QUEUE ? 'Dead ' : ''}Queue finished processing <Muted>at</Muted> {shortTodayAwareFormat(dayjs(createdAt))}</TimelineItemSummaryText>;
            break;
        case QUEUE_STATUS_FAILED:
            indicator = <ExclamationTriangleIcon color="orange.focusRing" {...timelineIconProps}/>;
            text = <TimelineItemSummaryText>{queueName === DEAD_QUEUE ? 'Dead ' : ''}Queue failed <Muted>at</Muted> {shortTodayAwareFormat(dayjs(createdAt))}</TimelineItemSummaryText>;
    }

    if(error !== undefined && error !== null) {
        title = (
            <MSCollapsible 
                triggerProps={timelineCollapsibleProps}
                indicator={text}
                defaultOpen={collapsibleOpen}
                disableUntil="md"
                timeline
                unmountOnExit>
                <ErrorAlert error={error} />
            </MSCollapsible>
        )
    } else {
        title = text;
    }

    return (
        <Timeline.Item>
                <Timeline.Connector>
                    <Timeline.Separator />
                    <Timeline.Indicator>
                        {indicator}
                    </Timeline.Indicator>
                </Timeline.Connector>
                <Timeline.Content gap="4">
                    <Timeline.Title>
                        {title}
                    </Timeline.Title>
                </Timeline.Content>
            </Timeline.Item>
    );
}

export const ActivityTimeline = (props: ActivityTimelineProps) => {

    if(props.activity === undefined) {
        return <TimelineLoading/>;
    }

    const {
        activity:{
            input,
            events = [],
        } = {},
        collapsibleOpen,
        componentType,
        componentName
    } = props;
    const {
        play: original,
    } = input || {};

    events.sort((a, b) => sortByNewestDate(b.createdAt, a.createdAt));

    const timelineElements: React.JSX.Element[] = [
        <NewItem key="newPlay" activity={props.activity} collapsibleOpen={collapsibleOpen} componentType={componentType}/>
    ];

    let lastTransformedPlay = original;
    for(const event of events) {
        switch(event.eventName) {
            case 'transform': {
                //const d: TransformStepsTimelineData = {id: 'transform-steps', dt: dayjs(event.data[0].createdAt), steps: event.data, original: lastTransformedPlay};
                timelineElements.push(<TransformsItem key={event.id} steps={event.data} original={lastTransformedPlay}/>);
                const [__, finalPlay] = diffElements(lastTransformedPlay, event.data);
                lastTransformedPlay = finalPlay;
            } break;
            case 'queueStateChange': {
                timelineElements.push(<QueueTimelineItem key={event.id} queueState={event} collapsibleOpen={collapsibleOpen}/>);
            } break;
            case 'dupeCheck': {
                timelineElements.push(<ScrobbleMatchItem key={event.id} match={event.data} collapsibleOpen={collapsibleOpen}/>);
            } break;
            case 'scrobbleResult':
                timelineElements.push(<ScrobbleResponseItem key={event.id} scrobble={event.data} componentName={componentName} collapsibleOpen={collapsibleOpen}/>);
        }
    }

    return (
        <MSErrorBoundary>
        <Timeline.Root variant="subtle" size="lg">
            {timelineElements}
        </Timeline.Root>
        </MSErrorBoundary>
    )
}