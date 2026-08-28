import type { SqliteDatabase, Migration } from 'sqlite-up';
import type { MigrateBaseContext } from '../appMigrator.ts';
import { queueStates } from '../drizzle/schema/schema.ts';
import { eq } from 'drizzle-orm';


export const up: Migration<MigrateBaseContext>['up'] = async (db: SqliteDatabase, ctx: MigrateBaseContext): Promise<void> => {

    ctx.logger.info('Beginning queue entities consolidation.');

    ctx.logger.verbose('Deleting (now) unused completed queue states...');

    ctx.db.delete(queueStates).where(eq(queueStates.queueStatus,'completed'));

    ctx.logger.verbose('Done with completed queue state deletions');

    ctx.logger.info('Converting dead queue states to ingress states with failure + retries...');

    let more = true;
    let offset = 0,
        updated = 0;
    
    while (more) {
        const plays = await ctx.db.query.plays.findMany({
            where: {
                queueStates: {
                    queueName: 'dead'
                }
            },
            with: {
                queueStates: true
            },
            limit: 100,
            offset
        });

        for(const p of plays) {
            const ingress = p.queueStates.find(x => x.queueName === 'ingress');
            const dead = p.queueStates.find(x => x.queueName === 'dead');

            if(ingress === undefined) {
                await ctx.db.insert(queueStates).values([{
                    componentId: p.componentId,
                    playId: p.id,
                    queueName: 'ingress',
                    queueStatus: 'failed',
                    retries: dead.retries,
                    error: dead.error,
                    createdAt: dead.updatedAt,
                    updatedAt: dead.updatedAt
                }]);
            } else {
                await ctx.db.update(queueStates).set({
                    queueStatus: 'failed',
                    retries: dead.retries,
                    error: dead.error,
                    updatedAt: dead.updatedAt}).where(eq(queueStates.id, ingress.id));
            }
            updated++;
            await ctx.db.delete(queueStates).where(eq(queueStates.id, dead.id));
        }

        offset += 100;
        ctx.logger.verbose(`Conversion Progress: Updated ${updated}`);
        if (plays.length < 100) {
            more = false;
        }
    }

    ctx.logger.info('Done.');
};

export const down: Migration<MigrateBaseContext>['down'] = async (db: SqliteDatabase, ctx: MigrateBaseContext): Promise<void> => {
    // Rollback code here
    // context is passed as ctx
};