import type { Logger } from "@foxxmd/logging";
import type { createTypedRouter } from "@minisylar/express-typed-router";
import bodyParser from "body-parser";
import dayjs from "dayjs";
import formidable, { type File } from "formidable";
import { randomUUID } from "node:crypto";
import { lstat, mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import * as z from "zod";
import { cleanupBodySchema, jobCreateSchema, jobDeleteQuerySchema, jobUpdateSchema, type JobApiJson, type JobOptionsApiJson } from "../../core/Job.ts";
import { JobRepository, type JobSelect } from "../common/database/drizzle/repositories/JobRepository.ts";
import { runTransaction } from "../common/database/drizzle/drizzleUtils.ts";
import { MirrorRepository, type PlayMirrorSelect } from "../common/database/drizzle/repositories/MirrorRepository.ts";
import { addStats, JobTargetRepository, type JobTargetSelect } from "../common/database/drizzle/repositories/JobTargetRepository.ts";
import type { JobImportFile } from "../common/infrastructure/Job.ts";
import type ScrobbleSources from "../sources/ScrobbleSources.ts";
import type ScrobbleClients from "../scrobblers/ScrobbleClients.ts";
import { toJobApiJson } from "../jobs/jobApi.ts";
import { componentHookStages, isLastfmImportSource, JobConfigError, jobUploadsDir, type JobManager } from "../jobs/JobManager.ts";
import { JobConflictError, mirrorLockKey } from "../jobs/JobRunner.ts";
import type { StartedTask } from "../jobs/MirrorService.ts";
import { detectLastfmFileFormat, UnsupportedFileError } from "../jobs/lastfm/lastfmFiles.ts";

type Router = ReturnType<typeof createTypedRouter>;

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024;

/** services that refuse scrobbles older than about 14 days */
const OLD_SCROBBLE_REJECTING_TYPES = ['lastfm', 'librefm'];

const jsonParser = bodyParser.json({type: ['text/*', 'application/json']});

const idParams = z.object({id: z.coerce.number().int().positive()});
const targetParams = z.object({id: z.coerce.number().int().positive(), targetId: z.coerce.number().int().positive()});

class JobRequestError extends Error {
    status: number;
    constructor(message: string, status = 400) {
        super(message);
        this.status = status;
    }
}

export const setupJobRoutes = (router: Router, jobs: JobManager, sources: ScrobbleSources, clients: ScrobbleClients, logger: Logger) => {

    // the manager's db, so routes and job runners always see the same data
    const repos = (_req?: unknown) => ({jobRepo: new JobRepository(jobs.db, {logger}), mirrorRepo: new MirrorRepository(jobs.db, {logger}), targetRepo: new JobTargetRepository(jobs.db, {logger})});

    const exportClient = (componentId: number) => clients.clients.find(c => c.componentId === componentId);

    const componentName = (id: number | null) => {
        if (id === null) {
            return undefined;
        }
        const c = jobs.resolveComponent(id) as {name?: string} | undefined;
        return c?.name;
    }

    const asApi = async (job: JobSelect, mirrorRepo: MirrorRepository, preloaded: {mirrors?: Map<number, PlayMirrorSelect>, targets?: JobTargetSelect[]} = {}): Promise<JobApiJson> => {
        const mirror = preloaded.mirrors?.get(job.mirrorId) ?? await mirrorRepo.getById(job.mirrorId);
        const {targetRepo} = repos();
        const stored = preloaded.targets ?? await targetRepo.findByJob(job.id);
        // a completed target keeps its snapshot, others show what the client has now (IE queued plays draining while paused)
        // plus plays a cleanup deleted from the client
        const live = stored.some(x => x.status !== 'completed') ? await targetRepo.playStats(job.id) : new Map();
        const targets = stored.map(t => t.status === 'completed' ? t : {...t, stats: addStats(live.get(t.componentId), t.removedStats)});
        const mirrorPlaysInRange = await mirrorRepo.countInRange(job.mirrorId, [job.rangeFrom?.valueOf() ?? 0, job.rangeTo.valueOf()]);
        return toJobApiJson(job, mirror!, {componentName: componentName(job.componentFromId), runtime: jobs.getRuntime(job.id), targets, resolveClient: exportClient, mirrorPlaysInRange});
    }

    /** the job if it exists and belongs to the requester, otherwise responds 404 */
    const userJob = async (req: {app: {locals: unknown}, auth?: {userId: string}}, res: {status: (n: number) => {json: (b: unknown) => unknown}}, id: number) => {
        const {jobRepo} = repos(req);
        const job = await jobRepo.findByIdForUser(id, req.auth!.userId);
        if (job === undefined) {
            res.status(404).json({error: 'Job not found'});
        }
        return job;
    }

    const respondError = (res: {status: (n: number) => {json: (b: unknown) => unknown}}, e: unknown): void => {
        if (e instanceof JobConflictError) {
            res.status(409).json({error: e.message});
        } else if (e instanceof JobConfigError) {
            res.status(400).json({error: e.message});
        } else if (e instanceof JobRequestError) {
            res.status(e.status).json({error: e.message});
        } else if (e instanceof UnsupportedFileError) {
            res.status(400).json({error: e.message});
        } else {
            throw e;
        }
    }

    router.get('/jobs', {docs: {operationId: 'get-jobs'}, tags: ['Jobs'], summary: 'Get Jobs', description: "The requester's import jobs"}, async (req, res) => {
        const {jobRepo, mirrorRepo, targetRepo} = repos(req);
        const list = await jobRepo.findForUser(req.auth!.userId);
        const mirrors = new Map((await mirrorRepo.findForUser(req.auth!.userId)).map(x => [x.id, x]));
        const allTargets = await targetRepo.findByJobs(list.map(x => x.id));
        const data: JobApiJson[] = [];
        for (const job of list.sort((a, b) => b.createdAt.valueOf() - a.createdAt.valueOf())) {
            data.push(await asApi(job, mirrorRepo, {mirrors, targets: allTargets.filter(x => x.jobId === job.id)}));
        }
        return res.json(data);
    });

    router.get('/jobs/options', {docs: {operationId: 'get-job-options'}, tags: ['Jobs'], summary: 'Get Job Options', description: 'What a new job can import from'}, async (req, res) => {
        const {jobRepo, mirrorRepo} = repos(req);
        const importComponents: JobOptionsApiJson['importComponents'] = [];
        for (const [mode, list] of [['source', sources.sources], ['client', clients.clients]] as const) {
            for (const c of list) {
                if (c.type !== 'lastfm' || !c.databaseOK || !isLastfmImportSource(c)) {
                    continue;
                }
                importComponents.push({componentId: c.componentId, name: c.name, mode, ready: c.isReady(), account: c.api.user ?? null});
            }
        }
        // only Last.fm mirrors can be imported into
        const userMirrors = (await mirrorRepo.findForUser(req.auth!.userId)).filter(x => x.service === 'lastfm');
        const counts = await mirrorRepo.playCounts(userMirrors.map(x => x.id));
        const mirrors: JobOptionsApiJson['mirrors'] = userMirrors.map(x => ({id: x.id, name: x.name, service: x.service, account: x.account, coverage: x.coverage, playCount: counts.get(x.id) ?? 0}));

        const used = new Set((await jobRepo.findAll()).map(x => x.importFile?.path).filter(x => x !== undefined));
        const importFiles: JobOptionsApiJson['importFiles'] = [];
        try {
            for (const entry of await readdir(jobs.importsDir, {withFileTypes: true})) {
                const full = path.join(jobs.importsDir, entry.name);
                if (!entry.isFile() || used.has(full)) {
                    continue;
                }
                const s = await stat(full);
                importFiles.push({name: entry.name, size: s.size, modifiedAt: s.mtime.toISOString()});
            }
        } catch (e) {
            if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
                throw e;
            }
        }

        const targets: JobOptionsApiJson['targets'] = clients.clients
            .filter(c => c.databaseOK)
            .map(c => ({componentId: c.componentId, name: c.name, type: c.type, ready: c.isReady(), rejectsOldScrobbles: OLD_SCROBBLE_REJECTING_TYPES.includes(c.type)}));
        const presets: JobOptionsApiJson['presets'] = Object.entries(jobs.transformersPresets).map(([name, stages]) => ({name, stages: Array.isArray(stages) ? stages : [stages]}));
        // stage config is search/replace terms, conditions and provider names, never credentials
        const componentTransforms: JobOptionsApiJson['componentTransforms'] = [];
        for (const [mode, list] of [['source', sources.sources], ['client', clients.clients]] as const) {
            for (const c of list) {
                if (!c.databaseOK) {
                    continue;
                }
                const preCompare = componentHookStages(c, 'preCompare');
                const postCompare = componentHookStages(c, 'postCompare');
                if (preCompare !== undefined || postCompare !== undefined) {
                    componentTransforms.push({componentId: c.componentId, name: c.name, mode, preCompare, postCompare});
                }
            }
        }
        return res.json({importComponents, mirrors, importFiles, targets, presets, componentTransforms} satisfies JobOptionsApiJson);
    });

    router.get('/jobs/:id', {docs: {operationId: 'get-job'}, paramsSchema: idParams, tags: ['Jobs'], summary: 'Get Job'}, async (req, res) => {
        const job = await userJob(req, res, req.params.id);
        if (job === undefined) {
            return;
        }
        return res.json(await asApi(job, repos(req).mirrorRepo));
    });

    router.post('/jobs', {
        docs: {operationId: 'create-job'},
        middleware: [jsonParser],
        tags: ['Jobs'],
        summary: 'Create Job',
        description: 'Create an import job. Send JSON, or multipart/form-data with the JSON in a `payload` field and an export file in a `file` field when `importFrom` is `{upload: true}`.'
    }, async (req, res) => {
        const userId = req.auth!.userId;
        const {jobRepo, mirrorRepo} = repos(req);
        let uploaded: File | undefined;
        try {
            let rawPayload: unknown = req.body;
            if (req.is('multipart/form-data')) {
                // a subfolder, so in-progress and owned uploads are never listed or importable as an existing file by other users
                const uploadsDir = jobUploadsDir(jobs);
                await mkdir(uploadsDir, {recursive: true});
                const form = formidable({
                    uploadDir: uploadsDir,
                    maxFiles: 1,
                    maxFileSize: MAX_UPLOAD_BYTES,
                    allowEmptyFiles: false,
                    keepExtensions: true,
                    // anything not in the `file` field is never written to disk
                    filter: ({name}) => name === 'file',
                    // ext comes from the client, only keep a plain one
                    filename: (_name, ext) => `${randomUUID()}${/^\.[a-z0-9]{1,8}$/i.test(ext) ? ext : ''}`,
                });
                const started: string[] = [];
                form.on('fileBegin', (_name, file) => {
                    started.push(file.filepath);
                });
                let fields: formidable.Fields;
                let files: formidable.Files;
                try {
                    [fields, files] = await form.parse(req);
                } catch (e) {
                    // formidable does not always remove what it already wrote (IE too many files)
                    await Promise.all(started.map(f => rm(f, {force: true})));
                    const httpCode = (e as {httpCode?: number}).httpCode;
                    if (httpCode === undefined) {
                        // storage errors (disk full, permissions) are not the client's fault
                        throw new Error('Failed to store upload', {cause: e});
                    }
                    throw new JobRequestError(`Upload failed: ${(e as Error).message}`, httpCode);
                }
                uploaded = files.file?.[0];
                try {
                    rawPayload = JSON.parse(fields.payload?.[0] ?? '{}');
                } catch {
                    throw new JobRequestError('payload field is not valid JSON');
                }
            }
            const parsed = jobCreateSchema.safeParse(rawPayload);
            if (!parsed.success) {
                throw new JobRequestError(`Invalid job: ${z.prettifyError(parsed.error)}`);
            }
            const payload = parsed.data;
            if (uploaded !== undefined && !('upload' in payload.importFrom)) {
                await rm(uploaded.filepath, {force: true});
                uploaded = undefined;
            }

            let rangeFrom: dayjs.Dayjs | undefined;
            let rangeTo = dayjs();
            if (payload.range !== 'all') {
                if (payload.range.from !== undefined) {
                    rangeFrom = dayjs(payload.range.from);
                }
                // range end is frozen at creation and never in the future
                if (payload.range.to !== undefined && dayjs(payload.range.to).isBefore(rangeTo)) {
                    rangeTo = dayjs(payload.range.to);
                }
                if (rangeFrom !== undefined && !rangeFrom.isBefore(rangeTo)) {
                    throw new JobRequestError('range.from must be before range.to');
                }
            }

            // resolved inside the job insert transaction so a failed insert never leaves a new mirror behind
            let resolveMirror: () => Promise<PlayMirrorSelect>;
            let componentFromId: number | undefined;
            let importFile: JobImportFile | undefined;

            const fileMirror = async (isolated: boolean): Promise<PlayMirrorSelect> => {
                if (isolated) {
                    return mirrorRepo.findOrCreate({userId, service: 'lastfm', account: null, name: payload.mirror !== undefined && 'new' in payload.mirror ? payload.mirror.new.name : `${payload.name} (benjaminbenben)`});
                }
                if (payload.mirror === undefined) {
                    throw new JobRequestError('mirror is required when importing a file');
                }
                if ('id' in payload.mirror) {
                    const existing = await mirrorRepo.getById(payload.mirror.id);
                    if (existing === undefined || existing.userId !== userId || existing.service !== 'lastfm') {
                        throw new JobRequestError('Mirror not found', 404);
                    }
                    return existing;
                }
                return mirrorRepo.findOrCreate({userId, service: 'lastfm', account: payload.mirror.new.account ?? null, name: payload.mirror.new.name});
            }

            if ('mirrorId' in payload.importFrom) {
                const existing = await mirrorRepo.getById(payload.importFrom.mirrorId);
                if (existing === undefined || existing.userId !== userId) {
                    throw new JobRequestError('Mirror not found', 404);
                }
                resolveMirror = async () => existing;
            } else if ('componentId' in payload.importFrom) {
                const component = jobs.resolveComponent(payload.importFrom.componentId);
                if (!isLastfmImportSource(component)) {
                    throw new JobRequestError('Component is not a configured Last.fm Source or Client');
                }
                if (component.api.user === undefined) {
                    throw new JobRequestError('Last.fm component must be authenticated before importing from it');
                }
                componentFromId = payload.importFrom.componentId;
                const account = component.api.user;
                resolveMirror = () => mirrorRepo.findOrCreate({userId, service: 'lastfm', account, name: `Last.fm ${account}`});
            } else {
                let filePath: string;
                let originalName: string;
                let managed: boolean;
                if ('upload' in payload.importFrom) {
                    if (uploaded === undefined) {
                        throw new JobRequestError('No file was uploaded in the `file` field');
                    }
                    filePath = uploaded.filepath;
                    originalName = uploaded.originalFilename ?? path.basename(uploaded.filepath);
                    managed = true;
                } else {
                    const name = payload.importFrom.existingFile;
                    // only plain file names inside the imports folder
                    if (path.basename(name) !== name || name.startsWith('.')) {
                        throw new JobRequestError('existingFile must be a file name in the imports folder');
                    }
                    filePath = path.join(jobs.importsDir, name);
                    try {
                        // lstat: symlinks are not listed in options so they aren't importable either
                        if (!(await lstat(filePath)).isFile()) {
                            throw new Error('not a file');
                        }
                    } catch {
                        throw new JobRequestError(`File ${name} was not found in the imports folder`, 404);
                    }
                    originalName = name;
                    managed = false;
                }
                const format = await detectLastfmFileFormat(filePath);
                importFile = {path: filePath, originalName, format, size: (await stat(filePath)).size, managed};
                // validate an existing mirror now so a bad id is a 404 before anything is created
                if (format !== 'lastfm-benjamin-csv' && payload.mirror !== undefined && 'id' in payload.mirror) {
                    const existing = await fileMirror(false);
                    resolveMirror = async () => existing;
                } else {
                    resolveMirror = () => fileMirror(format === 'lastfm-benjamin-csv');
                }
            }

            const transforms = payload.transforms !== undefined ? await jobs.resolveTransforms(payload.transforms) : undefined;

            const targetIds = Array.from(new Set(payload.targets));
            for (const id of targetIds) {
                if (exportClient(id)?.databaseOK !== true) {
                    throw new JobRequestError(`Component ${id} is not a configured Client`);
                }
            }

            const job = await runTransaction(jobs.db, async () => {
                const mirror = await resolveMirror();
                if (jobs.locks.holder(mirrorLockKey(mirror.id)) !== undefined) {
                    throw new JobConflictError(`Mirror '${mirror.name}' is being cleaned up or deleted. Try again when it finishes`);
                }
                const created = await jobRepo.create({
                    userId,
                    name: payload.name,
                    mirrorId: mirror.id,
                    componentFromId,
                    importFile,
                    rangeFrom,
                    rangeTo,
                    // a mirror-only job imports nothing
                    persistInputs: 'mirrorId' in payload.importFrom ? false : payload.persistInputs ?? importFile === undefined,
                    exportOrder: payload.exportOrder,
                    exportQueueLimit: payload.exportQueueLimit,
                    ...transforms,
                });
                await repos().targetRepo.createForJob(created.id, targetIds);
                return created;
            });
            // the uploaded file now belongs to the job
            uploaded = undefined;

            let startError: string | undefined;
            if (payload.start) {
                try {
                    await jobs.startJob(job.id);
                } catch (e) {
                    startError = (e as Error).message;
                }
            }
            const created = (await jobRepo.getById(job.id))!;
            return res.status(201).json({...(await asApi(created, mirrorRepo)), startError});
        } catch (e) {
            // clean up before responding so the client never sees a leftover upload
            if (uploaded !== undefined) {
                await rm(uploaded.filepath, {force: true});
            }
            respondError(res, e);
        }
    });

    router.patch('/jobs/:id', {docs: {operationId: 'update-job'}, paramsSchema: idParams, middleware: [jsonParser], bodySchema: jobUpdateSchema, tags: ['Jobs'], summary: 'Update Job'}, async (req, res) => {
        const job = await userJob(req, res, req.params.id);
        if (job === undefined) {
            return;
        }
        const {jobRepo, mirrorRepo} = repos(req);
        const {name, exportQueueLimit} = req.body;
        const updated = name !== undefined || exportQueueLimit !== undefined ? (await jobRepo.update(job.id, {name, exportQueueLimit}))! : job;
        if (exportQueueLimit !== undefined) {
            jobs.wake(job.id);
        }
        return res.json(await asApi(updated, mirrorRepo));
    });

    router.delete('/jobs/:id', {
        docs: {operationId: 'delete-job'},
        paramsSchema: idParams,
        querySchema: jobDeleteQuerySchema,
        tags: ['Jobs'],
        summary: 'Delete Job',
        description: 'Stops and deletes the job. An uploaded export file is deleted, a file you placed in the imports folder is kept. With only `keep` the job is deleted right away (204). Otherwise the cleanups run in the background (202) and `jobDeleted` is sent when done, or a `jobUpdate` with `deleteError`.'
    }, async (req, res) => {
        const job = await userJob(req, res, req.params.id);
        if (job === undefined) {
            return;
        }
        const {historical, scrobbles} = req.query;
        let started: StartedTask;
        try {
            started = await jobs.deleteJobWithCleanup(job.id, {historical, scrobbles});
        } catch (e) {
            respondError(res, e);
            return;
        }
        if (historical === 'keep' && scrobbles === 'keep') {
            // nothing to clean up, so it's quick. Wait so the job is gone when the response arrives
            const {error} = await started.done;
            if (error !== undefined) {
                return res.status(500).json({error});
            }
            return res.status(204).send();
        }
        return res.status(202).json({});
    });

    for (const kind of ['historical', 'scrobbles'] as const) {
        router.post(`/jobs/:id/cleanup/${kind}`, {
            docs: {operationId: `cleanup-job-${kind}`},
            paramsSchema: idParams,
            middleware: [jsonParser],
            bodySchema: cleanupBodySchema,
            tags: ['Jobs'],
            summary: kind === 'historical' ? 'Clean Up Job Mirror Data' : 'Clean Up Job Scrobbles',
            description: kind === 'historical'
                ? "Compact or delete the mirror's scrobbles in the job's range, in the background. 409 while any job using the mirror is importing or exporting"
                : 'Compact or delete the scrobbles the job created in its Clients, in the background. Queued ones are removed from the queue first. 409 while any of its exports runs',
        }, async (req, res) => {
            const job = await userJob(req, res, req.params.id);
            if (job === undefined) {
                return;
            }
            try {
                await (kind === 'historical' ? jobs.cleanupJobHistorical(job.id, req.body.action) : jobs.cleanupJobScrobbles(job.id, req.body.action));
            } catch (e) {
                respondError(res, e);
                return;
            }
            return res.status(202).json({});
        });
    }

    type ControlReq = {params: {id: number, targetId?: number}, app: {locals: unknown}, auth?: {userId: string}};
    type ControlRes = {status: (n: number) => {json: (b: unknown) => unknown}, json: (b: unknown) => unknown};
    /** process: the import, one export target, or (job) all of them */
    const control = async (action: 'start' | 'pause' | 'stop', process: 'import' | 'target' | 'job', req: ControlReq, res: ControlRes) => {
        const job = await userJob(req, res, req.params.id);
        if (job === undefined) {
            return;
        }
        const halt = action === 'pause' ? 'paused' : 'stopped';
        try {
            if (process === 'target') {
                const target = await repos(req).targetRepo.getById(req.params.targetId!);
                if (target === undefined || target.jobId !== job.id) {
                    res.status(404).json({error: 'Target not found'});
                    return;
                }
                await (action === 'start' ? jobs.startExport(job.id, target.id) : jobs.stopExport(job.id, target.id, halt));
            } else if (process === 'job') {
                await (action === 'start' ? jobs.startJob(job.id) : jobs.stopJob(job.id, halt));
            } else {
                await (action === 'start' ? jobs.startImport(job.id) : jobs.stopImport(job.id, halt));
            }
        } catch (e) {
            if (e instanceof JobConflictError) {
                res.status(409).json({error: e.message});
                return;
            }
            if (e instanceof JobConfigError) {
                res.status(400).json({error: e.message});
                return;
            }
            throw e;
        }
        const {jobRepo, mirrorRepo} = repos(req);
        res.json(await asApi((await jobRepo.getById(job.id))!, mirrorRepo));
    }

    for (const action of ['start', 'pause', 'stop'] as const) {
        const summary = `${action[0].toUpperCase()}${action.slice(1)}`;
        router.post(`/jobs/:id/import/${action}`, {docs: {operationId: `${action}-job-import`}, paramsSchema: idParams, tags: ['Jobs'], summary: `${summary} Job Import`}, async (req, res) => { await control(action, 'import', req, res); });
        router.post(`/jobs/:id/targets/:targetId/${action}`, {docs: {operationId: `${action}-job-export`}, paramsSchema: targetParams, tags: ['Jobs'], summary: `${summary} Job Export`, description: action === 'start' ? 'Export to one Client' : 'Plays already queued in the Client are still scrobbled'}, async (req, res) => { await control(action, 'target', req, res); });
        router.post(`/jobs/:id/${action}`, {docs: {operationId: `${action}-job`}, paramsSchema: idParams, tags: ['Jobs'], summary: `${summary} Job`, description: 'Applies to the import and every export'}, async (req, res) => { await control(action, 'job', req, res); });
    }
}
