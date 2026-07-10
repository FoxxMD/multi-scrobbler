import chai from 'chai';
import asPromised from 'chai-as-promised';
import { describe, it } from 'mocha';
import { getATProtoIdentifier } from '../../common/vendor/atproto/atUtils.ts';


chai.use(asPromised);

describe('Identifier Resolving', function () {
   
    // before(function () {
    //     if (process.env.ATPROTO_TEST !== 'true') {
    //         this.skip();
    //     }
    // });

    it('should resolve known identifier', async function () {
        await getATProtoIdentifier({identifier: 'foxxmd.dev'}).should.be.fulfilled
    });

    it('should not resolve bad identifier', async function () {
        await getATProtoIdentifier({identifier: 'foxxmd.devnotreal'}).should.be.rejected
    });

    it('should resolve this identifier', async function () {
        await getATProtoIdentifier({identifier: 'eroc1990.bsky.parastor.net'}).should.be.fulfilled
    });

});