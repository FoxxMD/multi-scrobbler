import chai, { assert, expect } from 'chai';
import asPromised from 'chai-as-promised';
import { after } from 'mocha';
import { UpstreamError } from '../../common/errors/UpstreamError.js';
import { serializeError, deserializeError } from 'serialize-error';
import { AbortedError } from '../../common/errors/MSErrors.js';


describe('#ErrorMarshalling', function() {

    it('serializes custom error with name',function() {

        const up = new UpstreamError('a test upstream');

        const s = serializeError(up);
        
        expect(s.name).eq('UpstreamError');
    });

    it('deserializes custom error',function() {

        const up = new UpstreamError('a test upstream', {showStopper: true});

        const s = serializeError(up);
        
        const e = deserializeError(s);

        expect(e).instanceOf(UpstreamError);
        expect((e as UpstreamError).showStopper).eq(true);

        const a = new AbortedError('aborted test');
        const aMarshalled = deserializeError(serializeError(a));
        expect(aMarshalled).instanceOf(AbortedError);
    });

    it('deserializes custom nested error',function() {

        const sourceError = new Error('a test', {cause: new UpstreamError('a test upstream', {showStopper: true})}); 

        const s = serializeError(sourceError);
        
        const e = deserializeError(s);

        expect(e.cause).instanceOf(UpstreamError);
        expect((e.cause as UpstreamError).showStopper).eq(true);
    });

});