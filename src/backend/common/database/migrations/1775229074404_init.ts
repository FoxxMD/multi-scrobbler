import type { Kysely } from 'kysely'

// `any` is required here since migrations should be frozen in time. alternatively, keep a "snapshot" db interface.
export async function up(db: Kysely<any>): Promise<void> {
	await db.schema
	.createTable('play')
	.addColumn('id', 'text', (col) => col.primaryKey())
	.addColumn('parent_id', 'text')
	.addColumn('component_type', 'text', (col) => col.notNull())
	.addColumn('component_name', 'text', (col) => col.notNull())
	.addColumn('lifecycle_stage', 'text', (col) => col.notNull())
	.addColumn('has_error', 'integer', (col) => col.notNull())
	.addColumn('error', 'text')
	.addColumn('played_at', 'text', (col) => col.notNull())
	.addColumn('seen_at', 'text', (col) => col.notNull())
	.addColumn('play', 'text', (col) => col.notNull())
	.execute();

	await db.schema
    .createIndex('play_parentId_index')
    .on('play')
    .column('parent_id')
    .execute();

	await db.schema
    .createIndex('play_playedAt_index')
    .on('play')
    .column('played_at')
    .execute();

	await db.schema
    .createIndex('play_seenAt_index')
    .on('play')
    .column('seen_at')
    .execute();
	// up migration code goes here...
	// note: up migrations are mandatory. you must implement this function.
	// For more info, see: https://kysely.dev/docs/migrations
}

// `any` is required here since migrations should be frozen in time. alternatively, keep a "snapshot" db interface.
export async function down(db: Kysely<any>): Promise<void> {
	// down migration code goes here...
	// note: down migrations are optional. you can safely delete this function.
	// For more info, see: https://kysely.dev/docs/migrations
}
