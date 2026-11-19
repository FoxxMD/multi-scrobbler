import type { Logger } from "@foxxmd/logging";
import type { createTypedRouter } from "@minisylar/express-typed-router";
import bodyParser from "body-parser";
import dayjs from "dayjs";
import formidable, { type File } from "formidable";
import { randomUUID } from "node:crypto";
import { mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import * as z from "zod";
import { jobCreateSchema, jobUpdateSchema, type JobApiJson, type JobOptionsApiJson } from "../../core/Job.ts";
import { JobRepository, type JobSelect } from "../common/database/drizzle/repositories/JobRepository.ts";
import { MirrorRepository, type PlayMirrorSelect } from "../common/database/drizzle/repositories/MirrorRepository.ts";
import type { JobImportFile } from "../common/infrastructure/Job.ts";
import type ScrobbleSources from "../sources/ScrobbleSources.ts";
import type ScrobbleClients from "../scrobblers/ScrobbleClients.ts";
import { toJobApiJson } from "../jobs/jobApi.ts";
import { isLastfmImportSource, type JobManager } from "../jobs/JobManager.ts";
import { JobConflictError } from "../jobs/JobRunner.ts";
import { detectLastfmFileFormat, UnsupportedFileError } from "../jobs/lastfm/lastfmFiles.ts";

type Router = ReturnType<typeof createTypedRouter>;

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024;

const jsonParser = bodyParser.json({type: ['text/*', 'application/json']});

const idParams = z.object({id: z.coerce.number().int().positive()});

class JobRequestError extends Error {
    status: number;
    constructor(message: string, status = 400) {
        super(message);
        this.status = status;
    }
}

export const setupJobRoutes = (router: Router, jobs: JobManager, sources: ScrobbleSources, clients: ScrobbleClients, logger: Logger) => {

    // the manager's db, so routes and job runners always see the same data
    const repos = (_req?: unknown) => ({jobRepo: new JobRepository(jobs.db, {logger}), mirrorRepo: new MirrorRepository(jobs.db, {logger})});

    const componentName = (id: number | null) => {
        if (id === null) {
            return undefined;
        }
        const c = jobs.resolveComponent(id) as {name?: string} | undefined;
        return c?.name;
    }

    const asApi = async (job: JobSelect, mirrorRepo: MirrorRepository, mirrors?: Map<number, PlayMirrorSelect>): Promise<JobApiJson> => {
        const mirror = mirrors?.get(job.mirrorId) ?? await mirrorRepo.getById(job.mirrorId);
        return toJobApiJson(job, mirror!, {componentName: componentName(job.componentFromId), runtime: jobs.getRuntime(job.id)});
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
        } else if (e instanceof JobRequestError) {
            res.status(e.status).json({error: e.message});
        } else if (e instanceof UnsupportedFileError) {
            res.status(400).json({error: e.message});
        } else {
            throw e;
        }
    }

    router.get('/jobs', {docs: {operationId: 'get-jobs'}, tags: ['Jobs'], summary: 'Get Jobs', description: "The requester's import jobs"}, async (req, res) => {
        const {jobRepo, mirrorRepo} = repos(req);
        const list = await jobRepo.findForUser(req.auth!.userId);
        const mirrors = new Map((await mirrorRepo.findForUser(req.auth!.userId)).map(x => [x.id, x]));
        const data: JobApiJson[] = [];
        for (const job of list.sort((a, b) => b.createdAt.valueOf() - a.createdAt.valueOf())) {
            data.push(await asApi(job, mirrorRepo, mirrors));
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
        const userMirrors = await mirrorRepo.findForUser(req.auth!.userId);
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
        return res.json({importComponents, mirrors, importFiles} satisfies JobOptionsApiJson);
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
                await mkdir(jobs.importsDir, {recursive: true});
                const form = formidable({
                    uploadDir: jobs.importsDir,
                    maxFiles: 1,
                    maxFileSize: MAX_UPLOAD_BYTES,
                    allowEmptyFiles: false,
                    filename: (_name, ext) => `${randomUUID()}${ext}`,
                });
                let fields: formidable.Fields;
                let files: formidable.Files;
                try {
                    [fields, files] = await form.parse(req);
                } catch (e) {
                    throw new JobRequestError(`Upload failed: ${(e as Error).message}`, (e as {httpCode?: number}).httpCode ?? 400);
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

            let mirror: PlayMirrorSelect;
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

            if ('componentId' in payload.importFrom) {
                const component = jobs.resolveComponent(payload.importFrom.componentId);
                if (!isLastfmImportSource(component)) {
                    throw new JobRequestError('Component is not a configured Last.fm Source or Client');
                }
                if (component.api.user === undefined) {
                    throw new JobRequestError('Last.fm component must be authenticated before importing from it');
                }
                componentFromId = payload.importFrom.componentId;
                mirror = await mirrorRepo.findOrCreate({userId, service: 'lastfm', account: component.api.user, name: `Last.fm ${component.api.user}`});
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
                        if (!(await stat(filePath)).isFile()) {
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
                mirror = await fileMirror(format === 'lastfm-benjamin-csv');
            }

            let rangeFrom: dayjs.Dayjs | undefined;
            let rangeTo = dayjs();
            if (payload.range !== 'all') {
                if (payload.range.from !== undefined) {
                    rangeFrom = dayjs(payload.range.from);
                }
                if (payload.range.to !== undefined && dayjs(payload.range.to).isBefore(rangeTo)) {
                    rangeTo = dayjs(payload.range.to);
                }
                if (rangeFrom !== undefined && !rangeFrom.isBefore(rangeTo)) {
                    throw new JobRequestError('range.from must be before range.to');
                }
            }

            const job = await jobRepo.create({
                userId,
                name: payload.name,
                mirrorId: mirror.id,
                componentFromId,
                importFile,
                rangeFrom,
                rangeTo,
                persistInputs: payload.persistInputs ?? importFile === undefined,
            });
            // the uploaded file now belongs to the job
            uploaded = undefined;

            let startError: string | undefined;
            if (payload.start) {
                try {
                    await jobs.startImport(job.id);
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
        const updated = req.body.name !== undefined ? (await jobRepo.update(job.id, {name: req.body.name}))! : job;
        return res.json(await asApi(updated, mirrorRepo));
    });

    router.delete('/jobs/:id', {docs: {operationId: 'delete-job'}, paramsSchema: idParams, tags: ['Jobs'], summary: 'Delete Job', description: 'Stops and deletes the job. Client plays it created are kept. An uploaded export file is deleted, a file you placed in the imports folder is kept.'}, async (req, res) => {
        const job = await userJob(req, res, req.params.id);
        if (job === undefined) {
            return;
        }
        await jobs.deleteJob(job.id);
        return res.status(204).send();
    });

    type ControlReq = {params: {id: number}, app: {locals: unknown}, auth?: {userId: string}};
    type ControlRes = {status: (n: number) => {json: (b: unknown) => unknown}, json: (b: unknown) => unknown};
    const control = async (action: 'start' | 'pause' | 'stop', req: ControlReq, res: ControlRes) => {
        const job = await userJob(req, res, req.params.id);
        if (job === undefined) {
            return;
        }
        try {
            if (action === 'start') {
                await jobs.startImport(job.id);
            } else {
                await jobs.stopImport(job.id, action === 'pause' ? 'paused' : 'stopped');
            }
        } catch (e) {
            res.status(e instanceof JobConflictError ? 409 : 400).json({error: (e as Error).message});
            return;
        }
        const {jobRepo, mirrorRepo} = repos(req);
        res.json(await asApi((await jobRepo.getById(job.id))!, mirrorRepo));
    }

    for (const action of ['start', 'pause', 'stop'] as const) {
        const summary = `${action[0].toUpperCase()}${action.slice(1)}`;
        router.post(`/jobs/:id/import/${action}`, {docs: {operationId: `${action}-job-import`}, paramsSchema: idParams, tags: ['Jobs'], summary: `${summary} Job Import`}, async (req, res) => { await control(action, req, res); });
        router.post(`/jobs/:id/${action}`, {docs: {operationId: `${action}-job`}, paramsSchema: idParams, tags: ['Jobs'], summary: `${summary} Job`, description: 'Applies to every process of the job (currently only the import)'}, async (req, res) => { await control(action, req, res); });
    }
}
