import type { SqliteDatabase, Migration } from 'sqlite-up';
import type { MigrateBaseContext } from '../appMigrator.ts';
import { sql } from 'drizzle-orm';

/**
 * Backfill components.listenedLive (added by drizzle migration component_listened) for Sources
 * from their existing discovered Plays, using listenedFor or falling back to duration.
 *
 * Plays already removed by retention can't be counted.
 * */
export const up: Migration<MigrateBaseContext>['up'] = async (db: SqliteDatabase, ctx: MigrateBaseContext | undefined): Promise<void> => {
    if(ctx === undefined) {
        throw new Error('Context must be defined');
    }
    ctx.logger.info('Calculating listened duration for Sources');
    await ctx.db.run(sql`update components set listenedLive = coalesce((
        select round(sum(coalesce(json_extract(p.play, '$.data.listenedFor'), json_extract(p.play, '$.data.duration'), 0)))
        from plays p where p.componentId = components.id and p.state = 'discovered'), 0)
    where mode = 'source';`);
    ctx.logger.info('Done.');
};

export const down: Migration<MigrateBaseContext>['down'] = async (db: SqliteDatabase, ctx: MigrateBaseContext | undefined): Promise<void> => {
    // column is removed by reverting the drizzle migration, nothing to undo here
};
