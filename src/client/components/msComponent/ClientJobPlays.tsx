import { CloseButton, createOverlay, Dialog, Link as ChakraLink, Portal, SkeletonText, Stack, Text } from '@chakra-ui/react';
import { useSSEAnyEvent, useSSEContext } from "@flamefrontend/sse-runtime-react";
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import ky from 'ky';
import { Link } from "react-router";
import { asCleanupSseEvent, asJobSseEvent, type MsSseEvent } from "../../../core/Api";
import type { CleanupAction, ClientJobPlaysSummaryJson, JobCleanupProgressJson } from "../../../core/Job";
import { tanQueries } from "../../queries";
import { baseUrl } from "../../utils";
import { ErrorAlert } from "../ErrorAlert";
import { TextMuted } from "../TextMuted";
import { toaster } from "../Toaster";
import { CleanupButtons } from "../jobs/CleanupButtons";
import { apiErrorMessage, useComponentJobCount } from "../jobs/jobUtils";
import { CleanupProgress } from "../mirrors/mirrorUtils";

/**
 * Keeps a Client's cached job play summary up to date from SSE events, and tells the user when a cleanup of them finished.
 * Mount once per page so a finished cleanup is reported even while its dialog is closed.
 * */
export const useClientJobPlaysEvents = (componentId: number, enabled = true) => {
    const queryClient = useQueryClient();
    const key = tanQueries.mirrors.clientJobPlays(componentId).queryKey;
    const sse = useSSEContext<MsSseEvent>();
    useSSEAnyEvent(sse, (payload) => {
        if (!enabled) {
            return;
        }
        const job = asJobSseEvent(payload.data);
        if (job !== undefined) {
            // an export started or stopped, which decides if a cleanup can run
            const targets = (job.data as {targetUpdates?: Record<string, {status?: string}>}).targetUpdates;
            if (targets !== undefined && Object.values(targets).some(x => x.status !== undefined)) {
                queryClient.invalidateQueries({queryKey: key});
            }
            return;
        }
        const event = asCleanupSseEvent(payload.data);
        if (event?.event === 'playsPurged' && event.componentId === componentId) {
            // a job's own cleanup or delete changed the counts
            queryClient.invalidateQueries({queryKey: key});
            return;
        }
        if (event?.event !== 'clientJobPlaysUpdate' || event.componentId !== componentId) {
            return;
        }
        const {task, taskResult} = event.data as {task: JobCleanupProgressJson | null, taskResult?: {action: CleanupAction, done?: number, skipped?: number, error?: string}};
        queryClient.setQueryData<ClientJobPlaysSummaryJson>(key, (old) => old === undefined ? old : {...old, task});
        if (taskResult !== undefined) {
            queryClient.invalidateQueries({queryKey: key});
            if (taskResult.error !== undefined) {
                toaster.create({type: 'error', title: 'Cleanup failed', description: taskResult.error});
            } else {
                toaster.create({
                    type: 'success',
                    title: `${(taskResult.done ?? 0).toLocaleString()} job scrobble records ${taskResult.action === 'delete' ? 'deleted' : 'compacted'}`,
                    description: (taskResult.skipped ?? 0) > 0 ? `${taskResult.skipped!.toLocaleString()} still queued were skipped.` : undefined,
                });
            }
        }
    });
}

/** Counts of a Client's job scrobble records, read-only */
export const ClientJobPlaysCounts = (props: { data: ClientJobPlaysSummaryJson, jobs?: number }) => {
    const {data, jobs} = props;
    return (
        <Text textStyle="sm">
            {jobs !== undefined ? `${jobs.toLocaleString()} job${jobs === 1 ? '' : 's'}, ` : ''}
            {data.total.toLocaleString()} Plays from import jobs
            {data.orphaned > 0 ? `, ${data.orphaned.toLocaleString()} from deleted jobs` : ''}
            {data.compacted > 0 ? `, ${data.compacted.toLocaleString()} compacted` : ''}
            {data.queued > 0 ? `, ${data.queued.toLocaleString()} still queued` : ''}.
        </Text>
    );
}

/** Fetches and shows the counts of a Client's job scrobble records */
export const ClientJobPlaysCountsFetchable = (props: { componentId: number }) => {
    const {isPending, isError, data, error} = useQuery(tanQueries.mirrors.clientJobPlays(props.componentId));
    const jobs = useComponentJobCount(props.componentId);
    if (isPending) {
        return <SkeletonText noOfLines={1}/>;
    }
    if (isError) {
        return <ErrorAlert error={error}/>;
    }
    return <ClientJobPlaysCounts data={data} jobs={jobs}/>;
}

/** Cleanup of every scrobble record import jobs created in a Client */
export const ClientJobPlays = (props: { componentId: number }) => {
    const {componentId} = props;
    const {isPending, isError, data, error} = useQuery(tanQueries.mirrors.clientJobPlays(componentId));
    const jobs = useComponentJobCount(componentId);

    const {mutate, isPending: mutating} = useMutation({
        mutationFn: (action: CleanupAction) => ky.post(`components/${componentId}/cleanup/job-plays`, {baseUrl, json: {action}}),
        onError: (e) => toaster.create({type: 'error', title: 'Could not start the cleanup', description: apiErrorMessage(e)}),
    });

    if (isPending) {
        return <SkeletonText noOfLines={3}/>;
    }
    if (isError) {
        return <ErrorAlert error={error}/>;
    }
    if (data.total === 0 && data.task === null) {
        return <TextMuted textStyle="sm">This Client has no records from import jobs.</TextMuted>;
    }
    const exporting = data.exportingJobs.length > 0
        ? <>Stop exports to this Client to clean up: {data.exportingJobs.map((j, i) => <span key={j.id}>{i > 0 ? ', ' : ''}<ChakraLink asChild><Link to={`/jobs/${j.id}`}>{j.name}</Link></ChakraLink></span>)}</>
        : undefined;
    return (
        <Stack gap="3">
            <ClientJobPlaysCounts data={data} jobs={jobs}/>
            <TextMuted textStyle="sm">Plays already scrobbled stay on the service. Plays still in the queue are skipped.</TextMuted>
            {data.task !== null ? <CleanupProgress task={data.task} text={`${data.task.action === 'delete' ? 'Deleting' : 'Compacting'}: ${data.task.done.toLocaleString()} of ${data.task.total.toLocaleString()}`}/> : <CleanupButtons
                pending={mutating}
                disabledReason={exporting}
                explain={{
                    compact: 'Remove the raw data and transform details saved with these Plays. The Plays stay in the activity list.',
                    delete: 'Delete these Plays in the MS database. This does not affect downstream scrobbles in the service.',
                }}
                onConfirm={(a) => mutate(a)}
            />}
        </Stack>
    );
}

/** ClientJobPlays in a dialog. Render `clientJobPlaysDialog.Viewport` once on the page */
export const clientJobPlaysDialog = createOverlay<{componentId: number}>((props) => {
    const {componentId, ...rest} = props;
    return (
        <Dialog.Root {...rest}>
            <Portal>
                <Dialog.Backdrop/>
                <Dialog.Positioner>
                    <Dialog.Content>
                        <Dialog.Header>
                            <Dialog.Title>Job Plays</Dialog.Title>
                        </Dialog.Header>
                        <Dialog.Body>
                            <ClientJobPlays componentId={componentId}/>
                        </Dialog.Body>
                        <Dialog.CloseTrigger asChild>
                            <CloseButton size="sm"/>
                        </Dialog.CloseTrigger>
                    </Dialog.Content>
                </Dialog.Positioner>
            </Portal>
        </Dialog.Root>
    );
});
