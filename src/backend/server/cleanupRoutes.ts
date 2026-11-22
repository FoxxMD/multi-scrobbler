import type { Logger } from "@foxxmd/logging";
import type { createTypedRouter } from "@minisylar/express-typed-router";
import bodyParser from "body-parser";
import dayjs from "dayjs";
import * as z from "zod";
import { cleanupBodySchema, type ClientJobPlaysSummaryJson, mirrorCleanupBodySchema, type MirrorApiJson, mirrorUpdateSchema } from "../../core/Job.ts";
import { MirrorRepository } from "../common/database/drizzle/repositories/MirrorRepository.ts";
import type ScrobbleClients from "../scrobblers/ScrobbleClients.ts";
import { toMirrorApiJson } from "../jobs/jobApi.ts";
import type { JobManager } from "../jobs/JobManager.ts";
import { JobConflictError } from "../jobs/JobRunner.ts";
import { MirrorNotFoundError } from "../jobs/MirrorService.ts";

type Router = ReturnType<typeof createTypedRouter>;
type Res = {status: (n: number) => {json: (b: unknown) => unknown}};

const jsonParser = bodyParser.json({type: ['text/*', 'application/json']});
const idParams = z.object({id: z.coerce.number().int().positive()});

/** Mirror pages and cleanup of the plays import jobs created in Clients */
export const setupCleanupRoutes = (router: Router, jobs: JobManager, clients: ScrobbleClients, logger: Logger) => {

    const conflictOr = (res: Res, e: unknown) => {
        if (e instanceof JobConflictError) {
            res.status(409).json({error: e.message});
            return;
        }
        if (e instanceof MirrorNotFoundError) {
            // deleted while the request was handled
            res.status(404).json({error: 'Mirror not found'});
            return;
        }
        throw e;
    }

    /** the mirror's details if it belongs to the requester, otherwise responds 404 */
    const userMirror = async (req: {auth?: {userId: string}}, res: Res, id: number) => {
        const mirror = await new MirrorRepository(jobs.db, {logger}).getById(id);
        if (mirror === undefined || mirror.userId !== req.auth!.userId) {
            res.status(404).json({error: 'Mirror not found'});
            return undefined;
        }
        return mirror;
    }

    const mirrorJson = async (id: number): Promise<MirrorApiJson> => toMirrorApiJson((await jobs.mirrors.get(id))!);

    router.get('/mirrors', {docs: {operationId: 'get-mirrors'}, tags: ['Mirrors'], summary: 'Get Mirrors', description: "The requester's mirrors"}, async (req, res) => {
        const mirrors = await new MirrorRepository(jobs.db, {logger}).findForUser(req.auth!.userId);
        return res.json(await Promise.all(mirrors.map(x => mirrorJson(x.id))));
    });

    router.get('/mirrors/:id', {docs: {operationId: 'get-mirror'}, paramsSchema: idParams, tags: ['Mirrors'], summary: 'Get Mirror'}, async (req, res) => {
        if (await userMirror(req, res, req.params.id) === undefined) {
            return;
        }
        return res.json(await mirrorJson(req.params.id));
    });

    router.patch('/mirrors/:id', {docs: {operationId: 'update-mirror'}, paramsSchema: idParams, middleware: [jsonParser], bodySchema: mirrorUpdateSchema, tags: ['Mirrors'], summary: 'Update Mirror'}, async (req, res) => {
        if (await userMirror(req, res, req.params.id) === undefined) {
            return;
        }
        await jobs.mirrors.rename(req.params.id, req.body.name);
        return res.json(await mirrorJson(req.params.id));
    });

    router.delete('/mirrors/:id', {docs: {operationId: 'delete-mirror'}, paramsSchema: idParams, tags: ['Mirrors'], summary: 'Delete Mirror', description: 'Deletes the mirror and all its scrobbles in the background (202), then sends `mirrorDeleted`. 409 while any job uses it'}, async (req, res) => {
        if (await userMirror(req, res, req.params.id) === undefined) {
            return;
        }
        try {
            await jobs.mirrors.startDelete(req.params.id);
        } catch (e) {
            conflictOr(res, e);
            return;
        }
        return res.status(202).json({});
    });

    router.post('/mirrors/:id/cleanup', {docs: {operationId: 'cleanup-mirror'}, paramsSchema: idParams, middleware: [jsonParser], bodySchema: mirrorCleanupBodySchema, tags: ['Mirrors'], summary: 'Clean Up Mirror', description: "Compact or delete the mirror's scrobbles, all or those played in a range, in the background (202). 409 while a job using it imports or exports"}, async (req, res) => {
        if (await userMirror(req, res, req.params.id) === undefined) {
            return;
        }
        const {action, range} = req.body;
        const ms = range === undefined ? undefined : [dayjs(range.from).valueOf(), dayjs(range.to).valueOf()] as [number, number];
        if (ms !== undefined && ms[0] > ms[1]) {
            return res.status(400).json({error: 'range.from must be before range.to'});
        }
        try {
            await jobs.mirrors.startCleanup(req.params.id, {action, range: ms});
        } catch (e) {
            conflictOr(res, e);
            return;
        }
        return res.status(202).json({});
    });

    /** the Client, otherwise responds 404 */
    const client = (res: Res, id: number) => {
        const c = clients.clients.find(x => x.componentId === id);
        if (c === undefined) {
            res.status(404).json({error: 'Client not found'});
        }
        return c;
    }

    router.get('/components/:id/job-plays/summary', {docs: {operationId: 'get-client-job-plays-summary'}, paramsSchema: idParams, tags: ['Jobs'], summary: 'Get Client Job Plays Summary', description: 'Counts of the scrobbles import jobs created in a Client'}, async (req, res) => {
        if (client(res, req.params.id) === undefined) {
            return;
        }
        return res.json(await jobs.clientJobPlaysSummary(req.params.id) satisfies ClientJobPlaysSummaryJson);
    });

    router.post('/components/:id/cleanup/job-plays', {docs: {operationId: 'cleanup-client-job-plays'}, paramsSchema: idParams, middleware: [jsonParser], bodySchema: cleanupBodySchema, tags: ['Jobs'], summary: 'Clean Up Client Job Plays', description: "Compact or delete every scrobble import jobs created in this Client, including those of deleted jobs, in the background (202). Scrobbles still in the queue are skipped. 409 while a job exports to the Client"}, async (req, res) => {
        if (client(res, req.params.id) === undefined) {
            return;
        }
        try {
            await jobs.cleanupClientJobPlays(req.params.id, req.body.action);
        } catch (e) {
            conflictOr(res, e);
            return;
        }
        return res.status(202).json({});
    });
}
