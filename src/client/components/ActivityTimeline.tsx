import type { Collapsible } from '@chakra-ui/react';
import { Card, Icon, SkeletonCircle, SkeletonText, Span, Tabs, Timeline} from '@chakra-ui/react';
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import React from "react";
import { BiWrench } from "react-icons/bi";
import { HiMiniMagnifyingGlass } from "react-icons/hi2";
import { IoMdCodeDownload } from "react-icons/io";
import { TbDatabaseEdit } from "react-icons/tb";
import type {PlayApiCommonDetailed, QueueStateApi} from "../../core/Api";
import { CLIENT_DEAD_QUEUE, CLIENT_INGRESS_QUEUE, QUEUE_STATUS_COMPLETED, QUEUE_STATUS_FAILED, QUEUE_STATUS_QUEUED, type ComponentType, type JsonPlayObject, type LifecycleStep, type PlayMatchResult, type ScrobbleResult } from "../../core/Atomic";
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

const QueuedCreatedItem = (props: { dead?: boolean, datetime: string }) => (
    <Timeline.Item>
        <Timeline.Connector>
            <Timeline.Separator />
            <Timeline.Indicator>
                <TimelineIndicatorIconQueued {...timelineIconProps} />
            </Timeline.Indicator>
        </Timeline.Connector>
        <Timeline.Content>
            <Timeline.Title>
                <TimelineItemSummaryText>{props.dead ? 'Dead ' : ''}Queued <Muted>at</Muted> {shortTodayAwareFormat(dayjs(props.datetime))}</TimelineItemSummaryText>
            </Timeline.Title>
        </Timeline.Content>
    </Timeline.Item>
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

const QueueTimelineItem = (props: {queueState: QueueStateApi, collapsibleOpen: boolean}) => {
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
                            <TimelineIndicatorIconQueued {...timelineIconProps}/>
                        </Timeline.Indicator>
                    </Timeline.Connector>
                    <Timeline.Content gap="4">
                        <Timeline.Title>
                            <TimelineItemSummaryText>{queueState.queueName === CLIENT_DEAD_QUEUE ? 'Dead ' : ''}Queued <Muted>at</Muted> {shortTodayAwareFormat(dayjs(queueState.updatedAt))}</TimelineItemSummaryText>
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
                            <CheckIcon color="green.focusRing" {...timelineIconProps}/>
                        </Timeline.Indicator>
                    </Timeline.Connector>
                    <Timeline.Content gap="4">
                        <Timeline.Title>
                            <TimelineItemSummaryText>{queueState.queueName === CLIENT_DEAD_QUEUE ? 'Dead ' : ''}Queue finished processing <Muted>at</Muted> {shortTodayAwareFormat(dayjs(queueState.updatedAt))}</TimelineItemSummaryText>
                        </Timeline.Title>
                    </Timeline.Content>
                </Timeline.Item>
        );
    }

    if(queueState.queueStatus === QUEUE_STATUS_FAILED) {
        let titleContent: React.JSX.Element;
        if(queueState.error === undefined) {
            titleContent = <TimelineItemSummaryText>{queueState.queueName === CLIENT_DEAD_QUEUE ? 'Dead ' : ''}Queue failed <Muted>at</Muted> {shortTodayAwareFormat(dayjs(queueState.updatedAt))}</TimelineItemSummaryText>;
        } else {
            titleContent = (
                <MSCollapsible 
                triggerProps={timelineCollapsibleProps}
                indicator={<TimelineItemSummaryText>{queueState.queueName === CLIENT_DEAD_QUEUE ? 'Dead ' : ''}Queue failed <Muted>at</Muted> {shortTodayAwareFormat(dayjs(queueState.updatedAt))}</TimelineItemSummaryText>}
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
                            <ExclamationTriangleIcon color="orange.focusRing" {...timelineIconProps}/>
                        </Timeline.Indicator>
                    </Timeline.Connector>
                    <Timeline.Content >
                        <Timeline.Title>
                            {titleContent}
                        </Timeline.Title>
                    </Timeline.Content>
                </Timeline.Item>
        );
    }
}

type TransformStepsTimelineData = {id: 'transform-steps', dt: Dayjs, steps: LifecycleStep[], original?: JsonPlayObject};
type TimelineDataTypes = 'new' | 'queue-created-ingress' | 'queue-created-dead' | 'queue-updated-ingress' | 'queue-updated-dead' | 'scrobble-match' | 'scrobble-response' | 'transform-steps';
type TimelineData = {id: TimelineDataTypes, dt: Dayjs};

export const ActivityTimeline = (props: ActivityTimelineProps) => {

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
        componentType,
        componentName
    } = props;
    const {
        lifecycle: steps = [],
        scrobble: {
            match,
            payload,
            createdAt: scrobbleResultCreatedAt
        } = {},
        scrobble,
    } = play;
    const {
        play: original,
    } = input || {};

    const timelineItems: (TimelineData|TransformStepsTimelineData)[] = [
        {id: 'new', dt: dayjs(seenAt)},
    ];

        // group transforms by hook
    const transformGroups: Record<string, LifecycleStep[]> = steps.length === 0  ? {} : steps.reduce((acc, curr) => {
        if(acc[curr.hook] === undefined) {
            acc[curr.hook] = [];
        }
        return {...acc, [curr.hook]: [...acc[curr.hook], curr]};
    }, {});

    let lastTransformedPlay = original;
    for(const [_,v] of Object.entries(transformGroups)) {
        const d: TransformStepsTimelineData = {id: 'transform-steps', dt: dayjs(v[0].createdAt), steps: v, original: lastTransformedPlay};
        const [__, finalPlay] = diffElements(lastTransformedPlay, v);
        lastTransformedPlay = finalPlay;
        timelineItems.push(d);
    }

    const ingressQueue = queueStates.find(x => x.queueName === CLIENT_INGRESS_QUEUE);
    if(ingressQueue !== undefined) {
        if(ingressQueue.updatedAt === ingressQueue.createdAt) {
            // if queue was never updated but contains extra context then only show updated
            if(ingressQueue.error !== undefined || ingressQueue.queueStatus === QUEUE_STATUS_FAILED) {
                timelineItems.push({id: 'queue-updated-ingress', dt: dayjs(ingressQueue.updatedAt)});
            } else {
                timelineItems.push({id: 'queue-created-ingress', dt: dayjs(ingressQueue.createdAt)});
            }
        } else {
            timelineItems.push({id: 'queue-created-ingress', dt: dayjs(ingressQueue.createdAt)});
            timelineItems.push({id: 'queue-updated-ingress', dt: dayjs(ingressQueue.updatedAt)});
        }
    }
    const deadqueue = queueStates.find(x => x.queueName === CLIENT_DEAD_QUEUE);
    if(deadqueue !== undefined) {
        if(deadqueue.updatedAt === deadqueue.createdAt) {
            // if queue was never updated but contains extra context then only show updated
            if(deadqueue.error !== undefined || deadqueue.queueStatus === QUEUE_STATUS_FAILED) {
                timelineItems.push({id: 'queue-updated-dead', dt: dayjs(deadqueue.updatedAt)});
            } else {
                timelineItems.push({id: 'queue-created-dead', dt: dayjs(deadqueue.createdAt)});
            }
        } else {
            timelineItems.push({id: 'queue-created-dead', dt: dayjs(deadqueue.createdAt)});
            timelineItems.push({id: 'queue-updated-dead', dt: dayjs(deadqueue.updatedAt)});
        };
    }

    if(match !== undefined) {
        timelineItems.push({id: 'scrobble-match', dt: dayjs(match.createdAt)});
    }

    // since scrobbleResultCreatedAt has just been implemented older play data will not have it
    // and if match was never run, due to error earlier in lifecycle, we need to fallback to oldest event + 1s
    timelineItems.sort((a, b) => sortByNewestDate(b.dt, a.dt));
    if(payload !== undefined) {
        timelineItems.push({id: 'scrobble-response', dt: dayjs(scrobbleResultCreatedAt ?? match?.createdAt ?? timelineItems[timelineItems.length - 1].dt)});
    }

    // now we sort by date as well as logical order
    timelineItems.sort((a, b) => {
        // new is always sorted to first in order regardless of timestamp
        if(b.id === 'new') {
            return 1;
        }
        if(a.id === 'new') {
            return -1;
        }
       
        if(!a.dt.isSame(b.dt)) {
            return a.dt.isBefore(b.dt) ? -1 : 1;
        } else {
            // if they are the same timestamp then we need to determine the likely logical order

            // queue created always occurs before other actions as the play is queued first, then processed
            if(b.id.includes('queue-created')) {
                return 1;
            }
            if(a.id.includes('queue-created')) {
                return -1;
            }
            
            // transform steps always occur before scrobble actions
            if(a.id.includes('scrobble') && b.id === 'transform-steps') {
                return 1;
            }
            if(b.id.includes('scrobble') && a.id === 'transform-steps') {
                return -1;
            }

            // dupe matching always occurs before scrobbling
            if(b.id === 'scrobble-match' && a.id === 'scrobble-response') {
                return 1;
            }
            if(a.id === 'scrobble-match' && b.id === 'scrobble-response') {
                return -1;
            }

            // queue updated (finished) always occurs last
            if(a.id.includes('queue-updated')) {
                return 1;
            }
            if(b.id.includes('queue-updated')) {
                return -1;
            }
        }

        // nothing else matched, keep order
        return 0;
    });

    const f = timelineItems;
    console.log(f);


    const timelineElements: React.JSX.Element[] = timelineItems.map((x) => {
        const timelineKey = `${x.id}-${x.dt.unix()}`;
        switch(x.id) {
            case 'new':
                {
                    const newElm = <NewItem key={timelineKey} activity={props.activity} collapsibleOpen={collapsibleOpen} componentType={componentType}/>;
                    if(steps.length === 0) {
                        return [newElm, <NoTransformsItem key={`${timelineKey}-notransform`}/>];
                    }
                    return newElm;
                }
            case 'queue-created-ingress':
            case 'queue-created-dead':
                return <QueuedCreatedItem key={timelineKey} dead={x.id.includes('dead')} datetime={x.dt.toISOString()}/>;
            case 'queue-updated-ingress':
                return <QueueTimelineItem key={timelineKey} queueState={ingressQueue} collapsibleOpen={collapsibleOpen}/>;
            case 'queue-updated-dead':
                return <QueueTimelineItem key={timelineKey} queueState={deadqueue} collapsibleOpen={collapsibleOpen}/>;
            case 'scrobble-match':
                return <ScrobbleMatchItem key={timelineKey} match={match} collapsibleOpen={collapsibleOpen}/>;
            case 'scrobble-response':
                return <ScrobbleResponseItem key={timelineKey} scrobble={scrobble} componentName={componentName} collapsibleOpen={collapsibleOpen}/>;
            case 'transform-steps':
                {
                    const val = x as TransformStepsTimelineData;
                    return <TransformsItem key={timelineKey} steps={val.steps} original={val.original}/>
                }
        }
        return undefined;
    }).flat();

    return (
        <MSErrorBoundary>
        <Timeline.Root variant="subtle" size="lg">
            {timelineElements}
        </Timeline.Root>
        </MSErrorBoundary>
    )
}