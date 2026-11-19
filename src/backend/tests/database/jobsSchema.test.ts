import { expect } from 'chai';
import { describe, it } from 'mocha';
import * as fs from 'fs/promises';
import * as path from 'path';
import dayjs from 'dayjs';
import { eq } from 'drizzle-orm';
import { getDb, migrateDb } from '../../common/database/drizzle/drizzleUtils.ts';
import { components, jobs, jobTargets, playMirrors, plays } from '../../common/database/drizzle/schema/schema.ts';
import { users } from '../../common/database/drizzle/schema/auth.ts';
import { projectRootDir } from '../../common/infrastructure/Atomic.ts';
import { createTmpDir } from '../utils/tmpDir.ts';
import { fixtureCreateComponent, fixtureCreatePlay } from '../utils/databaseFixtures.ts';
import { transientDb } from '../utils/TransientTestUtils.ts';
import { ensureOwner } from '../../common/auth/owner.ts';

const MIGRATIONS = path.resolve(projectRootDir, 'src/backend/common/database/drizzle/migrations');

describe('Jobs Schema', function () {

    it('recreating jobs does not delete existing plays', async function () {
        this.timeout(10000);
        const all = (await fs.readdir(MIGRATIONS)).sort();
        const jobsIndex = all.findIndex(x => x.endsWith('_jobs_import'));
        expect(jobsIndex).gt(0);

        await using tmp = await createTmpDir('jobsRecreate');
        const mf = path.join(tmp.path, 'migrations');
        await fs.mkdir(mf);
        for (const m of all.slice(0, jobsIndex)) {
            await fs.cp(path.join(MIGRATIONS, m), path.join(mf, m), { recursive: true });
        }

        const db = await getDb(':memory:');
        try {
            await migrateDb(db, { migrationsFolder: mf });
            const component = await db.insert(components).values(fixtureCreateComponent()).returning();
            await db.insert(plays).values(fixtureCreatePlay({ componentId: component[0].id, state: 'discovered' }));

            await migrateDb(db, { migrationsFolder: MIGRATIONS });

            expect(await db.select().from(plays)).length(1);
        } finally {
            db.$client.close();
        }
    });

    it('deleting a user cascades through mirrors and jobs', async function () {
        const db = await transientDb();
        const owner = await ensureOwner(db);
        const mirror = await db.insert(playMirrors).values({ userId: owner.id, service: 'lastfm', account: 'test', name: 'test' }).returning();
        await db.insert(jobs).values({ userId: owner.id, name: 'job', mirrorId: mirror[0].id, rangeTo: dayjs() });

        await db.delete(users).where(eq(users.id, owner.id));

        expect(await db.select().from(jobs)).length(0);
        expect(await db.select().from(playMirrors)).length(0);
    });

    it('cannot delete a mirror that a job references', async function () {
        const db = await transientDb();
        const owner = await ensureOwner(db);
        const mirror = await db.insert(playMirrors).values({ userId: owner.id, service: 'lastfm', account: 'test', name: 'test' }).returning();
        await db.insert(jobs).values({ userId: owner.id, name: 'job', mirrorId: mirror[0].id, rangeTo: dayjs() });

        let err: unknown;
        try {
            await db.delete(playMirrors).where(eq(playMirrors.id, mirror[0].id));
        } catch (e) {
            err = e;
        }
        expect(err).to.not.be.undefined;
        expect(String((err as Error).cause ?? err)).to.match(/FOREIGN KEY/);
        expect(await db.select().from(playMirrors)).length(1);
    });

    it('deleting a source component keeps the job', async function () {
        const db = await transientDb();
        const owner = await ensureOwner(db);
        const component = await db.insert(components).values(fixtureCreateComponent({ userId: owner.id, type: 'lastfm' })).returning();
        const mirror = await db.insert(playMirrors).values({ userId: owner.id, service: 'lastfm', account: 'test', name: 'test' }).returning();
        await db.insert(jobs).values({ userId: owner.id, name: 'job', mirrorId: mirror[0].id, componentFromId: component[0].id, rangeTo: dayjs() });

        await db.delete(components).where(eq(components.id, component[0].id));

        const remaining = await db.select().from(jobs);
        expect(remaining).length(1);
        expect(remaining[0].componentFromId).to.be.null;
    });

    it('job targets are deleted with their job or client and are unique per job and client', async function () {
        const db = await transientDb();
        const owner = await ensureOwner(db);
        const clientA = await db.insert(components).values(fixtureCreateComponent({ userId: owner.id, mode: 'client', type: 'maloja', uid: 'clientA', name: 'clientA' })).returning();
        const clientB = await db.insert(components).values(fixtureCreateComponent({ userId: owner.id, mode: 'client', type: 'koito', uid: 'clientB', name: 'clientB' })).returning();
        const mirror = await db.insert(playMirrors).values({ userId: owner.id, service: 'lastfm', account: 'test', name: 'test' }).returning();
        const job = await db.insert(jobs).values({ userId: owner.id, name: 'job', mirrorId: mirror[0].id, rangeTo: dayjs() }).returning();
        await db.insert(jobTargets).values([{ jobId: job[0].id, componentId: clientA[0].id }, { jobId: job[0].id, componentId: clientB[0].id }]);

        const [target] = await db.select().from(jobTargets).where(eq(jobTargets.componentId, clientA[0].id));
        expect(target.status).eq('idle');
        expect(target.breaker).eql({ failedInARow: 0 });

        let err: unknown;
        try {
            await db.insert(jobTargets).values({ jobId: job[0].id, componentId: clientA[0].id });
        } catch (e) {
            err = e;
        }
        expect(String((err as Error)?.cause ?? err)).to.match(/UNIQUE/);

        await db.delete(components).where(eq(components.id, clientA[0].id));
        expect(await db.select().from(jobTargets)).length(1);

        await db.delete(jobs).where(eq(jobs.id, job[0].id));
        expect(await db.select().from(jobTargets)).length(0);
    });
});
