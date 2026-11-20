import { Card, Heading, Link as ChakraLink, Stack, Text } from '@chakra-ui/react';
import { useSSEAnyEvent, useSSEContext } from "@flamefrontend/sse-runtime-react";
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import ky from 'ky';
import { Link } from "react-router";
import { asCleanupSseEvent, type MsSseEvent } from "../../../core/Api";
import type { CleanupAction, ClientJobPlaysSummaryJson, JobCleanupProgressJson } from "../../../core/Job";
import { tanQueries } from "../../queries";
import { baseUrl } from "../../utils";
import { TextMuted } from "../TextMuted";
import { toaster } from "../Toaster";
import { CleanupButtons } from "../jobs/CleanupButtons";
import { apiErrorMessage } from "../jobs/jobUtils";
import { CleanupProgress } from "../mirrors/mirrorUtils";

/** Cleanup of every scrobble record import jobs created in a Client. Hidden while there are none */
export const ClientJobPlays = (props: { componentId: number }) => {
    const {componentId} = props;
    const queryClient = useQueryClient();
    const key = tanQueries.mirrors.clientJobPlays(componentId).queryKey;
    const {data} = useQuery(tanQueries.mirrors.clientJobPlays(componentId));

    const sse = useSSEContext<MsSseEvent>();
    useSSEAnyEvent(sse, (payload) => {
        const event = asCleanupSseEvent(payload.data);
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

    const {mutate, isPending} = useMutation({
        mutationFn: (action: CleanupAction) => ky.post(`components/${componentId}/cleanup/job-plays`, {baseUrl, json: {action}}),
        onError: (e) => toaster.create({type: 'error', title: 'Could not start the cleanup', description: apiErrorMessage(e)}),
    });

    if (data === undefined || (data.total === 0 && data.task === null)) {
        return null;
    }
    const exporting = data.exportingJobs.length > 0
        ? <>Stop exports to this Client to clean up: {data.exportingJobs.map((j, i) => <span key={j.id}>{i > 0 ? ', ' : ''}<ChakraLink asChild><Link to={`/jobs/${j.id}`}>{j.name}</Link></ChakraLink></span>)}</>
        : undefined;
    return (
        <Card.Root variant="subtle" width="100%">
            <Card.Header><Heading size="md">Job Scrobble Records</Heading></Card.Header>
            <Card.Body>
                <Stack gap="3">
                    <Text textStyle="sm">
                        {data.total.toLocaleString()} records from import jobs
                        {data.orphaned > 0 ? `, ${data.orphaned.toLocaleString()} of deleted jobs` : ''}
                        {data.compacted > 0 ? `, ${data.compacted.toLocaleString()} compacted` : ''}
                        {data.queued > 0 ? `, ${data.queued.toLocaleString()} still queued` : ''}.
                    </Text>
                    <TextMuted textStyle="sm">Scrobbles already sent stay on the service. Records still in the queue are skipped.</TextMuted>
                    {data.task !== null ? <CleanupProgress task={data.task} text={`${data.task.action === 'delete' ? 'Deleting' : 'Compacting'}: ${data.task.done.toLocaleString()} of ${data.task.total.toLocaleString()}`}/> : <CleanupButtons
                        pending={isPending}
                        disabledReason={exporting}
                        explain={{
                            compact: 'Remove the raw data and transform details saved with these records. The records stay in the activity list.',
                            delete: 'Delete these records. They disappear from the activity list.',
                        }}
                        onConfirm={(a) => mutate(a)}
                    />}
                </Stack>
            </Card.Body>
        </Card.Root>
    );
}
