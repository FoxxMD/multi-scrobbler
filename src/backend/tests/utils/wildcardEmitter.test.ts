import { expect } from 'chai';
import { describe, it } from 'mocha';
import { WildcardEmitter } from '../../common/WildcardEmitter.ts';

describe('WildcardEmitter', function () {

    it('invokes onAny listeners for any emitted event', function () {
        const emitter = new WildcardEmitter();
        const seen: [string | symbol, unknown[]][] = [];
        emitter.onAny((event, ...args) => seen.push([event, args]));

        emitter.emit('foo', 1, 2);
        emitter.emit('bar', 'baz');

        expect(seen).to.deep.equal([
            ['foo', [1, 2]],
            ['bar', ['baz']],
        ]);
    });

    it('still invokes normal listeners registered with on', function () {
        const emitter = new WildcardEmitter();
        let received: unknown;
        emitter.on('foo', (val) => { received = val; });

        emitter.emit('foo', 'hello');

        expect(received).to.eq('hello');
    });

    it('stops invoking a handler after its unsubscribe function is called', function () {
        const emitter = new WildcardEmitter();
        let calls = 0;
        const unsubscribe = emitter.onAny(() => { calls++; });

        emitter.emit('foo');
        unsubscribe();
        emitter.emit('foo');

        expect(calls).to.eq(1);
    });

    it('removeAllListeners with no args clears wildcard handlers', function () {
        const emitter = new WildcardEmitter();
        let calls = 0;
        emitter.onAny(() => { calls++; });

        emitter.removeAllListeners();
        emitter.emit('foo');

        expect(calls).to.eq(0);
    });
});
