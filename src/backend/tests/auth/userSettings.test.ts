import { expect } from 'chai';
import { ZodError } from 'zod';
import { transientDb } from '../utils/TransientTestUtils.ts';
import { ensureOwner } from '../../common/auth/owner.ts';
import { deleteUserSetting, getUserSetting, getUserSettings, setUserSetting } from '../../common/auth/userSettings.ts';
import { userSettings, users } from '../../common/database/drizzle/schema/auth.ts';
import { eq } from 'drizzle-orm';

describe('User Settings', function () {

    it('validates, upserts and deletes per user', async function () {
        const db = await transientDb();
        const owner = await ensureOwner(db);

        expect(await getUserSetting(db, owner.id, 'theme')).is.undefined;
        await setUserSetting(db, owner.id, 'theme', 'dark');
        await setUserSetting(db, owner.id, 'theme', 'light');
        expect(await getUserSetting(db, owner.id, 'theme')).eq('light');
        expect(await getUserSettings(db, owner.id)).eql({theme: 'light'});

        await deleteUserSetting(db, owner.id, 'theme');
        expect(await getUserSettings(db, owner.id)).eql({});
    });

    it('rejects unknown keys and invalid values', async function () {
        const db = await transientDb();
        const owner = await ensureOwner(db);

        let err: unknown;
        try { await setUserSetting(db, owner.id, 'nope', 'x'); } catch (e) { err = e; }
        expect((err as Error).message).include('Unknown user setting');

        err = undefined;
        try { await setUserSetting(db, owner.id, 'theme', 'purple'); } catch (e) { err = e; }
        expect(err).instanceOf(ZodError);
        expect(await db.query.userSettings.findMany()).length(0);
    });

    it('ignores stored values that no longer validate', async function () {
        const db = await transientDb();
        const owner = await ensureOwner(db);
        await db.insert(userSettings).values([{userId: owner.id, key: 'theme', value: 'purple'}, {userId: owner.id, key: 'removedKey', value: 1}]);
        expect(await getUserSetting(db, owner.id, 'theme')).is.undefined;
        expect(await getUserSettings(db, owner.id)).eql({});
    });

    it('is deleted with the user', async function () {
        const db = await transientDb();
        const owner = await ensureOwner(db);
        await setUserSetting(db, owner.id, 'theme', 'dark');
        await db.delete(users).where(eq(users.id, owner.id));
        expect(await db.query.userSettings.findMany()).length(0);
    });
});
