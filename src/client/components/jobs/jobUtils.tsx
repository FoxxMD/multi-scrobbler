import { Badge, Progress, type BadgeProps } from '@chakra-ui/react';
import { useSSEAnyEvent, useSSEContext } from "@flamefrontend/sse-runtime-react";
import { useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { HTTPError } from 'ky';
import { asJobSseEvent, type MsSseEvent } from "../../../core/Api";
import { deriveJobStatus, type JobApiJson, type JobImportOriginJson, type JobProcessStatus, type JobTargetApiJson, type LastfmFileFormat } from "../../../core/Job";
import { capitalize } from "../../../core/StringUtils";
import { tanQueries } from "../../queries";
import { shortTodayAwareFormat } from "../../utils";

const statusPalette: Record<JobProcessStatus, BadgeProps['colorPalette']> = {
    idle: 'gray',
    running: 'blue',
    paused: 'orange',
    stopped: 'orange',
    failed: 'red',
    completed: 'green',
};

export const JobStatusBadge = (props: BadgeProps & { status: JobProcessStatus }) => {
    const {status, ...rest} = props;
    return <Badge variant="surface" colorPalette={statusPalette[status]} {...rest}>{capitalize(status)}</Badge>;
}

export const FILE_FORMAT_NAMES: Record<LastfmFileFormat, string> = {
    'lastfm-ghan-json': 'lastfm.ghan.nl JSON',
    'lastfm-ghan-csv': 'lastfm.ghan.nl CSV',
    'lastfm-benjamin-csv': 'benjaminbenben CSV',
};

export const importOriginText = (origin: JobImportOriginJson): string => {
    switch (origin.kind) {
        case 'component':
            return origin.componentId === null ? 'Last.fm (component removed)' : `Last.fm API: ${origin.name ?? `component ${origin.componentId}`}`;
        case 'file':
            return `File: ${origin.originalName}`;
        default:
            return 'Existing mirror';
    }
}

/** Import progress from 0 to 1, undefined when it can't be known */
export const importProgress = (job: Pick<JobApiJson, 'importStatus' | 'importTotal' | 'importFetched' | 'runtime'>): number | undefined => {
    if (job.importStatus === 'completed') {
        return 1;
    }
    // files report how much of the file was read, only while running
    if (job.runtime.import.progress !== undefined) {
        return job.runtime.import.progress;
    }
    if (job.importTotal !== null && job.importTotal > 0) {
        return Math.min(1, job.importFetched / job.importTotal);
    }
    return undefined;
}

export const ImportProgressBar = (props: { job: JobApiJson } & Omit<Progress.RootProps, 'value'>) => {
    const {job, ...rest} = props;
    const progress = importProgress(job);
    // indeterminate while running without a known total
    const value = progress === undefined ? (job.importStatus === 'running' ? null : 0) : Math.round(progress * 1000) / 10;
    return (
        <Progress.Root size="sm" value={value} colorPalette={statusPalette[job.importStatus]} {...rest}>
            <Progress.Track>
                <Progress.Range/>
            </Progress.Track>
        </Progress.Root>
    );
}

export const formatJobDate = (date: string | null | undefined): string => date === null || date === undefined ? '-' : shortTodayAwareFormat(dayjs(date));

/** The `error` message the job API returns, else the error's own message */
export const apiErrorMessage = (e: unknown): string => {
    if (e instanceof HTTPError && e.data !== null && typeof e.data === 'object' && 'error' in e.data && typeof e.data.error === 'string') {
        return e.data.error;
    }
    return e instanceof Error ? e.message : String(e);
}

/** Overall status from the import and every export */
export const jobStatus = (job: Pick<JobApiJson, 'importStatus' | 'targets'>) => deriveJobStatus([job.importStatus, ...job.targets.map(x => x.status)]);

/** Merge SSE job data into a cached job. Status is derived from the process statuses, which updates may change */
export const mergeJobUpdate = (old: JobApiJson, data: Record<string, unknown>): JobApiJson => {
    const {targetUpdates, ...rest} = data as {targetUpdates?: Record<string, Partial<JobTargetApiJson>>};
    const next = {...old, ...rest} as JobApiJson;
    if (targetUpdates !== undefined) {
        next.targets = old.targets.map(t => targetUpdates[t.id] !== undefined ? {...t, ...targetUpdates[t.id]} : t);
    }
    next.status = jobStatus(next);
    return next;
}

/** Export progress from 0 to 1, undefined when it can't be known yet */
export const exportProgress = (job: Pick<JobApiJson, 'importStatus' | 'mirrorPlaysInRange'>, target: Pick<JobTargetApiJson, 'status' | 'exported'>): number | undefined => {
    if (target.status === 'completed') {
        return 1;
    }
    // the number of mirror plays to export is only final once the import is done
    if (job.importStatus !== 'completed' || job.mirrorPlaysInRange === 0) {
        return undefined;
    }
    return Math.min(1, target.exported / job.mirrorPlaysInRange);
}

export const ExportProgressBar = (props: { job: JobApiJson, target: JobTargetApiJson } & Omit<Progress.RootProps, 'value'>) => {
    const {job, target, ...rest} = props;
    const progress = exportProgress(job, target);
    const value = progress === undefined ? (target.status === 'running' ? null : 0) : Math.round(progress * 1000) / 10;
    return (
        <Progress.Root size="sm" value={value} colorPalette={statusPalette[target.status]} {...rest}>
            <Progress.Track>
                <Progress.Range/>
            </Progress.Track>
        </Progress.Root>
    );
}

/** Keeps cached job list and details up to date from SSE events */
export const useJobEvents = () => {
    const queryClient = useQueryClient();
    const client = useSSEContext<MsSseEvent>();
    useSSEAnyEvent(client, (payload) => {
        const event = asJobSseEvent(payload.data);
        if (event === undefined) {
            return;
        }
        const listKey = tanQueries.jobs.list().queryKey;
        const detailKey = tanQueries.jobs.detail(event.jobId).queryKey;
        if (event.event === 'jobDeleted') {
            queryClient.setQueryData<JobApiJson[]>(listKey, (old) => old?.filter(x => x.id !== event.jobId));
            queryClient.removeQueries({queryKey: detailKey});
            return;
        }
        const list = queryClient.getQueryData<JobApiJson[]>(listKey);
        if (list !== undefined && !list.some(x => x.id === event.jobId)) {
            // created somewhere else, the full job is needed
            queryClient.invalidateQueries({queryKey: listKey});
        } else {
            queryClient.setQueryData<JobApiJson[]>(listKey, (old) => old?.map(x => x.id === event.jobId ? mergeJobUpdate(x, event.data) : x));
        }
        queryClient.setQueryData<JobApiJson>(detailKey, (old) => old === undefined ? old : mergeJobUpdate(old, event.data));
    });
}

/** Put a job returned by the API into the cache */
export const useSetJob = () => {
    const queryClient = useQueryClient();
    return (job: JobApiJson) => {
        queryClient.setQueryData<JobApiJson>(tanQueries.jobs.detail(job.id).queryKey, job);
        queryClient.setQueryData<JobApiJson[]>(tanQueries.jobs.list().queryKey, (old) => {
            if (old === undefined) {
                return old;
            }
            return old.some(x => x.id === job.id) ? old.map(x => x.id === job.id ? job : x) : [job, ...old];
        });
    };
}
