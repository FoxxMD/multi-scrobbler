import type { Collapsible } from '@chakra-ui/react';
import { Card, Text, Icon, SkeletonCircle, SkeletonText, Span, Tabs, Timeline, Tag, HStack, Stack, Separator} from '@chakra-ui/react';
import { HiCheck } from "react-icons/hi"
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
import { CheckIcon, ExclamationTriangleIcon, TimelineIndicatorIconQueued, XIcon } from "./icons/ChakraIcons";
import { MSCollapsible } from "./MSCollapsible";
import { PlayData } from "./PlayData";
import { ScrobbleActionResult } from "./ScrobbleActionResult";
import { ScrobbleMatchResult } from "./ScrobbleMatchResult";
import { TimelineErrorIcon } from "./timeline/TimelineIcon";
import { diffElements, TransformSteps } from "./TransformSteps";
import { Muted } from "./Typography";
import type { PlayEventPlayStateChange, PlayEventQueueStateChange } from '../../core/PlayEvent';
import { FaInfo } from "react-icons/fa6";


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

const ScrobbleMatchItem = (props: Pick<ActivityTimelineProps, 'collapsibleOpen'> & { match: PlayMatchResult<string>, componentName?: string }) => {
    const {
        match,
        match: {
            closestMatchedPlay: {
                meta
            } = {}
        } = {},
        componentName = 'service',
        collapsibleOpen
    } = props;

    let fromSource: React.JSX.Element | undefined;
    if(match.match && meta !== undefined) {
        fromSource = <span> <Muted>from</Muted> {meta.parsedFrom === 'history' ? capitalizeWords(componentName) : 'MS Database'}</span>
    }

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
                        indicator={<TimelineItemSummaryText><Muted>Found </Muted>{match.match ? <Span color="orange.solid"> a duplicate Scrobble</Span> : 'no duplicate Scrobbles'}{fromSource}</TimelineItemSummaryText>}
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

const RetryChip = (props: { count: number }) => (<Tag.Root>
    <Tag.Label>Attempt: {props.count}</Tag.Label>
</Tag.Root>)

const BoolChip = (props: { text: string, check: boolean }) => (<Tag.Root>
    <Tag.Label>{props.text}</Tag.Label>
    <Tag.EndElement>
        {props.check ? <HiCheck /> : <XIcon />}
    </Tag.EndElement>
</Tag.Root>)
const DupeChip = (props: { check: boolean }) => <BoolChip {...props} text="Duplicate Check" />;
const TransformChip = (props: { check: boolean }) => <BoolChip {...props} text="Transform" />
const CacheChip = (props: { check: boolean }) => <BoolChip {...props} text="Use Cache" />

const QueueTimelineItem = (props: {queueState: PlayEventQueueStateChange<string>, collapsibleOpen: boolean}) => {
    const {
        queueState: {
            data: {
                queueStatus,
                queueName,
                error,
                retries,
                context: {
                    dupeCheck,
                    transform,
                    useCache,
                    reason
                } = {}
            },
            createdAt,
        } = {},
        collapsibleOpen,
    } = props;

    let indicator: React.JSX.Element,
    text: React.JSX.Element,
    title: React.JSX.Element;

    const contextHints: React.JSX.Element[] = [];
    const tags: React.JSX.Element[] = [];

    if(retries !== undefined && retries > 0) {
        tags.push(<RetryChip key="retry" count={retries}/>);
    }
    if(dupeCheck !== undefined) {
        tags.push(<DupeChip key="dupe" check={dupeCheck}/>)
    }
    if(transform !== undefined) {
        tags.push(<TransformChip key="transform" check={transform}/>)
    }
    if(useCache !== undefined) {
        tags.push(<CacheChip key="cache" check={useCache}/>)
    }
    if(tags.length > 0) {
        contextHints.push(<HStack key="tags">{tags}</HStack>)
    }
    if(reason !== undefined) {
        contextHints.push(<span key="reason">Reason - {reason}</span>);
    }

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
                <Stack>
                <ErrorAlert error={error} />
                </Stack>
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
                    {contextHints.length > 0 ? <Timeline.Description><HStack separator={<Separator orientation="vertical" height="5"/>}>{contextHints}</HStack></Timeline.Description> : undefined}
                </Timeline.Content>
            </Timeline.Item>
    );
}

const StateChangeItem = (props: {event: PlayEventPlayStateChange<string>, collapsibleOpen: boolean}) => {
        const {
        event: {
            data: {
                state,
                error,
                reason
            },
            createdAt,
        } = {},
        collapsibleOpen,
    } = props;

    let color: string;
    switch (state) {
        case 'discarded':
        case 'duped':
            color = 'orange';
            break;
        case 'discovered':
        case 'scrobbled':
            color = 'green';
            break;
        case 'failed':
            color = 'red';
            break;
        case 'queued':
            color = 'gray';
            break;
    }

    const text = <TimelineItemSummaryText>State <Muted>was changed to</Muted> <Span color={`${color}.solid`}>{capitalizeWords(state)}</Span> <Muted>at</Muted> {shortTodayAwareFormat(dayjs(createdAt))}</TimelineItemSummaryText>;

    let content: React.JSX.Element;
    if(error !== null && error !== undefined) {
        content = (
            <Timeline.Title>
            <MSCollapsible 
                triggerProps={timelineCollapsibleProps}
                indicator={text}
                defaultOpen={collapsibleOpen}
                disableUntil="md"
                timeline
                unmountOnExit>
                {reason !== undefined && reason !== null ? <Text my={2}>{reason}</Text> : null}
                <ErrorAlert error={error} />
            </MSCollapsible>
            </Timeline.Title>
        )
    } else {
        content = (<>
        <Timeline.Title>
            {text}
        </Timeline.Title>
        {reason !== undefined && reason !== null ? <Timeline.Description>{reason}</Timeline.Description> : null}
        </>);
    }

    return (
        <Timeline.Item>
                <Timeline.Connector>
                    <Timeline.Separator />
                    <Timeline.Indicator>
                        <FaInfo color="blue.focusRing"/>
                    </Timeline.Indicator>
                </Timeline.Connector>
                <Timeline.Content gap="4">
                    {content}
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
                timelineElements.push(<ScrobbleMatchItem key={event.id} match={event.data} collapsibleOpen={collapsibleOpen} componentName={componentName}/>);
            } break;
            case 'scrobbleResult':
                timelineElements.push(<ScrobbleResponseItem key={event.id} scrobble={event.data} componentName={componentName} collapsibleOpen={collapsibleOpen}/>);
                break;
            case 'playStateChange':
                timelineElements.push(<StateChangeItem key={event.id} event={event} collapsibleOpen={collapsibleOpen}/>)
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