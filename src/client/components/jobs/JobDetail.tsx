import { Button, Card, Container, DataList, Editable, Flex, Heading, HStack, IconButton, SkeletonText, Stack, Text } from '@chakra-ui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import ky from 'ky';
import { useState, type ReactNode } from 'react';
import { LuCheck, LuPencil, LuX } from 'react-icons/lu';
import { useNavigate, useParams } from "react-router";
import type { JobApiJson } from "../../../core/Job";
import { tanQueries } from "../../queries";
import { baseUrl } from "../../utils";
import { ErrorAlert } from "../ErrorAlert";
import { toaster } from "../Toaster";
import { JobBackButton } from "./JobList";
import { apiErrorMessage, FILE_FORMAT_NAMES, formatJobDate, ImportProgressBar, importOriginText, importProgress, JobStatusBadge, useJobEvents, useSetJob } from "./jobUtils";

type ControlAction = 'start' | 'pause' | 'stop';

const isApiCursor = (cursor: unknown): cursor is { to: number } => cursor !== null && typeof cursor === 'object' && 'to' in cursor && typeof cursor.to === 'number';
const isFileCursor = (cursor: unknown): cursor is { records: number } => cursor !== null && typeof cursor === 'object' && 'records' in cursor && typeof cursor.records === 'number';

const cursorText = (job: JobApiJson): string | undefined => {
    if (job.importStatus === 'completed') {
        return undefined;
    }
    if (isApiCursor(job.importCursor)) {
        return `Scrobbles before ${formatJobDate(new Date(job.importCursor.to).toISOString())}`;
    }
    if (isFileCursor(job.importCursor)) {
        const read = job.runtime.import.progress;
        return `Record ${job.importCursor.records.toLocaleString()}${read !== undefined ? ` (${Math.round(read * 100)}% of file read)` : ''}`;
    }
    return undefined;
}

const formatBytes = (bytes: number): string => {
    const units = ['B', 'KB', 'MB', 'GB'];
    let val = bytes;
    let i = 0;
    while (val >= 1024 && i < units.length - 1) {
        val /= 1024;
        i++;
    }
    return `${val.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

const DataItem = (props: { label: string, children: ReactNode }) => (
    <DataList.Item>
        <DataList.ItemLabel>{props.label}</DataList.ItemLabel>
        <DataList.ItemValue>{props.children}</DataList.ItemValue>
    </DataList.Item>
);

export const JobName = (props: { job: JobApiJson }) => {
    const {job} = props;
    const setJob = useSetJob();
    const {mutate, isPending} = useMutation({
        mutationFn: (name: string) => ky.patch(`jobs/${job.id}`, {baseUrl, json: {name}}).json<JobApiJson>(),
        onSuccess: setJob,
        onError: (e) => toaster.create({type: 'error', title: 'Rename failed', description: apiErrorMessage(e)}),
    });
    return (
        <Editable.Root
            // reset to the saved name when it changes elsewhere
            key={job.name}
            defaultValue={job.name}
            maxLength={100}
            disabled={isPending}
            onValueCommit={(details) => {
                const name = details.value.trim();
                if (name !== '' && name !== job.name) {
                    mutate(name);
                }
            }}
            textStyle="2xl"
            fontWeight="semibold"
            activationMode="dblclick"
        >
            <Editable.Preview/>
            <Editable.Input/>
            <Editable.Control>
                <Editable.EditTrigger asChild><IconButton variant="ghost" size="xs" aria-label="Rename"><LuPencil/></IconButton></Editable.EditTrigger>
                <Editable.CancelTrigger asChild><IconButton variant="outline" size="xs" aria-label="Cancel"><LuX/></IconButton></Editable.CancelTrigger>
                <Editable.SubmitTrigger asChild><IconButton variant="outline" size="xs" aria-label="Save"><LuCheck/></IconButton></Editable.SubmitTrigger>
            </Editable.Control>
        </Editable.Root>
    );
}

export const JobDelete = (props: { job: JobApiJson }) => {
    const {job} = props;
    const [confirming, setConfirming] = useState(false);
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const {mutate, isPending} = useMutation({
        mutationFn: () => ky.delete(`jobs/${job.id}`, {baseUrl}),
        onSuccess: () => {
            queryClient.setQueryData<JobApiJson[]>(tanQueries.jobs.list().queryKey, (old) => old?.filter(x => x.id !== job.id));
            navigate('/jobs');
            queryClient.removeQueries({queryKey: tanQueries.jobs.detail(job.id).queryKey});
        },
        onError: (e) => toaster.create({type: 'error', title: 'Delete failed', description: apiErrorMessage(e)}),
    });
    if (!confirming) {
        return <Button size="sm" variant="subtle" colorPalette="red" onClick={() => setConfirming(true)}>Delete</Button>;
    }
    return (
        <Stack gap="1" alignItems="flex-end">
            <Text textStyle="sm">Delete this job? Scrobbles already imported into the mirror are kept.{job.importFrom.kind === 'file' ? ' An uploaded file is deleted.' : ''}</Text>
            <HStack>
                <Button size="sm" variant="subtle" disabled={isPending} onClick={() => setConfirming(false)}>Cancel</Button>
                <Button size="sm" colorPalette="red" loading={isPending} onClick={() => mutate()}>Delete</Button>
            </HStack>
        </Stack>
    );
}

export const ImportControls = (props: { job: JobApiJson }) => {
    const {job} = props;
    const setJob = useSetJob();
    const {mutate, isPending, variables} = useMutation({
        mutationFn: (action: ControlAction) => ky.post(`jobs/${job.id}/import/${action}`, {baseUrl}).json<JobApiJson>(),
        onSuccess: setJob,
        onError: (e, action) => toaster.create({type: 'error', title: `Could not ${action} import`, description: apiErrorMessage(e)}),
    });
    const running = job.importStatus === 'running';
    return (
        <HStack>
            {!running && job.importStatus !== 'completed' ? <Button size="sm" variant="subtle" colorPalette="green" loading={isPending && variables === 'start'} disabled={isPending} onClick={() => mutate('start')}>{job.importStartedAt === null ? 'Start' : 'Resume'}</Button> : undefined}
            {running ? <Button size="sm" variant="subtle" colorPalette="orange" loading={isPending && variables === 'pause'} disabled={isPending} onClick={() => mutate('pause')}>Pause</Button> : undefined}
            {running ? <Button size="sm" variant="subtle" loading={isPending && variables === 'stop'} disabled={isPending} onClick={() => mutate('stop')}>Stop</Button> : undefined}
        </HStack>
    );
}

export const ImportPanel = (props: { job: JobApiJson }) => {
    const {job} = props;
    const {runtime: {import: runtime}} = job;
    const progress = importProgress(job);
    const position = cursorText(job);
    return (
        <Card.Root variant="subtle">
            <Card.Header>
                <Flex justify="space-between" alignItems="center" gap="2" wrap="wrap">
                    <HStack><Heading size="lg">Import</Heading><JobStatusBadge status={job.importStatus}/></HStack>
                    <ImportControls job={job}/>
                </Flex>
            </Card.Header>
            <Card.Body>
                <Stack gap="4">
                    <Stack gap="1">
                        <ImportProgressBar job={job}/>
                        <Text textStyle="sm">
                            {job.imported.toLocaleString()} new of {job.importFetched.toLocaleString()} fetched
                            {job.importTotal !== null ? ` (${job.importTotal.toLocaleString()} total)` : ''}
                            {progress !== undefined ? ` - ${Math.floor(progress * 100)}%` : ''}
                        </Text>
                    </Stack>
                    {runtime.waiting !== undefined ? <Text textStyle="sm" color="fg.warning">
                        {runtime.waiting}
                        {runtime.retryAttempt !== undefined ? ` (attempt ${runtime.retryAttempt}${runtime.nextRetryAt !== undefined ? `, next try ${formatJobDate(runtime.nextRetryAt)}` : ''})` : ''}
                    </Text> : undefined}
                    {job.importError !== null && job.importStatus === 'failed' ? <ErrorAlert error={job.importError}/> : undefined}
                    <DataList.Root orientation="horizontal" size="sm">
                        <DataItem label="From">
                            {importOriginText(job.importFrom)}
                            {job.importFrom.kind === 'file' ? ` (${FILE_FORMAT_NAMES[job.importFrom.format]}, ${formatBytes(job.importFrom.size)})` : ''}
                        </DataItem>
                        <DataItem label="Mirror">{job.mirror.name}{job.mirror.account !== null ? ` (${job.mirror.account})` : ''}</DataItem>
                        <DataItem label="Range">{job.rangeFrom === null ? 'Beginning' : formatJobDate(job.rangeFrom)} to {formatJobDate(job.rangeTo)}</DataItem>
                        {position !== undefined ? <DataItem label="Position">{position}</DataItem> : undefined}
                        <DataItem label="Started">{formatJobDate(job.importStartedAt)}</DataItem>
                        <DataItem label="Completed">{formatJobDate(job.importCompletedAt)}</DataItem>
                        <DataItem label="Raw data saved">{job.persistInputs ? 'Yes' : 'No'}</DataItem>
                    </DataList.Root>
                </Stack>
            </Card.Body>
        </Card.Root>
    );
}

export const JobDetail = (props: { job: JobApiJson }) => {
    const {job} = props;
    return (
        <Stack gap="4">
            <JobBackButton/>
            <Flex justify="space-between" alignItems="flex-start" gap="2" wrap="wrap">
                <HStack gap="3" minWidth="0">
                    <JobName job={job}/>
                    <JobStatusBadge status={job.status}/>
                </HStack>
                <JobDelete job={job}/>
            </Flex>
            {/* export targets and the job's plays are added below in later phases */}
            <ImportPanel job={job}/>
        </Stack>
    );
}

export const JobDetailFetchable = (props: { jobId: number }) => {
    useJobEvents();
    const { isPending, isError, data, error } = useQuery(tanQueries.jobs.detail(props.jobId));
    if (isPending) {
        return <SkeletonText noOfLines={4}/>;
    }
    if (isError) {
        return <Stack><JobBackButton/><ErrorAlert error={error}/></Stack>;
    }
    return <JobDetail job={data}/>;
}

export const JobDetailRoutable = () => {
    const params = useParams();
    const jobId = Number.parseInt(params.jobId ?? '');
    if (Number.isNaN(jobId)) {
        return <ErrorAlert error={{message: `Not a job id: ${params.jobId}`}}/>;
    }
    return <Container boxSize="full" p="0" maxWidth="4xl"><JobDetailFetchable key={jobId} jobId={jobId}/></Container>;
}
