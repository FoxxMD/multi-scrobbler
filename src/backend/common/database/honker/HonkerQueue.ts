import { sql } from 'drizzle-orm';
import type { DbConcrete } from '../drizzle/drizzleUtils.ts';
import type {Job} from '@russellthehippo/honker-node';

export interface HonkerJobData {
    id: number,
    queue: string
    payload: string
    worker_id: string
    attempts: number
    claim_expires_at: number
}

export class Queue<T> {
    private readonly name: string;
    private readonly maxAttempts: number;
    private readonly visibilityTimeout: number;
    private db: DbConcrete;
    constructor(
        db: DbConcrete,
        name: string,
        maxAttempts: number = 3
    ) {
        this.db = db;
        this.name = name;
        this.maxAttempts = maxAttempts;
    }

    enqueue(
        payload: T,
        opts: { delay?: number; priority?: number, tx?: DbConcrete } = {},
    ): number {
        const db = opts.tx ?? this.db;
        const row = db.get<{ id: number }>(sql`
      SELECT honker_enqueue(
        ${this.name},
        ${JSON.stringify(payload)},
        NULL,
        ${opts.delay ?? null},
        ${opts.priority ?? 0},
        ${this.maxAttempts},
        NULL
      ) AS id
    `);
        return row!.id;
    }
}

export type HonkerJob<T> = Omit<Job, 'payload'> & {payload: T};