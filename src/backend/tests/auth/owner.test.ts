import { expect } from 'chai';
import { isNull } from 'drizzle-orm';
import { loggerTest } from '@foxxmd/logging';
import { transientDb } from '../utils/TransientTestUtils.ts';
import { fixtureCreateComponent } from '../utils/databaseFixtures.ts';
import { components } from '../../common/database/drizzle/schema/schema.ts';
import { ensureOwner, getAdminUsername, PLACEHOLDER_EMAIL_DOMAIN } from '../../common/auth/owner.ts';
import { up as ownerMigration } from '../../common/database/appMigrations/007_componentOwner.ts';
import { DrizzleComponentRepository } from '../../common/database/drizzle/repositories/ComponentRepository.ts';

describe('Auth Owner', function () {

    afterEach(function () {
        delete process.env.ADMIN_SETUP_USER;
    });

    it('creates a passwordless admin owner once', async function () {
        const db = await transientDb();
        const owner = await ensureOwner(db);
        expect(owner.username).eq('admin');
        expect(owner.role).eq('admin');
        expect(owner.email).eq(`admin@${PLACEHOLDER_EMAIL_DOMAIN}`);

        const again = await ensureOwner(db);
        expect(again.id).eq(owner.id);
        expect(await db.query.users.findMany()).length(1);
        expect(await db.query.accounts.findMany()).length(0);
    });

    it('uses ADMIN_SETUP_USER, normalized', async function () {
        process.env.ADMIN_SETUP_USER = ' Foxx ';
        expect(getAdminUsername()).eq('foxx');
        const db = await transientDb();
        expect((await ensureOwner(db)).username).eq('foxx');
    });

    it('ignores ADMIN_SETUP_USER once the owner exists', async function () {
        const db = await transientDb();
        await ensureOwner(db);
        process.env.ADMIN_SETUP_USER = 'foxx';
        expect((await ensureOwner(db)).username).eq('admin');
    });

    it('migration assigns existing components to owner', async function () {
        const db = await transientDb();
        await db.insert(components).values([fixtureCreateComponent(), fixtureCreateComponent({uid: 'other'})]);
        await ownerMigration(db.$client as any, {db, logger: loggerTest});

        const owner = await ensureOwner(db);
        expect(await db.select().from(components).where(isNull(components.userId))).length(0);
        const all = await db.query.components.findMany();
        expect(all.every(x => x.userId === owner.id)).is.true;
    });

    it('findOrInsert defaults to owner and finds by owner', async function () {
        const db = await transientDb();
        const repo = new DrizzleComponentRepository(db);
        const c = await repo.findOrInsert({mode: 'source', type: 'jellyfin', name: 'test'});
        const owner = await ensureOwner(db);
        expect(c.userId).eq(owner.id);
        const again = await repo.findOrInsert({mode: 'source', type: 'jellyfin', name: 'test'});
        expect(again.id).eq(c.id);
    });
});
