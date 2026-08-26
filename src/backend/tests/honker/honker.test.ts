import chai, { expect } from 'chai';
import asPromised from 'chai-as-promised';
import { describe, it } from 'mocha';
import { transientDb } from '../utils/TransientTestUtils.ts';
import { Queue, type HonkerJob } from '../../common/database/honker/HonkerQueue.ts';
import type { JsonPlayObject, QueueContext } from '../../../core/Atomic.ts';
import { generateJsonPlay } from '../../../core/tests/utils/PlayTestUtils.ts';
import honker from '@russellthehippo/honker-node';

chai.use(asPromised);


describe('Expected behavior for queues', function () {

    it('enqueues and claims a job', async function () {
        const db = await transientDb();
        const a = db.$client.location()
        const hdb = honker.open(a);
        type PlayJob = { context: QueueContext, play: JsonPlayObject };
        const queue = new Queue<PlayJob>(db, 'source-discovery-1');
        const p = generateJsonPlay();
        queue.enqueue({ context: {}, play: p });

        const honkerQueue = hdb.queue('source-discovery-1');

        honkerQueue.sweepExpired

        const waker = honkerQueue.claimWaker();
        while (true) {
            const job = await waker.next('worker-1') as unknown as HonkerJob<PlayJob>;
            if (!job) break;
            try {
                expect(job.payload.play.data.track).eq(p.data.track);
                job.ack();
                break;
            } catch (err) {
                job.retry(60, String(err));
            }
        }
    });
});