import type { SqliteDatabase, Migration } from 'sqlite-up';
import type { MigrateBaseContext } from '../appMigrator.ts';
import { sql } from 'drizzle-orm';

const ATPROTO_COMPONENTS = sql`(select id from components where type in ('tealfm', 'rocksky'))`;

/**
 * Slim historical plays of Teal and Rocksky clients, like slimHistoricalPlay does for new rows:
 * remove the embedded raw record (play.original), meta.user and meta.url.web, and delete their historical_play_inputs rows.
 * Batched and idempotent. The database file only gets smaller after a VACUUM.
 * */
export const up: Migration<MigrateBaseContext>['up'] = async (db: SqliteDatabase, ctx: MigrateBaseContext | undefined): Promise<void> => {
    if(ctx === undefined) {
        throw new Error('Context must be defined');
    }
    ctx.logger.info('Removing unneeded data from Teal and Rocksky historical plays');
    let slimmed = 0;
    while(true) {
        const ids = (await ctx.db.all<{id: number}>(sql`select id from plays_historical where componentId in ${ATPROTO_COMPONENTS}
            and (json_type(play, '$.original') is not null or json_type(play, '$.meta.user') is not null or json_type(play, '$.meta.url.web') is not null)
            limit 5000`)).map(x => x.id);
        if(ids.length === 0) {
            break;
        }
        const idList = sql.join(ids.map(x => sql`${x}`), sql`, `);
        await ctx.db.run(sql`update plays_historical set play = json_remove(play, '$.original', '$.meta.user', '$.meta.url.web') where id in (${idList})`);
        await ctx.db.run(sql`update plays_historical set play = json_remove(play, '$.meta.url') where id in (${idList}) and json_extract(play, '$.meta.url') = '{}'`);
        slimmed += ids.length;
        ctx.logger.verbose(`Slimmed ${slimmed} plays`);
    }
    await ctx.db.run(sql`delete from historical_play_inputs where playId in (select id from plays_historical where componentId in ${ATPROTO_COMPONENTS})`);
    ctx.logger.info(`Done. Slimmed ${slimmed} plays.`);
};

export const down: Migration<MigrateBaseContext>['down'] = async (db: SqliteDatabase, ctx: MigrateBaseContext | undefined): Promise<void> => {
    // removed data is still in the PDS, a full sync restores it
};
