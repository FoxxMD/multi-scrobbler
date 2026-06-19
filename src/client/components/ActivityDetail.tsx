import React, { ComponentProps, useState, Fragment } from "react"
import { Accordion, For, Span, Stack, Text, Box, AbsoluteCenter, Button, Separator, HStack, Flex, Badge, IconButton, Container, Icon, useAccordionItemContext, Skeleton } from '@chakra-ui/react';
import { ComponentType } from "../../core/Atomic";
import { PlayData } from "./PlayData";
import { ErrorAlert } from "./ErrorAlert";
import { AiOutlineExclamationCircle } from "react-icons/ai";
import { ActivityTimeline } from "./ActivityTimeline";
import { ExpandCollapse } from "./ExpandCollapse";
import { PlayApiCommon, PlayApiCommonDetailed, SortPlaysBy, SortPlaysByProps } from "../../core/Api";
import { QueryFunctionContext, queryOptions, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import ky from 'ky';
import { baseUrl } from "../utils";
import { ShortDateDisplay } from "./DateDisplay";
import { TextMuted } from "./TextMuted";
import { VscDebugRestart } from "react-icons/vsc";
import { PlayStateBadge } from "./Badges";
import { MarkOptional } from "ts-essentials";
import { QueryPlaysOpts } from "../../backend/common/database/drizzle/repositories/PlayRepository";
import { tanQueries } from "../queries";
import { PaginatedResponse } from "../../backend/common/database/drizzle/repositories/BaseRepository";

export interface ActivityDetailProps {
    activity: PlayApiCommonDetailed
    componentType: ComponentType
}

export interface ActivitySummaryProps extends SortPlaysByProps {
    activity: PlayApiCommon
    componentType: ComponentType
}

export const ActivitySummary = (props: ActivitySummaryProps) => {
    const {
        activity: {
            play
        } = {},
        activity,
        sortBy
    } = props;
    return (
        <Container fluid p="0">
        <Flex justify="space-between">
            <Stack gap="1" truncate>
                <Span>{play.data.track}</Span>
                <TextMuted truncate>{play.data.artists.map(x => x.name).join(' / ')}</TextMuted>
                <HStack gap="1">
                    <ShortDateDisplay date={sortBy === 'played' ? play.data.playDate : play.meta?.seenAt} prefix={sortBy === 'played' ? 'Played' : 'Seen'} /><Separator orientation="vertical" height="4" />
                    <TextMuted>{play.meta?.source}</TextMuted>
                </HStack>
            </Stack>
            <Stack style={{
                paddingBlock: "var(--accordion-padding-y)",
                paddingInline: "var(--accordion-padding-x)"
            }} justify="flex-start" alignItems="flex-end">
                <PlayStateBadge maxWidth="fit-content" data={activity} />
                {activity.state === 'failed' ? <IconButton variant="ghost" size="xs" maxWidth="fit-content">
                    <VscDebugRestart />
                </IconButton> : null}
            </Stack>

        </Flex>
        </Container>
    )
}

export const ActivitySummaryFetchable = (props: MarkOptional<ActivitySummaryProps, 'activity'> & { componentId: number, activityUid: string, query: QueryPlaysOpts}) => {
        const queryClient = useQueryClient();
        const { isPending, isError, data, error } = useSuspenseQuery({
        ...tanQueries.activities.single(props.componentId, props.activityUid),
        initialData: () => {
            const data = queryClient.getQueryData(tanQueries.activities.list(props.componentId, props.query).queryKey) as PaginatedResponse<PlayApiCommonDetailed> | undefined;
            if(data !== undefined) {
                return data.data.find(x => x.uid === props.activityUid);
            }
        }
    });

    if(isError) {
        return <ErrorAlert error={error}/>
    }

    return <ActivitySummary {...props} activity={data}/>
}

export const ActivityDetails = (props: ActivityDetailProps) => {
    const {
        activity,
        componentType,
        activity: {
            error,
            input: {
                play: original,
            }
        }
    } = props;

    console.log(`Rendering ActivityDetails for ${activity.play.data.track}`);

    const ExpandCollapseContext = () => {
        const item = useAccordionItemContext();
        return <ExpandCollapse hideBelow="sm" display={useAccordionItemContext()?.expanded ? 'flex' : 'none'} onClick={(val) => setCollapsibleOpen(val)} />
    }

    const [collapsibleOpen, setCollapsibleOpen] = useState(undefined);

    return (
        <Box>
        <Accordion.Root variant="enclosed" collapsible multiple>
            <Accordion.Item value="info">
                <Accordion.ItemTrigger>
                    <Accordion.ItemIndicator />
                    Play Data
                </Accordion.ItemTrigger>
                <Accordion.ItemContent>
                    <Accordion.ItemBody>
                        <PlayData play={original ?? activity.play} final={activity.play} />
                    </Accordion.ItemBody>
                </Accordion.ItemContent>
            </Accordion.Item>
            <Accordion.Item value="timeline">
                <Flex justify="flex-start">
                    <Accordion.ItemTrigger>
                        <Accordion.ItemIndicator />
                        Timeline  {error !== undefined && error !== null ? (<Icon size="sm" color="red.focusRing">
                            <AiOutlineExclamationCircle />
                        </Icon>) : null}
                    </Accordion.ItemTrigger>
                    <Stack style={{
                        paddingBlock: "var(--accordion-padding-y)",
                        paddingInline: "var(--accordion-padding-x)"
                    }} justify="flex-start" alignItems="flex-end">
                    </Stack>
                    <ExpandCollapseContext/>
                </Flex>
                <Accordion.ItemContent>
                    <Accordion.ItemBody>
                        <ActivityTimeline activity={activity} collapsibleOpen={collapsibleOpen} componentType={componentType} />
                    </Accordion.ItemBody>
                </Accordion.ItemContent>
            </Accordion.Item>
        </Accordion.Root>
        {error !== undefined && error !== null ? <ErrorAlert error={error} /> : null}
        </Box>
    )
}

export interface ActivityDetailFetchableProps {
    uid: string
    componentId: number
    componentType: ComponentType
    query: QueryPlaysOpts
}

export const ActivityDetailFetchable = (props: ActivityDetailFetchableProps) => {
    const { isPending, isError, data, error } = useQuery({
        ...tanQueries.activities.single(props.componentId, props.uid)
    });

    if(isPending) {
        return <Fragment><Skeleton height="100px"/><Skeleton height="100px"/></Fragment>
    }

    if(isError) {
        return <ErrorAlert error={error}/>
    }

    return <ActivityDetails componentType={props.componentType} key={data?.uid} activity={data}/>
}