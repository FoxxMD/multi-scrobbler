import { expect } from 'chai';
import { describe, it } from 'mocha';
import request from 'supertest';
import * as path from 'path';
import { copyFile, readdir, writeFile } from 'fs/promises';
import dayjs from 'dayjs';
import { loggerTest } from '@foxxmd/logging';
import type { Express } from 'express';
import ScrobbleSources from '../../sources/ScrobbleSources.ts';
import ScrobbleClients from '../../scrobblers/ScrobbleClients.ts';
import { WildcardEmitter } from '../../common/WildcardEmitter.ts';
import { initServer, type ServerLocals } from '../../server/index.ts';
import { getRoot } from '../../ioc.ts';
import { fastPasswordHasher } from '../utils/authTestUtils.ts';
import { JobManager } from '../../jobs/JobManager.ts';
import { projectRootDir } from '../../common/infrastructure/Atomic.ts';
import { createTmpDir } from '../utils/tmpDir.ts';
import LastfmApiClient from '../../common/vendor/LastfmApiClient.ts';
import { JobRepository } from '../../common/database/drizzle/repositories/JobRepository.ts';
import { MirrorRepository } from '../../common/database/drizzle/repositories/MirrorRepository.ts';
import { JobTargetRepository } from '../../common/database/drizzle/repositories/JobTargetRepository.ts';
import { users } from '../../common/database/drizzle/schema/auth.ts';
import { components, plays, playsHistorical } from '../../common/database/drizzle/schema/schema.ts';
import { generatePlay } from '../../../core/tests/utils/PlayTestUtils.ts';
import { nameToCredit, namesToCredits } from '../../../core/MusicMetadata.ts';
import { DrizzlePlayHistoricalRepository } from '../../common/database/drizzle/repositories/PlayHistoricalRepository.ts';
import { fixtureCreateComponent, fixtureCreatePlay } from '../utils/databaseFixtures.ts';
import type { JobApiJson, JobMetricsApiJson, JobOptionsApiJson, MirrorApiJson } from '../../../core/Job.ts';
import { exportStageSeconds, playStageSeconds } from '../../common/playMetrics.ts';
import prom from 'prom-client';
import { mirrorLockKey } from '../../jobs/JobRunner.ts';
import { ensureOwner } from '../../common/auth/owner.ts';
import type { PlayTransformHookConfig } from '../../common/transforms/stageSchemas.ts';

const fixture = (name: string) => path.resolve(projectRootDir, 'src/backend/tests/jobs/fixtures', name);
const internalConfig = { localUrl: new URL('http://localhost:9078'), configDir: 'fake', dataDir: 'fake', logger: loggerTest, version: 'test' };

const fakeLastfmComponent = (user: string | undefined) => {
    const api = new LastfmApiClient('test', {apiKey: 'key', secret: 'secret'}, {...internalConfig});
    api.user = user;
    return {type: 'lastfm', name: 'My Last.fm', api, isReady: () => true};
}

const buildApp = async (importsDir: string, components: Record<number, object> = {}, opts: {transformersPresets?: Record<string, PlayTransformHookConfig>, clients?: object[]} = {}) => {
    const sources = new ScrobbleSources(new WildcardEmitter(), internalConfig, loggerTest);
    const clients = new ScrobbleClients(new WildcardEmitter(), new WildcardEmitter(), internalConfig, loggerTest);
    clients.clients.push(...(opts.clients ?? []) as typeof clients.clients);
    const db = await getRoot().items.db();
    const jobs = new JobManager({db, logger: loggerTest, importsDir, resolveComponent: (id) => components[id], timings: {importPageDelay: 0, emitThrottle: 0}, transformersPresets: opts.transformersPresets ?? {}});
    const [app] = await initServer({sources, clients, jobs}, {testMode: true, passwordHasher: fastPasswordHasher});
    // the test root creates a new in-memory db per call, so point the manager at the server's
    jobs.db = (app.locals as ServerLocals).db;
    return {app, jobs, db: jobs.db};
}

const waitForImport = async (app: Express, id: number, status = 'completed') => {
    for (let i = 0; i < 100; i++) {
        const res = await request(app).get(`/api/jobs/${id}`);
        if (res.body.importStatus === status) {
            return res.body as JobApiJson;
        }
        await new Promise(r => setTimeout(r, 20));
    }
    throw new Error(`Job ${id} never reached ${status}`);
}

const fakeClient = (componentId: number, type: string, playTransform?: object) => ({componentId, name: `client ${componentId}`, getSafeExternalName: () => `client-${componentId}`, type, databaseOK: true, isReady: () => true, config: {options: {playTransform}}});
const create = (app: Express, transforms: unknown) => request(app).post('/api/jobs').send({name: 'transforms', importFrom: {existingFile: 'export.json'}, mirror: {new: {name: 'm'}}, transforms});

describe('Job API', function () {

    it('creates a job from an uploaded file and imports it', async function () {
        await using tmp = await createTmpDir('jobUpload');
        const {app} = await buildApp(tmp.path);
        const res = await request(app).post('/api/jobs')
            .field('payload', JSON.stringify({name: 'upload', importFrom: {upload: true}, mirror: {new: {name: 'My export'}}, start: true}))
            .attach('file', fixture('ghan.csv'));
        expect(res.status, JSON.stringify(res.body)).eq(201);
        expect(res.body.importFrom).to.deep.include({kind: 'file', originalName: 'ghan.csv', format: 'lastfm-ghan-csv'});
        expect(res.body.persistInputs).is.false;
        expect(res.body.mirror).to.deep.include({name: 'My export', service: 'mixed', account: null});
        expect(res.body.importOverlap).eq('skip');

        const done = await waitForImport(app, res.body.id);
        expect(done.imported).eq(6);
        expect(done.mirrorPlaysInRange).eq(6);
        expect(done.status).eq('completed');
    });

    it('creates a job from a file already in the imports folder and hides it from options afterwards', async function () {
        await using tmp = await createTmpDir('jobExisting');
        await copyFile(fixture('ghan.json'), path.join(tmp.path, 'my-export.json'));
        const {app} = await buildApp(tmp.path);

        const before = await request(app).get('/api/jobs/options');
        expect(before.body.importFiles.map((x: {name: string}) => x.name)).to.include('my-export.json');

        const res = await request(app).post('/api/jobs').send({name: 'existing', importFrom: {existingFile: 'my-export.json'}, mirror: {new: {name: 'existing'}}});
        expect(res.status, JSON.stringify(res.body)).eq(201);
        expect(res.body.importFrom.format).eq('lastfm-ghan-json');
        expect(res.body.importStatus).eq('idle');

        const after = await request(app).get('/api/jobs/options');
        expect(after.body.importFiles.map((x: {name: string}) => x.name)).to.not.include('my-export.json');

        // deleting the job keeps a file the user placed themselves
        expect((await request(app).delete(`/api/jobs/${res.body.id}`)).status).eq(204);
        expect(await readdir(tmp.path)).to.include('my-export.json');
    });

    it('rejects existing file names that escape the imports folder', async function () {
        await using tmp = await createTmpDir('jobTraversal');
        const {app} = await buildApp(tmp.path);
        for (const name of ['../secret.json', '.hidden', 'sub/dir.json']) {
            const res = await request(app).post('/api/jobs').send({name: 'bad', importFrom: {existingFile: name}, mirror: {new: {name: 'x'}}});
            expect(res.status, name).eq(400);
        }
    });

    it('rejects an unsupported upload and removes the file', async function () {
        await using tmp = await createTmpDir('jobBadUpload');
        const bad = path.join(tmp.path, 'source.csv');
        await writeFile(bad, 'a,b,c\n1,2,3\n');
        const importsDir = path.join(tmp.path, 'imports');
        const {app} = await buildApp(importsDir);
        const res = await request(app).post('/api/jobs')
            .field('payload', JSON.stringify({name: 'bad', importFrom: {upload: true}, mirror: {new: {name: 'x'}}}))
            .attach('file', bad);
        expect(res.status).eq(400);
        expect(res.body.error).to.include('not a supported');
        expect(await readdir(path.join(importsDir, 'uploads'))).length(0);
    });

    it('imports benjaminbenben files into the chosen mirror with the given overlap mode', async function () {
        await using tmp = await createTmpDir('jobBenjamin');
        const {app} = await buildApp(tmp.path);
        const existing = await request(app).post('/api/jobs').field('payload', JSON.stringify({name: 'a', importFrom: {upload: true}, mirror: {new: {name: 'shared'}}})).attach('file', fixture('ghan.csv'));
        const res = await request(app).post('/api/jobs')
            .field('payload', JSON.stringify({name: 'b', importFrom: {upload: true}, mirror: {id: existing.body.mirror.id}, overlap: 'replace'}))
            .attach('file', fixture('benjamin.csv'));
        expect(res.status, JSON.stringify(res.body)).eq(201);
        expect(res.body.mirror.id).eq(existing.body.mirror.id);
        expect(res.body.importOverlap).eq('replace');
        expect(res.body.importReplacedAt).null;
    });

    it('rejects imports into a locked mirror but allows exporting from it', async function () {
        await using tmp = await createTmpDir('jobLockedMirror');
        await copyFile(fixture('ghan.csv'), path.join(tmp.path, 'placed.csv'));
        const {app, db} = await buildApp(tmp.path);
        const owner = await ensureOwner(db);
        const locked = await new MirrorRepository(db).findOrCreate({userId: owner.id, service: 'tealfm', account: 'did:plc:abc', name: 'teal'});
        const res = await request(app).post('/api/jobs').send({name: 'x', importFrom: {existingFile: 'placed.csv'}, mirror: {id: locked.id}});
        expect(res.status).eq(400);
        expect(res.body.error).to.include("can't be imported into");
        const options = (await request(app).get('/api/jobs/options')).body;
        expect(options.mirrors.find((x: {id: number}) => x.id === locked.id)).to.deep.include({locked: true});
        const exportOnly = await request(app).post('/api/jobs').send({name: 'x', importFrom: {mirrorId: locked.id}, overlap: 'replace'});
        expect(exportOnly.status, JSON.stringify(exportOnly.body)).eq(201);
        expect(exportOnly.body.importOverlap).eq('skip');
    });

    it('requires an authenticated Last.fm component and creates a mirror named after its account', async function () {
        await using tmp = await createTmpDir('jobComponent');
        const resolved: Record<number, object> = {};
        const {app, db} = await buildApp(tmp.path, resolved);
        const [unauthed, authed, spotify] = await db.insert(components).values([
            fixtureCreateComponent({uid: 'lfm1', type: 'lastfm'}),
            fixtureCreateComponent({uid: 'lfm2', type: 'lastfm'}),
            fixtureCreateComponent({uid: 'sp', type: 'spotify'}),
        ]).returning();
        resolved[unauthed.id] = fakeLastfmComponent(undefined);
        resolved[authed.id] = fakeLastfmComponent('lfmuser');
        resolved[spotify.id] = {type: 'spotify'};

        expect((await request(app).post('/api/jobs').send({name: 'x', importFrom: {componentId: unauthed.id}})).status).eq(400);
        expect((await request(app).post('/api/jobs').send({name: 'x', importFrom: {componentId: spotify.id}})).status).eq(400);
        const res = await request(app).post('/api/jobs').send({name: 'x', importFrom: {componentId: authed.id}, range: {from: '2014-01-01T00:00:00Z', to: '2015-01-01T00:00:00Z'}});
        expect(res.status, JSON.stringify(res.body)).eq(201);
        expect(res.body.mirror).to.deep.include({name: 'Last.fm lfmuser', account: null});
        expect(res.body.persistInputs).is.true;
        // into an existing mirror, IE one a file filled
        const into = await request(app).post('/api/jobs').send({name: 'y', importFrom: {componentId: authed.id}, mirror: {id: res.body.mirror.id}});
        expect(into.status, JSON.stringify(into.body)).eq(201);
        expect(into.body.mirror.id).eq(res.body.mirror.id);
        expect(res.body.importFrom).to.deep.include({kind: 'component', componentId: authed.id});
        expect(res.body.rangeFrom).eq('2014-01-01T00:00:00.000Z');
    });

    it('validates the payload', async function () {
        await using tmp = await createTmpDir('jobValidate');
        const {app} = await buildApp(tmp.path);
        expect((await request(app).post('/api/jobs').send({importFrom: {upload: true}})).status).eq(400);
        expect((await request(app).post('/api/jobs').send({name: 'x', importFrom: {existingFile: 'nope.csv'}, mirror: {new: {name: 'x'}}})).status).eq(404);
        expect((await request(app).post('/api/jobs').send({name: 'x', importFrom: {upload: true}, mirror: {new: {name: 'x'}}})).status).eq(400);
    });

    it('controls, renames and deletes a job', async function () {
        await using tmp = await createTmpDir('jobControl');
        const {app} = await buildApp(tmp.path);
        const created = await request(app).post('/api/jobs')
            .field('payload', JSON.stringify({name: 'ctl', importFrom: {upload: true}, mirror: {new: {name: 'ctl'}}}))
            .attach('file', fixture('ghan.csv'));
        const id = created.body.id;
        const uploadedName = (await readdir(path.join(tmp.path, 'uploads')))[0];
        expect(uploadedName).to.match(/\.csv$/);

        expect((await request(app).post(`/api/jobs/${id}/pause`)).body.importStatus).eq('idle');
        expect((await request(app).post(`/api/jobs/${id}/import/start`)).status).eq(200);
        await waitForImport(app, id);

        const renamed = await request(app).patch(`/api/jobs/${id}`).send({name: 'renamed'});
        expect(renamed.body.name).eq('renamed');

        const list = await request(app).get('/api/jobs');
        expect(list.body.map((x: JobApiJson) => x.id)).to.include(id);

        expect((await request(app).delete(`/api/jobs/${id}`)).status).eq(204);
        expect((await request(app).get(`/api/jobs/${id}`)).status).eq(404);
        // uploaded file is removed with the job
        expect(await readdir(path.join(tmp.path, 'uploads'))).to.not.include(uploadedName);
    });

    it('removes uploads that are not used by the job', async function () {
        await using tmp = await createTmpDir('jobUnusedUpload');
        await copyFile(fixture('ghan.json'), path.join(tmp.path, 'placed.json'));
        const {app} = await buildApp(tmp.path);
        const res = await request(app).post('/api/jobs')
            .field('payload', JSON.stringify({name: 'x', importFrom: {existingFile: 'placed.json'}, mirror: {new: {name: 'x'}}}))
            .attach('file', fixture('ghan.csv'));
        expect(res.status, JSON.stringify(res.body)).eq(201);
        expect(await readdir(path.join(tmp.path, 'uploads'))).length(0);

        const other = await request(app).post('/api/jobs')
            .field('payload', JSON.stringify({name: 'x', importFrom: {upload: true}, mirror: {new: {name: 'x'}}}))
            .attach('notfile', fixture('ghan.csv'));
        expect(other.status).eq(400);
        expect(await readdir(path.join(tmp.path, 'uploads'))).length(0);
    });

    it('rejects more than one file and removes them', async function () {
        await using tmp = await createTmpDir('jobTwoFiles');
        const {app} = await buildApp(tmp.path);
        const res = await request(app).post('/api/jobs')
            .field('payload', JSON.stringify({name: 'x', importFrom: {upload: true}, mirror: {new: {name: 'x'}}}))
            .attach('file', fixture('ghan.csv'))
            .attach('file', fixture('benjamin.csv'));
        expect(res.status).gte(400).lt(500);
        expect(await readdir(path.join(tmp.path, 'uploads'))).length(0);
    });

    it('never lists uploads as existing files', async function () {
        await using tmp = await createTmpDir('jobUploadsHidden');
        const {app} = await buildApp(tmp.path);
        await request(app).post('/api/jobs')
            .field('payload', JSON.stringify({name: 'x', importFrom: {upload: true}, mirror: {new: {name: 'x'}}}))
            .attach('file', fixture('ghan.csv'));
        const options = await request(app).get('/api/jobs/options');
        expect(options.body.importFiles).length(0);
        const [upload] = await readdir(path.join(tmp.path, 'uploads'));
        const res = await request(app).post('/api/jobs').send({name: 'y', importFrom: {existingFile: `uploads/${upload}`}, mirror: {new: {name: 'y'}}});
        expect(res.status).eq(400);
    });

    it('validates the range and clamps a future end to now', async function () {
        await using tmp = await createTmpDir('jobRange');
        await copyFile(fixture('ghan.csv'), path.join(tmp.path, 'placed.csv'));
        const {app} = await buildApp(tmp.path);
        const bad = await request(app).post('/api/jobs').send({name: 'x', importFrom: {existingFile: 'placed.csv'}, mirror: {new: {name: 'orphan?'}}, range: {from: '2015-01-01T00:00:00Z', to: '2014-01-01T00:00:00Z'}});
        expect(bad.status).eq(400);
        expect((await request(app).get('/api/jobs/options')).body.mirrors.map((x: {name: string}) => x.name)).to.not.include('orphan?');

        const future = await request(app).post('/api/jobs').send({name: 'x', importFrom: {existingFile: 'placed.csv'}, mirror: {new: {name: 'future'}}, range: {to: dayjs().add(1, 'year').toISOString()}});
        expect(future.status).eq(201);
        expect(dayjs(future.body.rangeTo).isAfter(dayjs())).is.false;
    });

    it('always creates a separate mirror for a new mirror', async function () {
        await using tmp = await createTmpDir('jobMirrorResolve');
        await copyFile(fixture('ghan.csv'), path.join(tmp.path, 'placed.csv'));
        const {app} = await buildApp(tmp.path);
        const a = await request(app).post('/api/jobs').send({name: 'a', importFrom: {existingFile: 'placed.csv'}, mirror: {new: {name: 'same'}}});
        const b = await request(app).post('/api/jobs').send({name: 'b', importFrom: {existingFile: 'placed.csv'}, mirror: {new: {name: 'same'}}});
        expect(b.body.mirror.id).not.eq(a.body.mirror.id);
    });

    it('returns 201 with startError when the import cannot start', async function () {
        await using tmp = await createTmpDir('jobStartConflict');
        await copyFile(fixture('ghan.csv'), path.join(tmp.path, 'placed.csv'));
        const {app, jobs} = await buildApp(tmp.path);
        const first = await request(app).post('/api/jobs').send({name: 'a', importFrom: {existingFile: 'placed.csv'}, mirror: {new: {name: 'm'}}});
        jobs.locks.tryAcquire(`mirror-import:${first.body.mirror.id}`, 'someone');
        const second = await request(app).post('/api/jobs').send({name: 'b', importFrom: {existingFile: 'placed.csv'}, mirror: {id: first.body.mirror.id}, start: true});
        expect(second.status).eq(201);
        expect(second.body.startError).to.include('already running');
    });

    it("hides other users' jobs", async function () {
        await using tmp = await createTmpDir('jobOtherUser');
        const {app, db} = await buildApp(tmp.path);
        const other = (await db.insert(users).values({id: `other-${Date.now()}`, name: 'other', email: `other-${Date.now()}@x.local`, emailVerified: false, createdAt: new Date(), updatedAt: new Date()}).returning())[0];
        const mirror = await new MirrorRepository(db).findOrCreate({userId: other.id, service: 'lastfm', account: null, name: 'other'});
        const job = await new JobRepository(db).create({userId: other.id, name: 'theirs', mirrorId: mirror.id, rangeTo: dayjs()});

        expect((await request(app).get(`/api/jobs/${job.id}`)).status).eq(404);
        expect((await request(app).get(`/api/jobs/${job.id}/metrics`)).status).eq(404);
        expect((await request(app).post(`/api/jobs/${job.id}/start`)).status).eq(404);
        expect((await request(app).delete(`/api/jobs/${job.id}`)).status).eq(404);
        expect((await request(app).get('/api/jobs')).body.map((x: JobApiJson) => x.id)).to.not.include(job.id);

        // their mirrors can't be used or seen either
        await copyFile(fixture('ghan.csv'), path.join(tmp.path, 'placed.csv'));
        expect((await request(app).post('/api/jobs').send({name: 'x', importFrom: {existingFile: 'placed.csv'}, mirror: {id: mirror.id}})).status).eq(404);
        expect((await request(app).get('/api/jobs/options')).body.mirrors.map((x: {id: number}) => x.id)).to.not.include(mirror.id);
    });

    describe('Transforms', function () {

        const presets = {clean: [{type: 'user', title: ['(Remastered)']}], bad: {type: 'nope'}, unknownName: {type: 'musicbrainz', name: 'doesNotExist'}, empty: []} as unknown as Record<string, PlayTransformHookConfig>;

        const transformApp = async (tmpPath: string) => {
            await copyFile(fixture('ghan.json'), path.join(tmpPath, 'export.json'));
            const withHooks = fakeClient(7, 'maloja', {preCompare: {type: 'user', artists: ['feat']}});
            const lastfm = fakeClient(8, 'lastfm');
            return buildApp(tmpPath, {7: withHooks, 8: lastfm}, {transformersPresets: presets, clients: [withHooks, lastfm]});
        }

        it('lists targets, presets and component transforms in options', async function () {
            await using tmp = await createTmpDir('jobTransformOptions');
            const {app} = await transformApp(tmp.path);
            const body = (await request(app).get('/api/jobs/options')).body as JobOptionsApiJson;
            expect(body.targets).eql([
                {componentId: 7, name: 'client 7', type: 'maloja', ready: true, rejectsOldScrobbles: false},
                {componentId: 8, name: 'client 8', type: 'lastfm', ready: true, rejectsOldScrobbles: true},
            ]);
            expect(body.presets).eql([{name: 'clean', stages: [{type: 'user', title: ['(Remastered)']}]}, {name: 'bad', stages: [{type: 'nope'}]}, {name: 'unknownName', stages: [{type: 'musicbrainz', name: 'doesNotExist'}]}, {name: 'empty', stages: []}]);
            expect(body.componentTransforms).eql([{componentId: 7, name: 'client 7', mode: 'client', preCompare: [{type: 'user', artists: ['feat']}]}]);
        });

        it('snapshots stages from a preset or a component hook', async function () {
            await using tmp = await createTmpDir('jobTransformCreate');
            const {app} = await transformApp(tmp.path);

            const fromPreset = await create(app, {preset: 'clean'});
            expect(fromPreset.status, JSON.stringify(fromPreset.body)).eq(201);
            expect(fromPreset.body.transformSource).eql({kind: 'preset', name: 'clean'});
            expect(fromPreset.body.transformOptions).eql([{type: 'user', title: ['(Remastered)']}]);

            const fromComponent = await create(app, {componentId: 7, hook: 'preCompare'});
            expect(fromComponent.status, JSON.stringify(fromComponent.body)).eq(201);
            expect(fromComponent.body.transformSource).eql({kind: 'component', componentId: 7, componentName: 'client 7', hook: 'preCompare'});
            expect(fromComponent.body.transformOptions).eql([{type: 'user', artists: ['feat']}]);

            const none = await create(app, undefined);
            expect(none.body.transformSource).is.null;
            expect(none.body.transformOptions).is.null;
        });

        it('rejects missing or invalid transforms', async function () {
            await using tmp = await createTmpDir('jobTransformInvalid');
            const {app} = await transformApp(tmp.path);
            for (const transforms of [{preset: 'missing'}, {preset: 'bad'}, {preset: 'unknownName'}, {preset: 'empty'}, {componentId: 7, hook: 'postCompare'}, {componentId: 99, hook: 'preCompare'}]) {
                const res = await create(app, transforms);
                expect(res.status, JSON.stringify(transforms)).eq(400);
            }
            const list = await request(app).get('/api/jobs');
            expect(list.body).length(0);
        });
    });

    describe('Exports', function () {

        const exportApp = async (tmpPath: string) => {
            await copyFile(fixture('ghan.json'), path.join(tmpPath, 'export.json'));
            const maloja = fakeClient(7, 'maloja');
            const built = await buildApp(tmpPath, {7: maloja}, {clients: [maloja]});
            await built.db.insert(components).values({...fixtureCreateComponent({mode: 'client', type: 'maloja', uid: 'maloja'}), id: 7});
            return built;
        }
        const createWithTargets = (app: Express, body: object) => request(app).post('/api/jobs').send({name: 'export', importFrom: {existingFile: 'export.json'}, mirror: {new: {name: 'm'}}, ...body});

        it('creates targets with export options', async function () {
            await using tmp = await createTmpDir('jobExportCreate');
            const {app} = await exportApp(tmp.path);
            const res = await createWithTargets(app, {targets: [7, 7], exportOrder: 'asc', exportQueueLimit: 5, upstreamCheck: false, exportDiscarded: true});
            expect(res.status, JSON.stringify(res.body)).eq(201);
            const job = res.body as JobApiJson;
            expect(job.exportOrder).eq('asc');
            expect(job.exportQueueLimit).eq(5);
            expect(job.exportUpstreamCheck).is.false;
            expect(job.exportDiscarded).is.true;
            expect(job.targets).length(1);
            expect(job.targets[0]).to.deep.include({componentId: 7, name: 'client 7', type: 'maloja', status: 'idle', exported: 0, cursor: null});

            const listed = (await request(app).get('/api/jobs')).body as JobApiJson[];
            expect(listed[0].targets.map(x => x.componentId)).eql([7]);
        });

        it('returns metrics for the job and its clients only', async function () {
            await using tmp = await createTmpDir('jobMetrics');
            const {app, db} = await exportApp(tmp.path);
            const job = (await createWithTargets(app, {targets: [7]})).body as JobApiJson;
            await db.insert(plays).values([fixtureCreatePlay({componentId: 7, state: 'scrobbled'}), fixtureCreatePlay({componentId: 7, state: 'scrobbled'})]);
            exportStageSeconds.observe({job: String(job.id), name: 'client-7', stage: 'pass'}, 0.5);
            exportStageSeconds.observe({job: String(job.id + 1000), name: 'client-7', stage: 'pass'}, 0.5);
            playStageSeconds.observe({mode: 'client', name: 'client-7', job: '', stage: 'queue_next'}, 0.1);
            playStageSeconds.observe({mode: 'client', name: 'client-8', job: '', stage: 'queue_next'}, 0.1);

            // other metrics' collect() is never run, some need state only the /metrics route sets up
            new prom.Gauge({name: 'test_broken_collect', help: 'x', collect() { throw new Error('not set up'); }});
            let res;
            try {
                res = await request(app).get(`/api/jobs/${job.id}/metrics`);
            } finally {
                prom.register.removeSingleMetric('test_broken_collect');
            }
            expect(res.status, JSON.stringify(res.body)).eq(200);
            const body = res.body as JobMetricsApiJson;
            expect(body.job).to.deep.include({id: job.id, exportQueueLimit: job.exportQueueLimit});
            expect(body.targets).length(1);
            expect(body.targets[0]).to.deep.include({componentId: 7, name: 'client 7', clientPlays: 2});
            expect(body.process.memory.rss).greaterThan(0);
            const values = body.metrics.flatMap(m => m.values);
            expect(values.some(v => v.labels.job === String(job.id) && v.labels.stage === 'pass')).is.true;
            expect(values.some(v => v.labels.name === 'client-7' && v.labels.stage === 'queue_next')).is.true;
            expect(values.some(v => v.labels.job === String(job.id + 1000) || v.labels.name === 'client-8')).is.false;
        });

        it('creates a job that only exports an existing mirror', async function () {
            await using tmp = await createTmpDir('jobExportMirrorOnly');
            const {app} = await exportApp(tmp.path);
            const imported = (await createWithTargets(app, {start: true})).body as JobApiJson;
            const done = await waitForImport(app, imported.id);

            const res = await request(app).post('/api/jobs').send({name: 'again', importFrom: {mirrorId: imported.mirror.id}, targets: [7], persistInputs: true});
            expect(res.status, JSON.stringify(res.body)).eq(201);
            const job = res.body as JobApiJson;
            expect(job.importFrom).eql({kind: 'mirror'});
            expect(job.mirror.id).eq(imported.mirror.id);
            expect(job.persistInputs).is.false;
            expect(job.mirrorPlaysInRange).eq(done.imported);

            const started = await request(app).post(`/api/jobs/${job.id}/start`);
            expect(started.body.importStatus).eq('completed');
            expect(started.body.imported).eq(0);

            expect((await request(app).post('/api/jobs').send({name: 'missing', importFrom: {mirrorId: 9999}})).status).eq(404);
        });

        it('rejects unknown clients and bad limits without creating a job', async function () {
            await using tmp = await createTmpDir('jobExportInvalid');
            const {app} = await exportApp(tmp.path);
            for (const body of [{targets: [99]}, {exportQueueLimit: 0}, {exportQueueLimit: 1001}, {exportOrder: 'random'}]) {
                const res = await createWithTargets(app, body);
                expect(res.status, JSON.stringify(body)).eq(400);
            }
            expect((await request(app).get('/api/jobs')).body).length(0);
        });

        it('updates the queue limit and controls one target or the whole job', async function () {
            await using tmp = await createTmpDir('jobExportControl');
            const {app} = await exportApp(tmp.path);
            const job = (await createWithTargets(app, {targets: [7]})).body as JobApiJson;
            const targetId = job.targets[0].id;

            const patched = await request(app).patch(`/api/jobs/${job.id}`).send({exportQueueLimit: 50});
            expect(patched.body.exportQueueLimit).eq(50);
            expect(patched.body.exportUpstreamCheck).is.true;
            const unchecked = await request(app).patch(`/api/jobs/${job.id}`).send({upstreamCheck: false});
            expect(unchecked.body).to.deep.include({exportUpstreamCheck: false, exportQueueLimit: 50, exportDiscarded: false});
            const keepDiscarded = await request(app).patch(`/api/jobs/${job.id}`).send({exportDiscarded: true});
            expect(keepDiscarded.body).to.deep.include({exportDiscarded: true, exportUpstreamCheck: false});

            // the client isn't running in this app so the export keeps waiting
            const started = await request(app).post(`/api/jobs/${job.id}/targets/${targetId}/start`);
            expect(started.status, JSON.stringify(started.body)).eq(200);
            expect(started.body.targets[0].status).eq('running');
            expect(started.body.status).eq('running');

            const paused = await request(app).post(`/api/jobs/${job.id}/targets/${targetId}/pause`);
            expect(paused.body.targets[0].status).eq('paused');

            expect((await request(app).post(`/api/jobs/${job.id}/targets/9999/start`)).status).eq(404);

            await request(app).post(`/api/jobs/${job.id}/start`);
            const stopped = await request(app).post(`/api/jobs/${job.id}/stop`);
            expect(stopped.body.targets[0].status).eq('stopped');
        });
    });

    describe('Cleanup', function () {

        const cleanupApp = async (tmpPath: string) => {
            await copyFile(fixture('ghan.json'), path.join(tmpPath, 'export.json'));
            const maloja = fakeClient(7, 'maloja');
            const built = await buildApp(tmpPath, {7: maloja}, {clients: [maloja]});
            await built.db.insert(components).values({...fixtureCreateComponent({mode: 'client', type: 'maloja', uid: 'maloja'}), id: 7});
            const created = (await request(built.app).post('/api/jobs').send({name: 'imp', importFrom: {existingFile: 'export.json'}, mirror: {new: {name: 'm'}}, start: true})).body as JobApiJson;
            const job = await waitForImport(built.app, created.id);
            // what an export to component 7 would have left: 2 plays of this job and 1 of a deleted job
            await new JobTargetRepository(built.db).createForJob(job.id, [7]);
            await built.db.insert(plays).values([
                fixtureCreatePlay({state: 'scrobbled', componentId: 7, jobId: job.id, play: generatePlay({}, {jobId: job.id})}),
                fixtureCreatePlay({state: 'failed', componentId: 7, jobId: job.id, play: generatePlay({}, {jobId: job.id})}),
                fixtureCreatePlay({state: 'scrobbled', componentId: 7, play: generatePlay({}, {jobId: 9999})}),
            ]);
            return {...built, job};
        }
        const clientPlays = async (db: Awaited<ReturnType<typeof buildApp>>['db']) => (await db.select().from(plays)).map(x => ({jobId: x.jobId, compacted: x.compacted}));
        const until = async (fn: () => Promise<boolean>) => {
            for (let i = 0; i < 100; i++) {
                if (await fn()) {
                    return;
                }
                await new Promise(r => setTimeout(r, 20));
            }
            throw new Error('timed out');
        }
        const mirrorIdle = (app: Express, id: number) => until(async () => (await request(app).get(`/api/mirrors/${id}`)).body.task === null);

        it('lists, renames and cleans up mirrors by range', async function () {
            await using tmp = await createTmpDir('cleanupMirror');
            const {app, job} = await cleanupApp(tmp.path);
            const list = (await request(app).get('/api/mirrors')).body as MirrorApiJson[];
            expect(list.map(x => x.id)).eql([job.mirror.id]);
            expect(list[0].plays).eq(job.imported);
            expect(list[0].jobs).eql([{id: job.id, name: 'imp'}]);

            const renamed = await request(app).patch(`/api/mirrors/${job.mirror.id}`).send({name: 'renamed'});
            expect(renamed.body.name).eq('renamed');

            // everything, in a range that covers it all
            const res = await request(app).post(`/api/mirrors/${job.mirror.id}/cleanup`).send({action: 'delete', range: {from: '2000-01-01T00:00:00Z', to: dayjs().toISOString()}});
            expect(res.status, JSON.stringify(res.body)).eq(202);
            await mirrorIdle(app, job.mirror.id);
            const after = (await request(app).get(`/api/mirrors/${job.mirror.id}`)).body as MirrorApiJson;
            expect(after.plays).eq(0);

            expect((await request(app).post(`/api/mirrors/${job.mirror.id}/cleanup`).send({action: 'delete', range: {from: dayjs().toISOString(), to: '2000-01-01T00:00:00Z'}})).status).eq(400);
            expect((await request(app).post(`/api/mirrors/${job.mirror.id}/cleanup`).send({action: 'shred'})).status).eq(400);
        });

        it('reports mirror data issues to the owner only', async function () {
            await using tmp = await createTmpDir('mirrorIssues');
            const {app, db} = await buildApp(tmp.path);
            const owner = await ensureOwner(db);
            const mirror = await new MirrorRepository(db).findOrCreate({userId: owner.id, service: 'mixed', account: null, name: 'm'});
            const t = Date.UTC(2020, 0, 1);
            // a burst at epoch and one in 2020
            await new DrizzlePlayHistoricalRepository(db).insertIgnoreDuplicates([0, 1000, 2000, t, t + 1000, t + 2000].map((ms, i) => ({
                uid: `m${mirror.id}:${i}`,
                mirrorId: mirror.id,
                play: generatePlay({track: nameToCredit('Satisfaction'), artists: namesToCredits(['The Rolling Stones']), playDate: dayjs(ms)}),
            })));
            const summary = await request(app).get(`/api/mirrors/${mirror.id}/issues`);
            expect(summary.status, JSON.stringify(summary.body)).eq(200);
            expect(summary.body).eql({badTimestamp: 3, bursts: 2, burstPlays: 6, plays: 6});
            expect((await request(app).get(`/api/mirrors/${mirror.id}/issues`).query({from: t})).body.bursts).eq(1);
            expect((await request(app).get(`/api/mirrors/${mirror.id}/issues`).query({from: t, to: 0})).status).eq(400);

            const list = await request(app).get(`/api/mirrors/${mirror.id}/issues/list`).query({offset: 1, limit: 1});
            expect(list.status, JSON.stringify(list.body)).eq(200);
            expect(list.body.meta).eql({offset: 1, limit: 1, total: 2});
            expect(list.body.data[0]).to.deep.include({tags: ['burst'], count: 3, firstPlayedAt: t, lastPlayedAt: t + 2000});
            expect(list.body.data[0].play.data.track.name).eq('Satisfaction');
            expect((await request(app).get(`/api/mirrors/${mirror.id}/issues/list`).query({limit: 500})).status).eq(400);

            const other = (await db.insert(users).values({id: `other-${Date.now()}`, name: 'other', email: `other-${Date.now()}@x.local`, emailVerified: false, createdAt: new Date(), updatedAt: new Date()}).returning())[0];
            const theirs = await new MirrorRepository(db).findOrCreate({userId: other.id, service: 'mixed', account: null, name: 'theirs'});
            expect((await request(app).get(`/api/mirrors/${theirs.id}/issues`)).status).eq(404);
            expect((await request(app).get(`/api/mirrors/${theirs.id}/issues/list`)).status).eq(404);
        });

        it('deletes a mirror only once no job uses it', async function () {
            await using tmp = await createTmpDir('cleanupMirrorDelete');
            const {app, job} = await cleanupApp(tmp.path);
            const refused = await request(app).delete(`/api/mirrors/${job.mirror.id}`);
            expect(refused.status).eq(409);
            expect(refused.body.error).to.include("'imp'");

            expect((await request(app).delete(`/api/jobs/${job.id}`)).status).eq(204);
            expect((await request(app).delete(`/api/mirrors/${job.mirror.id}`)).status).eq(202);
            await until(async () => (await request(app).get(`/api/mirrors/${job.mirror.id}`)).status === 404);
        });

        it("hides other users' mirrors", async function () {
            await using tmp = await createTmpDir('cleanupMirrorOther');
            const {app, db} = await buildApp(tmp.path);
            const other = (await db.insert(users).values({id: `other-${Date.now()}`, name: 'other', email: `other-${Date.now()}@x.local`, emailVerified: false, createdAt: new Date(), updatedAt: new Date()}).returning())[0];
            const mirror = await new MirrorRepository(db).findOrCreate({userId: other.id, service: 'lastfm', account: null, name: 'other'});
            expect((await request(app).get('/api/mirrors')).body).eql([]);
            expect((await request(app).get(`/api/mirrors/${mirror.id}`)).status).eq(404);
            expect((await request(app).patch(`/api/mirrors/${mirror.id}`).send({name: 'x'})).status).eq(404);
            expect((await request(app).post(`/api/mirrors/${mirror.id}/cleanup`).send({action: 'delete'})).status).eq(404);
            expect((await request(app).delete(`/api/mirrors/${mirror.id}`)).status).eq(404);
        });

        it("cleans up a job's mirror data and scrobbles, and deletes it with cleanup", async function () {
            await using tmp = await createTmpDir('cleanupJob');
            const {app, job, db} = await cleanupApp(tmp.path);
            expect(((await request(app).get(`/api/jobs/${job.id}`)).body as JobApiJson).targets[0].records).eq(2);
            expect((await request(app).post(`/api/jobs/${job.id}/cleanup/historical`).send({action: 'compact'})).status).eq(202);
            await mirrorIdle(app, job.mirror.id);
            const historical = await db.select().from(playsHistorical);
            expect(historical.length).eq(job.imported);
            expect(historical.every(x => x.compacted === 'input')).is.true;

            expect((await request(app).post(`/api/jobs/${job.id}/cleanup/scrobbles`).send({action: 'delete'})).status).eq(202);
            await until(async () => (await clientPlays(db)).length === 1);
            // only the deleted job's play is left, and the job keeps its numbers
            expect(await clientPlays(db)).eql([{jobId: null, compacted: null}]);
            const cleaned = (await request(app).get(`/api/jobs/${job.id}`)).body as JobApiJson;
            expect(cleaned.targets[0].stats).eql({scrobbled: 1, failed: 1});
            expect(cleaned.targets[0].records).eq(0);

            expect((await request(app).delete(`/api/jobs/${job.id}?historical=nuke`)).status).eq(400);
            expect((await request(app).delete(`/api/jobs/${job.id}?historical=delete&scrobbles=delete`)).status).eq(202);
            await until(async () => (await request(app).get(`/api/jobs/${job.id}`)).status === 404);
            expect(((await request(app).get(`/api/mirrors/${job.mirror.id}`)).body as MirrorApiJson).plays).eq(0);
        });

        it('refuses a new job on a mirror being cleaned up', async function () {
            await using tmp = await createTmpDir('cleanupJobCreate');
            const {app, jobs, job} = await cleanupApp(tmp.path);
            jobs.locks.tryAcquire(mirrorLockKey(job.mirror.id), 'test');
            const res = await request(app).post('/api/jobs').send({name: 'again', importFrom: {mirrorId: job.mirror.id}, targets: [7]});
            expect(res.status).eq(409);
            expect((await request(app).get('/api/jobs')).body).length(1);
        });

        it("summarizes and cleans up a Client's job plays", async function () {
            await using tmp = await createTmpDir('cleanupClient');
            const {app, db} = await cleanupApp(tmp.path);
            const summary = await request(app).get('/api/components/7/job-plays/summary');
            expect(summary.status).eq(200);
            expect(summary.body).eql({total: 3, queued: 0, orphaned: 1, compacted: 0, exportingJobs: [], task: null});
            expect((await request(app).post('/api/components/7/cleanup/job-plays').send({action: 'compact'})).status).eq(202);
            await until(async () => (await request(app).get('/api/components/7/job-plays/summary')).body.compacted === 3);
            expect((await request(app).post('/api/components/7/cleanup/job-plays').send({action: 'delete'})).status).eq(202);
            await until(async () => (await clientPlays(db)).length === 0);
            expect((await request(app).get('/api/components/99/job-plays/summary')).status).eq(404);
            expect((await request(app).post('/api/components/99/cleanup/job-plays').send({action: 'delete'})).status).eq(404);
        });
    });
});

