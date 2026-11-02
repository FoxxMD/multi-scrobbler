import type { SqliteDatabase, Migration } from 'sqlite-up';
import type { MigrateBaseContext } from '../appMigrator.ts';
import { components, jobs } from '../drizzle/schema/schema.ts';
import { isNull } from 'drizzle-orm';
import { ensureOwner } from '../../auth/owner.ts';

/**
 * Create the instance owner (admin user, no password) and assign every existing component and job to it.
 * */
export const up: Migration<MigrateBaseContext>['up'] = async (db: SqliteDatabase, ctx: MigrateBaseContext | undefined): Promise<void> => {
    if(ctx === undefined) {
        throw new Error('Context must be defined');
    }
    const owner = await ensureOwner(ctx.db);
    ctx.logger.info(`Assigning existing Sources/Clients and Jobs to owner '${owner.username}'`);

    const comps = await ctx.db.update(components).set({userId: owner.id}).where(isNull(components.userId)).returning({id: components.id});
    const js = await ctx.db.update(jobs).set({userId: owner.id}).where(isNull(jobs.userId)).returning({id: jobs.id});
    ctx.logger.verbose(`Assigned ${comps.length} Components and ${js.length} Jobs to owner`);
};

export const down: Migration<MigrateBaseContext>['down'] = async (db: SqliteDatabase, ctx: MigrateBaseContext | undefined): Promise<void> => {
    // ownership column is removed by reverting the drizzle migration, nothing to undo here
};
