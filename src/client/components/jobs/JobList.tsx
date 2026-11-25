import { Box, Button, Card, Container, Flex, Heading, HStack, LinkBox, LinkOverlay, SkeletonText, Stack, Text, Wrap } from '@chakra-ui/react';
import { useQuery } from '@tanstack/react-query';
import { Link } from "react-router";
import type { JobApiJson } from "../../../core/Job";
import { tanQueries } from "../../queries";
import { ErrorAlert } from "../ErrorAlert";
import { MSErrorBoundary } from "../ErrorBoundary";
import { TextMuted } from "../TextMuted";
import { importCountsText, ImportProgressBar, importOriginText, JobStatusBadge, useJobEvents } from "./jobUtils";

export const JobSummary = (props: { job: JobApiJson }) => {
    const {job} = props;
    const waiting = job.runtime.import.waiting;
    return (
        <Card.Root variant="subtle">
            <LinkBox>
                <Card.Header>
                    <Flex justify="space-between" alignItems="flex-start" gap="2">
                        {/* flex items don't shrink below their content by default, which would push the badge out */}
                        <LinkOverlay asChild flex="1" minWidth="0">
                            <Link to={`/jobs/${job.id}`}><Heading truncate>{job.name}</Heading></Link>
                        </LinkOverlay>
                        <JobStatusBadge status={job.status} flexShrink="0"/>
                    </Flex>
                    <TextMuted textStyle="sm" truncate>{importOriginText(job.importFrom)}</TextMuted>
                    <TextMuted textStyle="sm" truncate>Mirror: {job.mirror.name}</TextMuted>
                </Card.Header>
                <Card.Body pt="3">
                    <Stack gap="2">
                        {job.importFrom.kind !== 'mirror' ? <>
                            <ImportProgressBar job={job}/>
                            <Text textStyle="sm">{importCountsText(job)}</Text>
                        </> : undefined}
                        {job.runtime.deleting === true ? <Text textStyle="sm" color="fg.warning">Deleting...</Text> : undefined}
                        {waiting !== undefined ? <Text textStyle="sm" color="fg.warning">Waiting: {waiting}</Text> : undefined}
                        {job.targets.length > 0 ? <Wrap gap="2" alignItems="center">
                            <TextMuted textStyle="sm">Export:</TextMuted>
                            {job.targets.map(t => <HStack key={t.id} gap="1">
                                <Text textStyle="sm">{t.name ?? `Client ${t.componentId}`}</Text>
                                <JobStatusBadge status={t.status} size="sm"/>
                            </HStack>)}
                        </Wrap> : undefined}
                    </Stack>
                </Card.Body>
            </LinkBox>
        </Card.Root>
    );
}

export const JobList = (props: { jobs: JobApiJson[] }) => (
        <Container boxSize="full" p="0" maxWidth="8xl">
            <Stack gap="3">
                <Flex justify="space-between" alignItems="center">
                    <Box>
                        <Heading size="2xl">Jobs</Heading>
                        <TextMuted>Jobs created to import data to Mirrors or Export Plays to Clients.</TextMuted>
                    </Box>
                    <Button asChild size="sm" variant="subtle" colorPalette="blue">
                        <Link to="/jobs/new">New Job</Link>
                    </Button>
                </Flex>
                {props.jobs.length === 0 ? <TextMuted>No jobs yet. Create one to import your Last.fm history and export it to your Clients.</TextMuted> : undefined}
                <Box gridColumnGap="2" gridRowGap="2" display="grid" gridTemplateColumns={{mdDown: "repeat(1, minmax(295px, 1fr))", base: "repeat(auto-fill, minmax(295px, 1fr))"}}>
                    {props.jobs.map(x => <MSErrorBoundary key={x.id}><JobSummary job={x}/></MSErrorBoundary>)}
                </Box>
            </Stack>
        </Container>
);

export const JobListFetchable = () => {
    useJobEvents();
    const { isPending, isError, data, error } = useQuery(tanQueries.jobs.list());

    if (isPending) {
        return (
            <Card.Root variant="subtle">
                <Card.Header>
                    <SkeletonText noOfLines={2}/>
                </Card.Header>
            </Card.Root>
        );
    }
    if (isError) {
        return <ErrorAlert error={error}/>;
    }
    return <JobList jobs={data}/>;
}

export const JobBackButton = () => <HStack><Button asChild size="xs" variant="ghost"><Link to="/jobs">← Jobs</Link></Button></HStack>;
