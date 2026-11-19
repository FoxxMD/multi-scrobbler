import dayjs from "dayjs";
import { serializeError } from "serialize-error";
import { deriveJobStatus, type JobApiJson, type JobImportOriginJson } from "../../core/Job.ts";
import type { JobSelect } from "../common/database/drizzle/repositories/JobRepository.ts";
import type { PlayMirrorSelect } from "../common/database/drizzle/repositories/MirrorRepository.ts";
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

export const toJobApiJson = (job: JobSelect, mirror: PlayMirrorSelect, opts: {componentName?: string, runtime?: JobRuntime} = {}): JobApiJson => ({
    id: job.id,
    name: job.name,
    status: deriveJobStatus([job.importStatus]),
    mirror: {id: mirror.id, name: mirror.name, service: mirror.service, account: mirror.account},
    importFrom: jobImportOrigin(job, opts.componentName),
    rangeFrom: job.rangeFrom?.toISOString() ?? null,
    rangeTo: job.rangeTo.toISOString(),
    persistInputs: job.persistInputs,
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
    runtime: {import: {...(opts.runtime?.import ?? {})}},
});
