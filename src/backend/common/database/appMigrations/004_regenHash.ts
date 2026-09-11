import type { SqliteDatabase, Migration } from 'sqlite-up';
import type { MigrateBaseContext } from '../appMigrator.ts';
import { plays as drizzlePlays } from '../drizzle/schema/schema.ts';
import { eq } from 'drizzle-orm';
import { playContentBasicInvariantTransform, playMbidIdentifier } from '../../../utils/PlayComparisonUtils.ts';
import { hashObject } from '../../../utils/StringUtils.ts';


export const up: Migration<MigrateBaseContext>['up'] = async (db: SqliteDatabase, ctx: MigrateBaseContext): Promise<void> => {

    ctx.logger.info('Beginning hash and mbid regeneration');

    let more = true;
    let offset = 0,
        processed = 0,
        updated = 0;

    while (more) {
        const playsRows = await ctx.db.select().from(drizzlePlays).limit(100).offset(offset);
        for (const row of playsRows) {
            try {
                await ctx.db.update(drizzlePlays).set({
                    playHash: hashObject(playContentBasicInvariantTransform(row.play).data),
                    mbidIdentifier: playMbidIdentifier(row.play)
                }).where(eq(drizzlePlays.id, row.id));
                updated++;
                processed++;
            } catch (e) {
                ctx.logger.warn(new Error(`Failed to regenerate hash for Play ${row.id} (${row.uid})`, { cause: e }));
            }
        }
        offset += 100;
        ctx.logger.verbose(`Play Hash Regeneration Progress: Processed ${processed} | Updated ${updated}`);
        if (playsRows.length < 100) {
            more = false;
        }
    }

    ctx.logger.info('Done.');
};

export const down: Migration<MigrateBaseContext>['down'] = async (db: SqliteDatabase, ctx: MigrateBaseContext): Promise<void> => {
    // Rollback code here
    // context is passed as ctx
};