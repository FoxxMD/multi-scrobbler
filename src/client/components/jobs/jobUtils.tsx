import { Badge, Progress, Text, type BadgeProps } from '@chakra-ui/react';
import { useSSEAnyEvent, useSSEContext } from "@flamefrontend/sse-runtime-react";
import { useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { HTTPError } from 'ky';
import { useEffect, useState } from 'react';
import { asJobSseEvent, type MsSseEvent } from "../../../core/Api";
import { deriveJobStatus, type JobApiJson, type JobImportOriginJson, type JobProcessStatus, type JobTargetApiJson, type LastfmFileFormat } from "../../../core/Job";
import { capitalize } from "../../../core/StringUtils";
import { tanQueries } from "../../queries";
import { isoToHuman, shortTodayAwareFormat } from "../../utils";
import { toaster } from "../Toaster";
import { addRateSample, estimateRate, type RateEstimate, type RateSample } from "../../../core/ProcessRate";
import { policyWindow, type RateLimitStatusJson } from "../../../core/RateLimit";

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

/** IE "10 new of 12 fetched, 2 skipped (12 total)" */
export const importCountsText = (job: Pick<JobApiJson, 'imported' | 'importFetched' | 'importTotal'>): string => {
    const skipped = job.importFetched - job.imported;
    return `${job.imported.toLocaleString()} new of ${job.importFetched.toLocaleString()} fetched${skipped > 0 ? `, ${skipped.toLocaleString()} skipped` : ''}${job.importTotal !== null ? ` (${job.importTotal.toLocaleString()} total)` : ''}`;
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

/** Plays per minute and finish time of a running process over the last minute of live updates. Starts over when the process stops running */
export const useProcessRate = (count: number, progress: number | undefined, running: boolean): RateEstimate | undefined => {
    const [samples, setSamples] = useState<RateSample[]>([]);
    useEffect(() => {
        // each live update is a sample stamped with the clock, an external system
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSamples(running ? s => addRateSample(s, {at: Date.now(), count, progress}) : []);
    }, [running, count, progress]);
    return running ? estimateRate(samples) : undefined;
}

export const ProcessRateText = (props: { rate: RateEstimate | undefined }) => {
    const {rate} = props;
    if (rate === undefined) {
        return null;
    }
    const finish = rate.finishAt !== undefined ? dayjs(rate.finishAt) : undefined;
    return (
        <Text textStyle="sm" color="fg.muted">
            {rate.perMinute.toLocaleString(undefined, {maximumFractionDigits: rate.perMinute < 10 ? 1 : 0})} Plays per minute
            {finish !== undefined ? `, done around ${shortTodayAwareFormat(finish)} (${finish.fromNow()})` : ''}
        </Text>
    );
}

/** When a scrobble was played, IE mirror ranges and export positions. Always has the year since scrobble history spans years */
export const formatPlayedDate = (date: string | number | Date): string => isoToHuman(dayjs(date).toISOString(), {includeDate: true});

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
        if (typeof event.data.deleteError === 'string') {
            toaster.create({type: 'error', title: 'Deleting the job failed', description: event.data.deleteError});
        }
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

/** Jobs that import from the component or export to it */
export const countComponentJobs = (jobs: Pick<JobApiJson, 'importFrom' | 'targets'>[], componentId: number): number =>
    jobs.filter(j => (j.importFrom.kind === 'component' && j.importFrom.componentId === componentId) || j.targets.some(t => t.componentId === componentId)).length;

/**
 * Number of jobs that import from or export to the component. Mount useJobEvents once on the page to keep it current.
 * undefined while loading, or when jobs can't be read (IE not logged in)
 * */
export const useComponentJobCount = (componentId: number, enabled = true): number | undefined => {
    const {data} = useQuery({...tanQueries.jobs.list(), enabled});
    return data === undefined ? undefined : countComponentJobs(data, componentId);
}

/** The export Client's rate limit, as used / total points next to the point where exports wait */
export const RateLimitText = (props: { rateLimit: RateLimitStatusJson | undefined }) => {
    const {rateLimit} = props;
    if (rateLimit === undefined) {
        return null;
    }
    const window = policyWindow(rateLimit.policy);
    return (
        <Text textStyle="sm" color="fg.muted">
            Rate limit: {(rateLimit.limit - rateLimit.remaining).toLocaleString()} / {rateLimit.limit.toLocaleString()} points used{window !== undefined ? ` per ${window}` : ''}, exports wait at {(rateLimit.limit - rateLimit.reserve).toLocaleString()}. Resets {shortTodayAwareFormat(dayjs(rateLimit.reset))}
        </Text>
    );
}
