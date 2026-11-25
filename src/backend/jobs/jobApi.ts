import dayjs from "dayjs";
import { serializeError } from "serialize-error";
import { deriveJobStatus, isLockedMirror, type JobApiJson, type JobImportOriginJson, type JobTargetApiJson, type MirrorApiJson } from "../../core/Job.ts";
import type { MirrorDetails } from "./MirrorService.ts";
import type { JobSelect } from "../common/database/drizzle/repositories/JobRepository.ts";
import type { PlayMirrorSelect } from "../common/database/drizzle/repositories/MirrorRepository.ts";
import type { JobTargetSelect } from "../common/database/drizzle/repositories/JobTargetRepository.ts";
import type { JobRuntime } from "./JobRunner.ts";

/** Recursively converts Dayjs to ISO strings and Errors to plain objects so job data can be sent as JSON */
export const toJsonable = (data: unknown): unknown => {
    if (dayjs.isDayjs(data)) {
        return data.toISOString();
    }
    if (data instanceof Error) {
        return serializeError(data);
    }
    if (Array.isArray(data)) {
        return data.map(toJsonable);
    }
    if (data !== null && typeof data === 'object') {
        return Object.fromEntries(Object.entries(data).map(([k, v]) => [k, toJsonable(v)]));
    }
    return data;
}

export const jobImportOrigin = (job: JobSelect, componentName?: string): JobImportOriginJson => {
    if (job.importFile !== null) {
        return {kind: 'file', originalName: job.importFile.originalName, format: job.importFile.format, size: job.importFile.size};
    }
    if (job.componentFromId !== null) {
        return {kind: 'component', componentId: job.componentFromId, name: componentName};
    }
    return {kind: 'mirror'};
}

export const toJobTargetApiJson = (target: JobTargetSelect, client?: {name: string, type: string}, records = 0): JobTargetApiJson => ({
    id: target.id,
    componentId: target.componentId,
    name: client?.name,
    type: client?.type,
    status: target.status,
    cursor: target.cursor,
    exported: target.exported,
    queued: target.queued,
    skipped: target.skipped,
    epochDecision: target.epochDecision ?? null,
    stats: target.stats,
    records,
    error: target.error !== null ? serializeError(target.error) : null,
    breaker: target.breaker,
    startedAt: target.startedAt?.toISOString() ?? null,
    completedAt: target.completedAt?.toISOString() ?? null,
    updatedAt: target.updatedAt.toISOString(),
});

export const toJobApiJson = (job: JobSelect, mirror: PlayMirrorSelect, opts: {componentName?: string, runtime?: JobRuntime, targets?: JobTargetSelect[], resolveClient?: (componentId: number) => {name: string, type: string} | undefined, mirrorPlaysInRange?: number, records?: Map<number, number>} = {}): JobApiJson => ({
    id: job.id,
    name: job.name,
    status: deriveJobStatus([job.importStatus, ...(opts.targets ?? []).map(x => x.status)]),
    mirror: {id: mirror.id, name: mirror.name, service: mirror.service, account: mirror.account, locked: isLockedMirror(mirror)},
    importFrom: jobImportOrigin(job, opts.componentName),
    rangeFrom: job.rangeFrom?.toISOString() ?? null,
    rangeTo: job.rangeTo.toISOString(),
    persistInputs: job.persistInputs,
    importOverlap: job.importOverlap,
    importReplacedAt: job.importReplacedAt?.toISOString() ?? null,
    transformOptions: job.transformOptions,
    transformSource: job.transformSource,
    exportOrder: job.exportOrder,
    exportQueueLimit: job.exportQueueLimit,
    exportUpstreamCheck: job.exportUpstreamCheck,
    exportDiscarded: job.exportDiscarded,
    exportSkipBadTimestamps: job.exportSkipBadTimestamps,
    exportCollapseBursts: job.exportCollapseBursts,
    exportKeepEpochBursts: job.exportKeepEpochBursts,
    targets: (opts.targets ?? []).map(x => toJobTargetApiJson(x, opts.resolveClient?.(x.componentId), opts.records?.get(x.componentId))),
    mirrorPlaysInRange: opts.mirrorPlaysInRange ?? 0,
    importStatus: job.importStatus,
    importCursor: job.importCursor,
    importTotal: job.importTotal,
    importFetched: job.importFetched,
    imported: job.imported,
    importError: job.importError !== null ? serializeError(job.importError) : null,
    importStartedAt: job.importStartedAt?.toISOString() ?? null,
    importCompletedAt: job.importCompletedAt?.toISOString() ?? null,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    runtime: {import: {...(opts.runtime?.import ?? {})}, exports: {...(opts.runtime?.exports ?? {})}},
});

export const toMirrorApiJson = (details: MirrorDetails): MirrorApiJson => ({
    id: details.mirror.id,
    name: details.mirror.name,
    service: details.mirror.service,
    account: details.mirror.account,
    locked: isLockedMirror(details.mirror),
    coverage: details.mirror.coverage,
    segments: details.mirror.segments,
    gaps: details.gaps,
    plays: details.plays,
    jobs: details.jobs.map(x => ({id: x.id, name: x.name})),
    task: details.task ?? null,
    createdAt: details.mirror.createdAt.toISOString(),
    updatedAt: details.mirror.updatedAt.toISOString(),
});
