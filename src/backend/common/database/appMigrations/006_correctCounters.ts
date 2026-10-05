import type { SqliteDatabase, Migration } from 'sqlite-up';
import type { MigrateBaseContext } from '../appMigrator.ts';
import { components } from '../drizzle/schema/schema.ts';
import { eq, sql } from 'drizzle-orm';
import type { PlayState } from '../../../../core/Atomic.ts';


export const up: Migration<MigrateBaseContext>['up'] = async (db: SqliteDatabase, ctx: MigrateBaseContext | undefined): Promise<void> => {
    if(ctx === undefined) {
        throw new Error('Context must be defined');
    }
    ctx.logger.info('Fixing countLive values');

    let more = true;
    let offset = 0,
        processed = 0,
        updated = 0;

    while (more) {
        const componentRows = await ctx.db.select().from(components).limit(100).offset(offset);
        for (const row of componentRows) {
            try {
                const res = await ctx.db.all(sql`select state, count(*) from plays p
                where componentId = ${row.id}
                group by state;`) as {state: PlayState, 'count(*)': number}[];
                let count: number | undefined = undefined;
                if(row.mode === 'source') {
                    count = res.find(x => x.state === 'discovered')?.['count(*)'];
                } else {
                    count = res.find(x => x.state === 'scrobbled')?.['count(*)'];
                }
                if(count !== undefined) {
                    await ctx.db.update(components).set({
                        countLive: count,
                    }).where(eq(components.id, row.id));
                    ctx.logger.verbose(`Updated Component ${row.id} Live Count: ${count}`);
                }
                updated++;
                processed++;
            } catch (e) {
                ctx.logger.warn(new Error(`Failed update Count Live for Component ${row.id}`, { cause: e }));
            }
        }
        offset += 100;
        ctx.logger.verbose(`Component Count Live Progress: Processed ${processed} | Updated ${updated}`);
        if (componentRows.length < 100) {
            more = false;
        }
    }

    ctx.logger.info('Done.');
};

export const down: Migration<MigrateBaseContext>['down'] = async (db: SqliteDatabase, ctx: MigrateBaseContext | undefined): Promise<void> => {
    // Rollback code here
    // context is passed as ctx
};