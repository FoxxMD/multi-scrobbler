import { Box, Button, Card, Container, Flex, Heading, HStack, LinkBox, LinkOverlay, SkeletonText, Stack, Text } from '@chakra-ui/react';
import { useQuery } from '@tanstack/react-query';
import { Link } from "react-router";
import type { JobApiJson } from "../../../core/Job";
import { tanQueries } from "../../queries";
import { ErrorAlert } from "../ErrorAlert";
import { MSErrorBoundary } from "../ErrorBoundary";
import { TextMuted } from "../TextMuted";
import { ImportProgressBar, importOriginText, JobStatusBadge, useJobEvents } from "./jobUtils";

export const JobSummary = (props: { job: JobApiJson }) => {
    const {job} = props;
    const waiting = job.runtime.import.waiting;
    return (
        <Card.Root variant="subtle">
            <LinkBox>
                <Card.Header>
                    <Flex justify="space-between" gap="2">
                        <LinkOverlay asChild>
                            <Link to={`/jobs/${job.id}`}><Heading truncate>{job.name}</Heading></Link>
                        </LinkOverlay>
                        <JobStatusBadge status={job.status} flexShrink="0"/>
                    </Flex>
                    <TextMuted textStyle="sm" truncate>{importOriginText(job.importFrom)}</TextMuted>
                    <TextMuted textStyle="sm" truncate>Mirror: {job.mirror.name}</TextMuted>
                </Card.Header>
                <Card.Body px="6" py="3">
                    <Stack gap="2">
                        <ImportProgressBar job={job}/>
                        <Text textStyle="sm">{job.imported.toLocaleString()} new of {job.importFetched.toLocaleString()} fetched{job.importTotal !== null ? ` (${job.importTotal.toLocaleString()} total)` : ''}</Text>
                        {waiting !== undefined ? <Text textStyle="sm" color="fg.warning">Waiting: {waiting}</Text> : undefined}
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
                    <Heading size="2xl">Import Jobs</Heading>
                    <Button asChild size="sm" variant="subtle" colorPalette="blue">
                        <Link to="/jobs/new">New Import</Link>
                    </Button>
                </Flex>
                {props.jobs.length === 0 ? <TextMuted>No jobs yet. Create one to import your Last.fm history.</TextMuted> : undefined}
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
