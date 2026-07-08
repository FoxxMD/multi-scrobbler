import React, { Fragment } from "react"
import { Timeline, Icon, Span, Card, Tabs, SkeletonCircle, SkeletonText, HTMLChakraProps } from '@chakra-ui/react';
import { CLIENT_DEAD_QUEUE, CLIENT_INGRESS_QUEUE, ComponentType, JsonPlayObject, LifecycleStep, PlayMatchResult, QUEUE_STATUS_COMPLETED, QUEUE_STATUS_FAILED, QUEUE_STATUS_QUEUED, ScrobbleResult } from "../../core/Atomic";
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
import { diffElements, TransformSteps } from "./TransformSteps";
import { ScrobbleMatchResult } from "./ScrobbleMatchResult";
import { ScrobbleActionResult } from "./ScrobbleActionResult";
import { MSCollapsible } from "./MSCollapsible";
import { TimelineErrorIcon } from "./timeline/TimelineIcon";
import { Muted } from "./Typography";
import { PlayApiCommonDetailed, QueueStateApi } from "../../core/Api";
import { MSErrorBoundary } from "./ErrorBoundary";
import { activityTransformHasIssue, timelineTextFormatting } from "../utils/ComponentUtils";
import { CheckIcon, TimelineIndicatorIconQueued } from "./icons/ChakraIcons";
import { sortByNewestDate } from "../../core/PlayUtils";


export interface ActivityDetailProps {
    activity?: PlayApiCommonDetailed
    collapsibleOpen?: boolean,
    componentType?: ComponentType
}

const TimelineLoading = () => (
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
    )

const QueuedCreatedItem = (props: { dead?: boolean, datetime: string }) => (
    <Timeline.Item>
        <Timeline.Connector>
            <Timeline.Separator />
            <Timeline.Indicator>
                <TimelineIndicatorIconQueued fontSize="lg" />
            </Timeline.Indicator>
        </Timeline.Connector>
        <Timeline.Content gap="4">
            <Timeline.Title {...timelineTextFormatting}>
                {props.dead ? 'Dead ' : ''}Queued <Muted>at</Muted> {shortTodayAwareFormat(dayjs(props.datetime))}
            </Timeline.Title>
        </Timeline.Content>
    </Timeline.Item>
)

const NewItem = (props: Pick<ActivityDetailProps, 'collapsibleOpen' | 'activity' | 'componentType'>) => {
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

const TransformsItem = (props: Pick<ActivityDetailProps, 'activity' | 'collapsibleOpen'> & { steps: LifecycleStep[], original: JsonPlayObject }) => {
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
                <Icon fontSize="lg">
                    <BiWrench />
                </Icon>
            </Timeline.Indicator>
        </Timeline.Connector>
        <Timeline.Content gap="4">
            <Timeline.Title>
                <MSCollapsible
                    indicator={<Span {...timelineTextFormatting}>{transformVerb} <Span color="fg.muted">using configured Rules</Span> <Muted>for</Muted> {steps[0].hook} {transformResult}</Span>}
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
)

const ScrobbleMatchItem = (props: Pick<ActivityDetailProps, 'collapsibleOpen'> & { match: PlayMatchResult<string> }) => {
    const {
        match,
        collapsibleOpen
    } = props;

    return (
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
    )

}

const ScrobbleResponseItem = (props: Pick<ActivityDetailProps, 'collapsibleOpen'> & { scrobble: ScrobbleResult<string> }) => {
    const {
        scrobble: {
            payload,
            error,
            warnings = []
        } = {},
        scrobble,
        collapsibleOpen
    } = props;

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

    return (
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

type TransformStepsTimelineData = {id: 'transform-steps', dt: Dayjs, steps: LifecycleStep[], original?: JsonPlayObject};
type TimelineData = {id: string, dt: Dayjs};

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
        timelineItems.push({id: 'queue-ingress-created', dt: dayjs(ingressQueue.createdAt)});
        timelineItems.push({id: 'queue-ingress-updated', dt: dayjs(ingressQueue.updatedAt)});
    }
    const deadqueue = queueStates.find(x => x.queueName === CLIENT_DEAD_QUEUE);
    if(deadqueue !== undefined) {
        timelineItems.push({id: 'queue-dead-created', dt: dayjs(deadqueue.createdAt)});
        timelineItems.push({id: 'queue-dead-updated', dt: dayjs(deadqueue.updatedAt)});
    }

    if(match !== undefined) {
        timelineItems.push({id: 'scrobble-match', dt: dayjs(match.createdAt)});
    }

    // since scrobbleResultCreatedAt has just been implemented older play data will not have it
    // and if match was never run, due to error earlier in lifecycle, we need to fallback to oldest event + 1s
    timelineItems.sort((a, b) => sortByNewestDate(b.dt, a.dt));

    if(payload !== undefined) {
        timelineItems.push({id: 'scrobble-response', dt: dayjs(scrobbleResultCreatedAt ?? match?.createdAt ?? timelineItems[timelineItems.length - 1].dt.add(5, 's'))});
        // then, make sure added payload is in the right order
        timelineItems.sort((a, b) => sortByNewestDate(b.dt, a.dt));
    }

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
            case 'queue-ingress-created':
            case 'queue-dead-created':
                return <QueuedCreatedItem key={timelineKey} dead={x.id.includes('dead')} datetime={x.dt.toISOString()}/>;
            case 'queue-ingress-updated':
                return <QueueTimelineItem key={timelineKey} queueState={ingressQueue} collapsibleOpen={collapsibleOpen}/>;
            case 'queue-dead-updated':
                return <QueueTimelineItem key={timelineKey} queueState={deadqueue} collapsibleOpen={collapsibleOpen}/>;
            case 'scrobble-match':
                return <ScrobbleMatchItem key={timelineKey} match={match} collapsibleOpen={collapsibleOpen}/>;
            case 'scrobble-response':
                return <ScrobbleResponseItem key={timelineKey} scrobble={scrobble} collapsibleOpen={collapsibleOpen}/>;
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