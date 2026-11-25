import { Alert, Badge, Button, Card, Link as ChakraLink, DataList, Flex, Heading, HStack, SkeletonText, Stack, Text } from '@chakra-ui/react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { Link } from "react-router";
import { BURST_MAX_GAP_MS, BURST_MIN_PLAYS, type JobApiJson, type MirrorIssueGroupJson, type MirrorIssueSummaryJson } from "../../../core/Job";
import { fetchMirrorIssuePage, tanQueries } from "../../queries";
import { ActivitySummary } from "../ActivityDetail";
import { ErrorAlert } from "../ErrorAlert";
import { TextMuted } from "../TextMuted";

/** IE "12 Plays (4 with bad timestamps, 9 in 2 bursts)" */
export const issueSummaryText = (summary: MirrorIssueSummaryJson): string => {
    const parts = [
        summary.badTimestamp > 0 ? `${summary.badTimestamp.toLocaleString()} with bad timestamps` : undefined,
        summary.bursts > 0 ? `${summary.burstPlays.toLocaleString()} in ${summary.bursts.toLocaleString()} burst${summary.bursts === 1 ? '' : 's'}` : undefined,
    ].filter(x => x !== undefined);
    return `${summary.plays.toLocaleString()} Play${summary.plays === 1 ? '' : 's'} (${parts.join(', ')})`;
}

const durationText = (ms: number): string => ms < 60_000 ? `${Math.round(ms / 1000)}s` : `${Math.round(ms / 60_000)}m`;

const IssueRow = (props: { group: MirrorIssueGroupJson }) => {
    const {group} = props;
    return (
        <Flex gap="3" alignItems="center" paddingY="2" borderBottomWidth="1px" borderColor="gray.border">
            <ActivitySummary sortBy="played" activity={{play: group.play, updatedAt: `${group.firstPlayedAt}`}}/>
            <Stack gap="1" alignItems="flex-end" flexShrink="0">
                {group.tags.includes('burst') ? <Badge variant="surface" colorPalette="orange">×{group.count.toLocaleString()} within {durationText(group.lastPlayedAt - group.firstPlayedAt)}</Badge> : undefined}
                {group.tags.includes('badTimestamp') ? <Badge variant="surface" colorPalette="red">Bad timestamp</Badge> : undefined}
            </Stack>
        </Flex>
    );
}

const IssueList = (props: { mirrorId: number }) => {
    const {data, error, isPending, hasNextPage, fetchNextPage, isFetchingNextPage} = useInfiniteQuery({
        queryKey: tanQueries.mirrors.issueList(props.mirrorId).queryKey,
        queryFn: (ctx) => fetchMirrorIssuePage(props.mirrorId, ctx.pageParam),
        initialPageParam: 0,
        getNextPageParam: (last) => last.meta.offset + last.data.length < (last.meta.total ?? 0) && last.data.length > 0 ? last.meta.offset + last.meta.limit : undefined,
    });
    if (isPending) {
        return <SkeletonText noOfLines={3}/>;
    }
    if (error !== null) {
        return <ErrorAlert error={error}/>;
    }
    return (
        <Stack gap="2">
            <Stack gap="0">
                {data.pages.flatMap(p => p.data).map((g, i) => <IssueRow key={`${g.firstPlayedAt}-${i}`} group={g}/>)}
            </Stack>
            {hasNextPage ? <HStack><Button size="sm" variant="subtle" loading={isFetchingNextPage} onClick={() => fetchNextPage()}>Load more</Button></HStack> : undefined}
        </Stack>
    );
}

/** Read-only list of mirror Plays that look invalid */
export const MirrorIssues = (props: { mirrorId: number }) => {
    const {data, error, isPending} = useQuery(tanQueries.mirrors.issues(props.mirrorId));
    let content;
    if (isPending) {
        content = <SkeletonText noOfLines={2}/>;
    } else if (error !== null) {
        content = <ErrorAlert error={error}/>;
    } else if (data.plays === 0) {
        content = <TextMuted textStyle="sm">No data issues found.</TextMuted>;
    } else {
        content = <>
            <TextMuted textStyle="sm">
                These Plays look invalid. Nothing was changed: exports send them as they are.
            </TextMuted>
            <DataList.Root orientation="horizontal" size="sm">
                <DataList.Item>
                    <DataList.ItemLabel>Bad timestamps</DataList.ItemLabel>
                    <DataList.ItemValue>
                        <Stack gap="0">
                            <Text>{data.badTimestamp.toLocaleString()} Plays</Text>
                            <TextMuted textStyle="xs">Played before 2 Jan 1970 (UTC). Last.fm files Plays it got no date for under 1 Jan 1970.</TextMuted>
                        </Stack>
                    </DataList.ItemValue>
                </DataList.Item>
                <DataList.Item>
                    <DataList.ItemLabel>Bursts</DataList.ItemLabel>
                    <DataList.ItemValue>
                        <Stack gap="0">
                            <Text>{data.bursts.toLocaleString()} ({data.burstPlays.toLocaleString()} Plays)</Text>
                            <TextMuted textStyle="xs">The same track and artists {BURST_MIN_PLAYS} or more times in a row, each within {BURST_MAX_GAP_MS / 1000} seconds of the last. Often added to carry over a play count from another player.</TextMuted>
                        </Stack>
                    </DataList.ItemValue>
                </DataList.Item>
            </DataList.Root>
            <IssueList mirrorId={props.mirrorId}/>
        </>;
    }
    return (
        <Card.Root variant="subtle">
            <Card.Header><Heading size="lg">Data Issues</Heading></Card.Header>
            <Card.Body><Stack gap="3">{content}</Stack></Card.Body>
        </Card.Root>
    );
}

/** Shown on a job when its range of the mirror has data issues */
export const JobIssuesAlert = (props: { job: Pick<JobApiJson, 'mirror' | 'rangeFrom' | 'rangeTo' | 'importStatus'> }) => {
    const {job} = props;
    const range: [number, number] = [job.rangeFrom === null ? Number.MIN_SAFE_INTEGER : dayjs(job.rangeFrom).valueOf(), dayjs(job.rangeTo).valueOf()];
    // fetched again when the import changes status, not on every imported batch (each fetch reads the whole range)
    const {data} = useQuery(tanQueries.mirrors.issues(job.mirror.id, range, job.importStatus));
    if (data === undefined || data.plays === 0) {
        return null;
    }
    return (
        <Alert.Root status="info">
            <Alert.Indicator/>
            <Alert.Content>
                <Alert.Description>
                    {issueSummaryText(data)} in this job's range look invalid. Exports send them as they are.
                    See them in Mirror <ChakraLink asChild textDecoration="underline"><Link to={`/mirrors/${job.mirror.id}`}>{job.mirror.name}</Link></ChakraLink>.
                </Alert.Description>
            </Alert.Content>
        </Alert.Root>
    );
}
