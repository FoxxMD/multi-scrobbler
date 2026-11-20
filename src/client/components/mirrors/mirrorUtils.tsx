import { Progress, Text } from '@chakra-ui/react';
import { useSSEAnyEvent, useSSEContext } from "@flamefrontend/sse-runtime-react";
import { useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { asCleanupSseEvent, type MsSseEvent } from "../../../core/Api";
import type { JobCleanupProgressJson, MirrorApiJson, MirrorTaskJson } from "../../../core/Job";
import { tanQueries } from "../../queries";
import { toaster } from "../Toaster";
import { formatJobDate } from "../jobs/jobUtils";

/** A date of a mirror range. 0 is the start of time */
export const formatRangeEdge = (ms: number): string => ms <= 0 ? 'Beginning' : formatJobDate(dayjs(ms).toISOString());

export const formatRange = (range: [number, number]): string => `${formatRangeEdge(range[0])} to ${formatRangeEdge(range[1])}`;

export const taskText = (task: MirrorTaskJson): string => {
    const what = task.kind === 'delete' ? 'Deleting the mirror' : `${task.action === 'delete' ? 'Deleting' : 'Compacting'} scrobbles${task.range !== undefined ? ` from ${formatRange(task.range)}` : ''}`;
    return `${what}: ${task.done.toLocaleString()} of ${task.total.toLocaleString()}`;
}

/** Progress of a cleanup. Indeterminate until its total is known */
export const CleanupProgress = (props: { task: Pick<JobCleanupProgressJson, 'done' | 'total'>, text: string }) => {
    const {task, text} = props;
    const value = task.total === 0 ? null : Math.min(100, Math.round(task.done / task.total * 1000) / 10);
    return (
        <>
            <Progress.Root size="sm" value={value} colorPalette="blue">
                <Progress.Track>
                    <Progress.Range/>
                </Progress.Track>
            </Progress.Root>
            <Text textStyle="sm">{text}</Text>
        </>
    );
}

/** Keeps cached mirrors up to date from SSE events, and tells the user when a mirror cleanup finished */
export const useMirrorEvents = () => {
    const queryClient = useQueryClient();
    const client = useSSEContext<MsSseEvent>();
    useSSEAnyEvent(client, (payload) => {
        const event = asCleanupSseEvent(payload.data);
        if (event === undefined || (event.event !== 'mirrorUpdate' && event.event !== 'mirrorDeleted')) {
            return;
        }
        const listKey = tanQueries.mirrors.list().queryKey;
        const detailKey = tanQueries.mirrors.detail(event.mirrorId).queryKey;
        if (event.event === 'mirrorDeleted') {
            queryClient.setQueryData<MirrorApiJson[]>(listKey, (old) => old?.filter(x => x.id !== event.mirrorId));
            queryClient.removeQueries({queryKey: detailKey});
            return;
        }
        const {taskResult, ...data} = event.data as Partial<MirrorApiJson> & {taskResult?: MirrorTaskJson & {error?: string}};
        const merge = (old: MirrorApiJson | undefined) => old === undefined ? old : {...old, ...data};
        queryClient.setQueryData<MirrorApiJson>(detailKey, merge);
        queryClient.setQueryData<MirrorApiJson[]>(listKey, (old) => old?.map(x => x.id === event.mirrorId ? merge(x)! : x));
        if (taskResult !== undefined) {
            // counts and coverage changed, get them fresh
            queryClient.invalidateQueries({queryKey: detailKey});
            queryClient.invalidateQueries({queryKey: listKey});
            if (taskResult.error !== undefined) {
                toaster.create({type: 'error', title: 'Mirror cleanup failed', description: taskResult.error});
            } else if (taskResult.kind === 'cleanup') {
                toaster.create({type: 'success', title: `${taskResult.done.toLocaleString()} scrobbles ${taskResult.action === 'delete' ? 'deleted' : 'compacted'}`});
            }
        }
    });
}
