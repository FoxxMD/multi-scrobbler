import type { SqliteDatabase } from 'sqlite-up';
import { getRoot } from '../../../ioc.js';
import { DrizzlePlayRepository } from '../../../common/database/drizzle/repositories/PlayRepository.js';

export const up = async (db: SqliteDatabase): Promise<void> => {
  const logger = getRoot().items.logger;
  const ddb = await getRoot().items.db();

  const countRes = await db.prepare(`
    select COUNT(*) from plays;
  `).get();
  const count = countRes['COUNT(*)'];
  if(count > 0) {
    logger.info(`Updating ${count} play rows`);

    const repo = new DrizzlePlayRepository(ddb);
    let more = true;
    let offset = 0;
    let updated = 0;
    while(more) {
      const batch = await repo.findPlays({with: ['input'], limit: 100, offset});
      for(const row of batch) {
        repo.updateById(row.id, {play: {...row.play, data: {...row.play.data, track: 'foo'}}});
      }
      updated += batch.length;
      logger.verbose(`Updated ${updated} total`);
      more = batch.length === 100;
      offset += 100;
    }
  }
};

export const down = async (db: SqliteDatabase): Promise<void> => {
  const logger = getRoot().items.logger;
  logger.info('No DOWN action');
};