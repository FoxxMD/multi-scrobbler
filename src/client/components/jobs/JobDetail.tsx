import { Box, Button, Card, Link as ChakraLink, RadioGroup, Code, Collapsible, Container, DataList, Editable, Flex, Heading, HStack, IconButton, NumberInput, Separator, SkeletonText, Stack, Text } from '@chakra-ui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import ky from 'ky';
import { useState, type ReactNode } from 'react';
import { LuCheck, LuPencil, LuX } from 'react-icons/lu';
import { Link, useNavigate, useParams } from "react-router";
import { type CleanupAction, EXPORT_QUEUE_LIMIT_MAX, type JobApiJson, type JobTargetApiJson } from "../../../core/Job";
import { capitalize } from "../../../core/StringUtils";
import { TextMuted } from "../TextMuted";
import { CleanupProgress, taskText, useMirrorEvents } from "../mirrors/mirrorUtils";
import { CleanupButtons } from "./CleanupButtons";
import { tanQueries } from "../../queries";
import { baseUrl } from "../../utils";
import { ErrorAlert } from "../ErrorAlert";
import { toaster } from "../Toaster";
import { JobBackButton } from "./JobList";
import { apiErrorMessage, exportProgress, ExportProgressBar, FILE_FORMAT_NAMES, formatJobDate, ImportProgressBar, importOriginText, importProgress, JobStatusBadge, useJobEvents, useSetJob } from "./jobUtils";

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

type KeepOrCleanup = 'keep' | CleanupAction;

const KeepChoice = (props: { label: string, help: string, value: KeepOrCleanup, onChange: (v: KeepOrCleanup) => void }) => (
    <Stack gap="1">
        <Text textStyle="sm" fontWeight="semibold">{props.label}</Text>
        <TextMuted textStyle="xs">{props.help}</TextMuted>
        <RadioGroup.Root size="sm" value={props.value} onValueChange={(d) => props.onChange(d.value as KeepOrCleanup)}>
            <HStack gap="4">
                {(['keep', 'compact', 'delete'] as const).map(x => <RadioGroup.Item key={x} value={x}>
                    <RadioGroup.ItemHiddenInput/><RadioGroup.ItemIndicator/><RadioGroup.ItemText>{capitalize(x)}</RadioGroup.ItemText>
                </RadioGroup.Item>)}
            </HStack>
        </RadioGroup.Root>
    </Stack>
);

export const JobDelete = (props: { job: JobApiJson }) => {
    const {job} = props;
    const [confirming, setConfirming] = useState(false);
    const [historical, setHistorical] = useState<KeepOrCleanup>('keep');
    const [scrobbles, setScrobbles] = useState<KeepOrCleanup>('keep');
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const {mutate, isPending} = useMutation({
        mutationFn: () => ky.delete(`jobs/${job.id}`, {baseUrl, searchParams: {historical, scrobbles}}),
        onSuccess: (res) => {
            if (res.status === 204) {
                queryClient.setQueryData<JobApiJson[]>(tanQueries.jobs.list().queryKey, (old) => old?.filter(x => x.id !== job.id));
                queryClient.removeQueries({queryKey: tanQueries.jobs.detail(job.id).queryKey});
            } else {
                toaster.create({type: 'info', title: `Deleting ${job.name}`, description: 'The job disappears once its data is cleaned up.'});
            }
            navigate('/jobs');
        },
        onError: (e) => toaster.create({type: 'error', title: 'Delete failed', description: apiErrorMessage(e)}),
    });
    if (job.runtime.deleting === true) {
        return <Text textStyle="sm" color="fg.warning">Deleting...</Text>;
    }
    if (!confirming) {
        return <Button size="sm" variant="subtle" colorPalette="red" onClick={() => setConfirming(true)}>Delete</Button>;
    }
    return (
        <Card.Root variant="outline" size="sm" maxWidth="md">
            <Card.Body>
                <Stack gap="3">
                    <Text textStyle="sm">Delete this job? It is stopped first.{job.importFrom.kind === 'file' ? ' An uploaded file is deleted.' : ''}</Text>
                    <KeepChoice label="Mirror data" help="Scrobbles in the mirror played in this job's range. Other jobs may use them too." value={historical} onChange={setHistorical}/>
                    {job.targets.length > 0 ? <KeepChoice label="Scrobble records in Clients" help="What the Clients recorded for this job's scrobbles. Scrobbles already sent stay on the services." value={scrobbles} onChange={setScrobbles}/> : undefined}
                    <HStack justify="flex-end">
                        <Button size="sm" variant="subtle" disabled={isPending} onClick={() => setConfirming(false)}>Cancel</Button>
                        <Button size="sm" colorPalette="red" loading={isPending} onClick={() => mutate()}>Delete</Button>
                    </HStack>
                </Stack>
            </Card.Body>
        </Card.Root>
    );
}

const CleanupRow = (props: { title: string, description: ReactNode, children: ReactNode }) => (
    <Stack gap="2">
        <Text fontWeight="semibold">{props.title}</Text>
        <TextMuted textStyle="sm">{props.description}</TextMuted>
        {props.children}
    </Stack>
);

export const CleanupPanel = (props: { job: JobApiJson }) => {
    const {job} = props;
    const mirror = useQuery(tanQueries.mirrors.detail(job.mirror.id));
    const mirrorTask = mirror.data?.task ?? null;
    const historical = useMutation({
        mutationFn: (action: CleanupAction) => ky.post(`jobs/${job.id}/cleanup/historical`, {baseUrl, json: {action}}),
        onSuccess: () => mirror.refetch(),
        onError: (e) => toaster.create({type: 'error', title: 'Could not clean up mirror data', description: apiErrorMessage(e)}),
    });
    const scrobbles = useMutation({
        mutationFn: (action: CleanupAction) => ky.post(`jobs/${job.id}/cleanup/scrobbles`, {baseUrl, json: {action}}),
        onSuccess: (_, action) => toaster.create({type: 'info', title: `${action === 'delete' ? 'Deleting' : 'Compacting'} this job's scrobble records`}),
        onError: (e) => toaster.create({type: 'error', title: 'Could not clean up scrobble records', description: apiErrorMessage(e)}),
    });
    const cleanup = job.runtime.cleanup;
    const exporting = job.targets.some(x => x.status === 'running');
    const busy = job.status === 'running' ? 'Stop the job to clean up.' : undefined;
    return (
        <Card.Root variant="subtle">
            <Card.Header><Heading size="lg">Clean Up</Heading></Card.Header>
            <Card.Body>
                <Stack gap="5">
                    <CleanupRow title="Mirror data" description={<>The {job.mirrorPlaysInRange.toLocaleString()} scrobbles in <ChakraLink asChild><Link to={`/mirrors/${job.mirror.id}`}>{job.mirror.name}</Link></ChakraLink> played in this job's range. Other jobs using the mirror may need them.</>}>
                        {mirrorTask !== null ? <CleanupProgress task={mirrorTask} text={taskText(mirrorTask)}/> : <CleanupButtons
                            pending={historical.isPending}
                            disabledReason={busy}
                            explain={{
                                compact: "Remove the raw Last.fm data saved with these scrobbles. They stay in the mirror and can still be exported.",
                                delete: "Delete these scrobbles from the mirror. Importing this range again fetches them again.",
                            }}
                            onConfirm={(a) => historical.mutate(a)}
                        />}
                    </CleanupRow>
                    {job.targets.length > 0 ? <CleanupRow title="Scrobble records in Clients" description="What the Clients recorded for the scrobbles this job sent them, shown in their activity lists. Scrobbles already sent stay on the services.">
                        {cleanup !== undefined ? <CleanupProgress task={cleanup} text={`${cleanup.action === 'delete' ? 'Deleting' : 'Compacting'}: ${cleanup.done.toLocaleString()} of ${cleanup.total.toLocaleString()}`}/> : <CleanupButtons
                            pending={scrobbles.isPending}
                            disabledReason={exporting ? 'Stop the exports to clean up.' : undefined}
                            explain={{
                                compact: "Remove the raw data and transform details saved with these records. The records stay.",
                                delete: "Delete these records from the Clients. Scrobbles still waiting in a Client's queue are removed from it and won't be sent.",
                            }}
                            onConfirm={(a) => scrobbles.mutate(a)}
                        />}
                    </CleanupRow> : undefined}
                </Stack>
            </Card.Body>
        </Card.Root>
    );
}

/**
 * Start/Pause/Stop for one process.
 * @param path under the job, IE `import` or `targets/3`. Empty for the whole job
 * */
export const ProcessControls = (props: { job: JobApiJson, path: string, label: string, status: JobApiJson['status'], started: boolean, size?: 'xs' | 'sm' }) => {
    const {job, path, label, status, started, size = 'sm'} = props;
    const setJob = useSetJob();
    const queryClient = useQueryClient();
    const {mutate, isPending, variables} = useMutation({
        mutationFn: (action: ControlAction) => ky.post(`jobs/${job.id}/${path === '' ? '' : `${path}/`}${action}`, {baseUrl}).json<JobApiJson>(),
        onSuccess: setJob,
        // an SSE event sent before the action can arrive after this response, refetch so a stale status can't stick
        onSettled: () => Promise.all([
            queryClient.invalidateQueries({queryKey: tanQueries.jobs.detail(job.id).queryKey}),
            queryClient.invalidateQueries({queryKey: tanQueries.jobs.list().queryKey}),
        ]),
        onError: (e, action) => toaster.create({type: 'error', title: `Could not ${action} ${label}`, description: apiErrorMessage(e)}),
    });
    const running = status === 'running';
    return (
        <HStack>
            {!running && status !== 'completed' ? <Button size={size} variant="subtle" colorPalette="green" loading={isPending && variables === 'start'} disabled={isPending} onClick={() => mutate('start')}>{started ? 'Resume' : 'Start'}</Button> : undefined}
            {running ? <Button size={size} variant="subtle" colorPalette="orange" loading={isPending && variables === 'pause'} disabled={isPending} onClick={() => mutate('pause')}>Pause</Button> : undefined}
            {running ? <Button size={size} variant="subtle" loading={isPending && variables === 'stop'} disabled={isPending} onClick={() => mutate('stop')}>Stop</Button> : undefined}
        </HStack>
    );
}

export const ImportControls = (props: { job: JobApiJson }) => <ProcessControls job={props.job} path="import" label="import" status={props.job.importStatus} started={props.job.importStartedAt !== null}/>;

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
                    {job.importFrom.kind === 'mirror' ? <Text textStyle="sm">Nothing to import. Exports use the {job.mirrorPlaysInRange.toLocaleString()} scrobbles already in the mirror.</Text> : <Stack gap="1">
                        <ImportProgressBar job={job}/>
                        <Text textStyle="sm">
                            {job.imported.toLocaleString()} new of {job.importFetched.toLocaleString()} fetched
                            {job.importTotal !== null ? ` (${job.importTotal.toLocaleString()} total)` : ''}
                            {progress !== undefined ? ` - ${Math.floor(progress * 100)}%` : ''}
                        </Text>
                    </Stack>}
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
                        <DataItem label="Mirror">
                            <ChakraLink asChild><Link to={`/mirrors/${job.mirror.id}`}>{job.mirror.name}</Link></ChakraLink>{job.mirror.account !== null ? ` (${job.mirror.account})` : ''}
                            {job.importFrom.kind === 'file' && job.importFrom.format === 'lastfm-benjamin-csv' ? <Text as="span" color="fg.muted"> - benjaminbenben files always get a new mirror of their own</Text> : undefined}
                        </DataItem>
                        <DataItem label="Range">{job.rangeFrom === null ? 'Beginning' : formatJobDate(job.rangeFrom)} to {formatJobDate(job.rangeTo)}</DataItem>
                        {position !== undefined ? <DataItem label="Position">{position}</DataItem> : undefined}
                        {job.importFrom.kind !== 'mirror' ? <DataItem label="Started">{formatJobDate(job.importStartedAt)}</DataItem> : undefined}
                        <DataItem label="Completed">{formatJobDate(job.importCompletedAt)}</DataItem>
                        {job.importFrom.kind !== 'mirror' ? <DataItem label="Raw data saved">{job.persistInputs ? 'Yes' : 'No'}</DataItem> : undefined}
                    </DataList.Root>
                </Stack>
            </Card.Body>
        </Card.Root>
    );
}


const STAT_LABELS: [string, string][] = [['scrobbled', 'scrobbled'], ['duped', 'already scrobbled'], ['failed', 'failed'], ['queued', 'queued'], ['discarded', 'discarded']];

const statsText = (stats: JobTargetApiJson['stats']): string | undefined => {
    if (stats === null) {
        return undefined;
    }
    const parts = STAT_LABELS.filter(([key]) => (stats[key] ?? 0) > 0).map(([key, label]) => `${stats[key]!.toLocaleString()} ${label}`);
    return parts.length > 0 ? parts.join(', ') : undefined;
}

export const ExportTarget = (props: { job: JobApiJson, target: JobTargetApiJson }) => {
    const {job, target} = props;
    const runtime = job.runtime.exports[target.id];
    const progress = exportProgress(job, target);
    const queuedLeft = target.stats?.queued ?? 0;
    const stats = statsText(target.stats);
    return (
        <Stack gap="2">
            <Flex justify="space-between" alignItems="center" gap="2" wrap="wrap">
                <HStack minWidth="0">
                    <Text fontWeight="semibold" truncate>{target.name ?? `Client ${target.componentId} (not configured)`}</Text>
                    {target.type !== undefined ? <Text color="fg.muted" textStyle="sm">{target.type}</Text> : undefined}
                    <JobStatusBadge status={target.status}/>
                </HStack>
                <ProcessControls job={job} path={`targets/${target.id}`} label="export" status={target.status} started={target.startedAt !== null} size="xs"/>
            </Flex>
            <ExportProgressBar job={job} target={target}/>
            <Text textStyle="sm">
                {target.exported.toLocaleString()} exported{job.importStatus === 'completed' ? ` of ${job.mirrorPlaysInRange.toLocaleString()}` : ''}
                {progress !== undefined ? ` - ${Math.floor(progress * 100)}%` : ''}
                {target.cursor !== null && target.status !== 'completed' ? `, up to ${formatJobDate(new Date(target.cursor.playedAt).toISOString())}` : ''}
            </Text>
            {stats !== undefined ? <Text textStyle="sm" color="fg.muted">In the Client: {stats}</Text> : undefined}
            {target.exported > target.queued ? <Text textStyle="sm" color="fg.muted">{(target.exported - target.queued).toLocaleString()} were already in the Client and were skipped.</Text> : undefined}
            {runtime?.waiting !== undefined ? <Text textStyle="sm" color="fg.warning">{runtime.waiting}</Text> : undefined}
            {target.status !== 'running' && target.status !== 'completed' && queuedLeft > 0 ? <Text textStyle="sm" color="fg.muted">{queuedLeft.toLocaleString()} queued scrobbles will still be sent to the Client.</Text> : undefined}
            {target.status === 'running' && target.breaker.failedInARow > 0 ? <Text textStyle="sm" color="fg.warning">{target.breaker.failedInARow} failed in a row, the export stops at {Math.max(job.exportQueueLimit, 10)}.</Text> : undefined}
            {target.error !== null && target.status === 'failed' ? <ErrorAlert error={target.error}/> : undefined}
        </Stack>
    );
}

export const QueueLimit = (props: { job: JobApiJson }) => {
    const {job} = props;
    const setJob = useSetJob();
    const [value, setValue] = useState(job.exportQueueLimit);
    const {mutate, isPending} = useMutation({
        mutationFn: (exportQueueLimit: number) => ky.patch(`jobs/${job.id}`, {baseUrl, json: {exportQueueLimit}}).json<JobApiJson>(),
        onSuccess: setJob,
        onError: (e) => toaster.create({type: 'error', title: 'Could not change the queue limit', description: apiErrorMessage(e)}),
    });
    const valid = Number.isInteger(value) && value >= 1 && value <= EXPORT_QUEUE_LIMIT_MAX;
    return (
        <HStack>
            <NumberInput.Root size="xs" width="6rem" min={1} max={EXPORT_QUEUE_LIMIT_MAX} value={String(value)} onValueChange={(d) => setValue(d.valueAsNumber)}>
                <NumberInput.Control/>
                <NumberInput.Input aria-label="Queue limit"/>
            </NumberInput.Root>
            {value !== job.exportQueueLimit ? <Button size="xs" variant="subtle" disabled={!valid} loading={isPending} onClick={() => mutate(value)}>Save</Button> : undefined}
        </HStack>
    );
}

const transformSourceText = (job: JobApiJson): string => {
    const src = job.transformSource;
    if (src === null) {
        return 'None';
    }
    return src.kind === 'preset' ? `Preset: ${src.name}` : `Copied from ${src.componentName} (${src.hook})`;
}

export const ExportPanel = (props: { job: JobApiJson }) => {
    const {job} = props;
    return (
        <Card.Root variant="subtle">
            <Card.Header>
                <Heading size="lg">Export</Heading>
            </Card.Header>
            <Card.Body>
                <Stack gap="4">
                    <DataList.Root orientation="horizontal" size="sm">
                        <DataItem label="Order">{job.exportOrder === 'desc' ? 'Newest first' : 'Oldest first'}</DataItem>
                        <DataItem label="Queue limit"><QueueLimit key={job.exportQueueLimit} job={job}/></DataItem>
                        <DataItem label="Transforms">
                            <Stack gap="1">
                                <Text>{transformSourceText(job)}</Text>
                                {job.transformOptions !== null ? <Collapsible.Root>
                                    <Collapsible.Trigger asChild><Button size="xs" variant="ghost" alignSelf="flex-start" px="0">Show stages</Button></Collapsible.Trigger>
                                    <Collapsible.Content><Code as="pre" display="block" whiteSpace="pre-wrap" p="2" textStyle="xs">{JSON.stringify(job.transformOptions, null, 2)}</Code></Collapsible.Content>
                                </Collapsible.Root> : undefined}
                            </Stack>
                        </DataItem>
                    </DataList.Root>
                    {job.targets.map((t, i) => <Box key={t.id}>
                        {i > 0 ? <Separator mb="4"/> : undefined}
                        <ExportTarget job={job} target={t}/>
                    </Box>)}
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
                <HStack alignItems="flex-start">
                    {job.targets.length > 0 ? <ProcessControls job={job} path="" label="job" status={job.status} started={job.importStartedAt !== null || job.targets.some(x => x.startedAt !== null)}/> : undefined}
                    <JobDelete job={job}/>
                </HStack>
            </Flex>
            {job.runtime.deleting === true ? <Text color="fg.warning">This job is being deleted.</Text> : undefined}
            <ImportPanel job={job}/>
            {job.targets.length > 0 ? <ExportPanel job={job}/> : undefined}
            <CleanupPanel job={job}/>
        </Stack>
    );
}

export const JobDetailFetchable = (props: { jobId: number }) => {
    useJobEvents();
    useMirrorEvents();
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
