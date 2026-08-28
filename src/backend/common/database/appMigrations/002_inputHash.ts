import type { SqliteDatabase, Migration } from 'sqlite-up';
import type { MigrateBaseContext } from '../appMigrator.ts';
import { playInputs, plays as drizzlePlays } from '../drizzle/schema/schema.ts';
import { eq } from 'drizzle-orm';
import { playContentBasicInvariantTransform } from '../../../utils/PlayComparisonUtils.ts';
import { hashObject } from '../../../utils/StringUtils.ts';


export const up: Migration<MigrateBaseContext>['up'] = async (db: SqliteDatabase, ctx: MigrateBaseContext): Promise<void> => {

    ctx.logger.info('Generating hashes for Play input data...');

    let more = true;
    let offset = 0,
        processed = 0,
        updated = 0;
    
    // first update input hashes
    while (more) {
        const inputRows = await ctx.db.select().from(playInputs).limit(100).offset(offset);
        for (const row of inputRows) {
            if (row.playHash !== null) {
                processed++;
            }
            try {
                await ctx.db.update(playInputs).set({
                    playHash: hashObject(playContentBasicInvariantTransform(row.play).data)
                }).where(eq(playInputs.id, row.id));
                updated++;
                processed++;
            } catch (e) {
                ctx.logger.warn(new Error(`Failed to generate hash for Play Input ${row.id}`, { cause: e }));
            }
        }
        offset += 100;
        ctx.logger.verbose(`Play Input Hash Generation Progress: Processed ${processed} | Updated ${updated}`);
        if (inputRows.length < 100) {
            more = false;
        }
    }

    ctx.logger.info('Regenerating hashes for Play data...');

    offset = 0;
    processed = 0;
    updated = 0;
    more = true;
    // then update Plays so hashes reflect Plays after transforms are done 
    while (more) {
        const playsRows = await ctx.db.select().from(drizzlePlays).limit(100).offset(offset);
        for (const row of playsRows) {
            try {
                await ctx.db.update(drizzlePlays).set({
                    playHash: hashObject(playContentBasicInvariantTransform(row.play).data)
                }).where(eq(drizzlePlays.id, row.id));
                updated++;
                processed++;
            } catch (e) {
                ctx.logger.warn(new Error(`Failed to generate hash for Play ${row.id} (${row.uid})`, { cause: e }));
            }
        }
        offset += 100;
        ctx.logger.verbose(`Play Hash Regeneration Progress: Processed ${processed} | Updated ${updated}`);
        if (playsRows.length < 100) {
            more = false;
        }
    }
};

export const down: Migration<MigrateBaseContext>['down'] = async (db: SqliteDatabase, ctx: MigrateBaseContext): Promise<void> => {
    // Rollback code here
    // context is passed as ctx
};