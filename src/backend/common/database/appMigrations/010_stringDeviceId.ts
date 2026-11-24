import type { SqliteDatabase, Migration } from 'sqlite-up';
import type { MigrateBaseContext } from '../appMigrator.ts';
import { sql } from 'drizzle-orm';

const PLAY_TABLES = ['plays', 'play_inputs', 'plays_historical', 'historical_play_inputs'];

/** Every place a validated play (and so meta.deviceId) is nested in a stored play */
export const DEVICE_ID_PATHS = [
    '$.meta.deviceId',
    '$.original.play.meta.deviceId',
    '$.scrobble.match.closestMatchedPlay.meta.deviceId',
    '$.scrobble.match.transformedPlay.meta.deviceId',
    '$.scrobble.mergedScrobble.meta.deviceId',
];

/**
 * Convert numeric meta.deviceId in stored plays to a string.
 *
 * Subsonic servers (Navidrome) return playerId as an integer, which Subsonic Source stored as-is as deviceId.
 * The play schema requires a string so these rows fail to load.
 * Idempotent.
 * */
export const up: Migration<MigrateBaseContext>['up'] = async (db: SqliteDatabase, ctx: MigrateBaseContext | undefined): Promise<void> => {
    if(ctx === undefined) {
        throw new Error('Context must be defined');
    }
    ctx.logger.info('Converting numeric deviceId of stored plays to string');
    for(const table of PLAY_TABLES) {
        for(const path of DEVICE_ID_PATHS) {
            const p = sql.raw(`'${path}'`);
            await ctx.db.run(sql`update ${sql.identifier(table)} set play = json_set(play, ${p}, cast(json_extract(play, ${p}) as text))
                where json_type(play, ${p}) in ('integer', 'real')`);
        }
    }
    ctx.logger.info('Done.');
};

export const down: Migration<MigrateBaseContext>['down'] = async (db: SqliteDatabase, ctx: MigrateBaseContext | undefined): Promise<void> => {
    // string deviceId is valid for all versions, nothing to undo
};
