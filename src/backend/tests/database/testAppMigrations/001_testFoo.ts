import type { SqliteDatabase, Migration } from 'sqlite-up';
import { DrizzlePlayRepository } from '../../../common/database/drizzle/repositories/PlayRepository.js';
import { MigrateBaseContext } from '../../../common/database/appMigrator.js';

export const up: Migration<MigrateBaseContext>['up'] = async (db: SqliteDatabase, ctx): Promise<void> => {

  const countRes = await db.prepare(`
    select COUNT(*) from plays;
  `).get();
  const count = countRes['COUNT(*)'];
  if(count > 0) {
   ctx. logger.info(`Updating ${count} play rows`);

    const repo = new DrizzlePlayRepository(ctx.db);
    let more = true;
    let offset = 0;
    let updated = 0;
    while(more) {
      const batch = await repo.findPlays({with: ['input'], limit: 100, offset});
      for(const row of batch) {
        repo.updateById(row.id, {play: {...row.play, data: {...row.play.data, track: 'foo'}}});
      }
      updated += batch.length;
      ctx.logger.verbose(`Updated ${updated} total`);
      more = batch.length === 100;
      offset += 100;
    }
  }
};

export const down: Migration<MigrateBaseContext>['down'] = async (db: SqliteDatabase, ctx: MigrateBaseContext): Promise<void> => {
  ctx.logger.info('No DOWN action');
};