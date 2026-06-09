import type { SqliteDatabase, Migration } from 'sqlite-up';
import { MigrateBaseContext } from '../appMigrator.js';
import { plays as drizzlePlays } from '../drizzle/schema/schema.js';
import clone from 'clone';
import { eq } from 'drizzle-orm';


export const up: Migration<MigrateBaseContext>['up'] = async (db: SqliteDatabase, ctx: MigrateBaseContext): Promise<void> => {

    ctx.logger.info('Migrating Play lifecycle data to top-level location. This may take some time...');

    let more = true;
    let offset = 0,
        processed = 0,
        updated = 0;
    while (more) {
        const playRows = await ctx.db.select().from(drizzlePlays).limit(100).offset(offset);
        for (const row of playRows) {
            try {
                const {
                    meta: {
                        lifecycle,
                        lifecycle: {
                            steps = [],
                            scrobble
                        } = {}
                    } = {}
                } = row.play;
                if (lifecycle === undefined) {
                    // already migrated or unneeded
                    processed++;
                    continue;
                }
                if (steps.length > 0) {
                    row.play.lifecycle = clone(steps);
                }
                if (scrobble !== undefined) {
                    row.play.scrobble = clone(scrobble);
                }
                delete row.play.meta.lifecycle;
                await ctx.db.update(drizzlePlays).set({ play: row.play }).where(eq(drizzlePlays.id, row.id));
                updated++;
                processed++;
            } catch (e) {
                ctx.logger.warn(new Error(`Failed to migrate Play ${row.id} (${row.uid})`, { cause: e }));
            }
        }
        offset += 100;
        ctx.logger.verbose(`Migration Progress: Processed ${processed} | Updated ${updated}`);
        if(playRows.length < 100) {
            more = false;
        }
    }


    // Migration code here
    // context is passed as ctx
};

export const down: Migration<MigrateBaseContext>['down'] = async (db: SqliteDatabase, ctx: MigrateBaseContext): Promise<void> => {
    // Rollback code here
    // context is passed as ctx
};