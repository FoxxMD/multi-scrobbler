import chai from 'chai';
import asPromised from 'chai-as-promised';
import { describe, it } from 'mocha';
import { consumeQueue } from '../../utils/AsyncUtils.ts';

chai.use(asPromised);

const expect = chai.expect;

const oneItem = () => {
    let served = false;
    return async () => {
        if (served) {
            return undefined;
        }
        served = true;
        return 'item';
    };
};

/** Fails the test if an unhandled rejection occurs while fn runs (and shortly after) */
const withoutUnhandledRejection = async (fn: () => Promise<unknown>) => {
    const unhandled: unknown[] = [];
    const listener = (e: unknown) => unhandled.push(e);
    process.on('unhandledRejection', listener);
    try {
        await fn();
        // let any derived promise rejections surface
        await new Promise((resolve) => setTimeout(resolve, 20));
    } finally {
        process.off('unhandledRejection', listener);
    }
    expect(unhandled, 'unhandled rejections').to.be.empty;
};

describe('#ConsumeQueue', function () {

    it('rejects with the error rethrown by onError without an unhandled rejection', async function () {
        await withoutUnhandledRejection(async () => {
            await expect(consumeQueue(
                oneItem(),
                async () => {
                    throw new Error('processing failed');
                },
                {
                    concurrency: 2,
                    idleMs: 10000,
                    signal: new AbortController().signal,
                    onError: async (e) => {
                        throw e;
                    }
                }
            )).to.be.rejectedWith('processing failed');
        });
    });

    it('rejects when aborted while a task is in flight and onError rethrows, without an unhandled rejection', async function () {
        const ac = new AbortController();
        await withoutUnhandledRejection(async () => {
            const consuming = consumeQueue(
                oneItem(),
                () => new Promise((_, reject) => ac.signal.addEventListener('abort', () => reject(ac.signal.reason))),
                {
                    concurrency: 2,
                    idleMs: 10000,
                    signal: ac.signal,
                    onError: async (e) => {
                        throw e;
                    }
                }
            );
            setTimeout(() => ac.abort(), 10);
            await expect(consuming).to.be.rejected;
        });
    });

    it('keeps consuming when onError swallows the error', async function () {
        const ac = new AbortController();
        let errors = 0;
        let emptied = 0;
        const consuming = consumeQueue(
            oneItem(),
            async () => {
                throw new Error('processing failed');
            },
            {
                concurrency: 2,
                idleMs: 10,
                signal: ac.signal,
                onError: async () => {
                    errors++;
                },
                onEmpty: () => {
                    emptied++;
                    if (emptied === 2) {
                        ac.abort();
                    }
                }
            }
        );
        await expect(consuming).to.be.rejected;
        expect(errors).to.eq(1);
        expect(emptied).to.eq(2);
    });
});
