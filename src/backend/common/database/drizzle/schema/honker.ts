import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import dayjs from "dayjs";
import { DayjsTimestamp } from "../customTypes.ts";

export const honkerLiveQueue = sqliteTable("_honker_live", {
  id: integer({ mode: 'number' }).primaryKey(),
  queue: text().notNull(),
  payload: text().notNull(),
  state: text().notNull().default('pending'),
  priority: integer().notNull().default(0),
  run_at: DayjsTimestamp('run_at').notNull(),
  worker_id: text(),
  claim_expires: integer(),
  attempts: integer().notNull().default(0),
  max_attempts: integer().notNull().default(0),
  created_at: DayjsTimestamp('create_at').notNull().$defaultFn(() => dayjs()),
  expires_at: DayjsTimestamp('expires_at')
});