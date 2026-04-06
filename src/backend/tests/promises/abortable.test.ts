import chai from 'chai';
import asPromised from 'chai-as-promised';
import { describe, it } from 'mocha';
import { sleep } from "../../utils.js";
import { spawn, catchAbortError, isAbortError, rethrowAbortError, delay, forever } from 'abort-controller-x';

chai.should();
chai.use(asPromised);

const expect = chai.expect;

describe('#Abortable', function () {

    it('Executes defer on non-abort error', async function () {

        const controller = new AbortController();
        let didUseDefer = false;

        try {
            await spawn(controller.signal, async (signal, { defer }) => {
                defer(async () => {
                    didUseDefer = true;
                });

                await delay(signal, 100);
                throw new Error('Not an abort signal');
            })
        } catch (e) {
            rethrowAbortError(e);
        }
        expect(didUseDefer).is.true;
    });

    it('Executes defer on abort error', async function () {

        const controller = new AbortController();
        let didUseDefer = false;

        const spawnPromise = spawn(controller.signal, async (signal, { defer }) => {
            defer(async () => {
                didUseDefer = true;
            });

            await forever(signal);
        }).catch(catchAbortError);

        await sleep(50);
        controller.abort();

        await spawnPromise.should.be.fulfilled;
        expect(didUseDefer).is.true;
    });

});