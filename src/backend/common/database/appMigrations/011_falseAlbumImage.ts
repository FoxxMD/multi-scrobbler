import type { SqliteDatabase, Migration } from 'sqlite-up';
import type { MigrateBaseContext } from '../appMigrator.ts';
import { sql } from 'drizzle-orm';

const PLAY_TABLES = ['plays', 'play_inputs', 'plays_historical', 'historical_play_inputs'];

/** Every place a validated play (and so data.album.image) is nested in a stored play */
export const ALBUM_IMAGE_PATHS = [
    '$.data.album.image',
    '$.original.play.data.album.image',
    '$.scrobble.match.closestMatchedPlay.data.album.image',
    '$.scrobble.match.transformedPlay.data.album.image',
    '$.scrobble.mergedScrobble.data.album.image',
];

/**
 * Remove boolean album image from stored plays.
 *
 * CoverArtArchive client cached `false` for found thumbnails so CoverArtArchive Transformer set album image to `false` on cache hits.
 * The play schema requires a string so these rows fail to load.
 * Idempotent.
 * */
export const up: Migration<MigrateBaseContext>['up'] = async (db: SqliteDatabase, ctx: MigrateBaseContext | undefined): Promise<void> => {
    if(ctx === undefined) {
        throw new Error('Context must be defined');
    }
    ctx.logger.info('Removing boolean album image from stored plays');
    for(const table of PLAY_TABLES) {
        for(const path of ALBUM_IMAGE_PATHS) {
            await ctx.db.run(sql`update ${sql.identifier(table)} set play = json_remove(play, ${path})
                where json_type(play, ${path}) in ('true', 'false')`);
        }
    }
    ctx.logger.info('Done.');
};

export const down: Migration<MigrateBaseContext>['down'] = async (db: SqliteDatabase, ctx: MigrateBaseContext | undefined): Promise<void> => {
    // removed image was never valid, nothing to undo
};
