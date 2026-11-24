import { expect } from 'chai';
import { afterEach, describe, it } from 'mocha';
import sinon from 'sinon';
import { RockskyClient, RockskyError } from '@rocksky/sdk';
import { RockskyClientWrapped } from '../../common/vendor/rocksky/RockskyClientWrapped.ts';

const client = () => new RockskyClientWrapped('https://api.rocksky.app', undefined, {rate: {points: 100}});

describe('Rocksky matchSong', function () {

    afterEach(function () {
        sinon.restore();
    });

    it('retries without album when album filters out all matches', async function () {
        const stub = sinon.stub(RockskyClient.prototype, 'matchSong');
        stub.onFirstCall().resolves({matches: []});
        stub.onSecondCall().resolves({title: 'Song', matches: [{title: 'Song', score: 100}]});
        const res = await client().matchSong('Song', 'Artist', undefined, undefined, 'Album (Deluxe)');
        expect(res.title).eq('Song');
        expect(stub.secondCall.args).eql(['Song', 'Artist', undefined, undefined]);
    });

    it('retries without album on NotFound', async function () {
        const stub = sinon.stub(RockskyClient.prototype, 'matchSong');
        stub.onFirstCall().rejects(new RockskyError({error: 'NotFound', message: 'no match'}, 400));
        stub.onSecondCall().resolves({title: 'Song', matches: [{title: 'Song'}]});
        expect((await client().matchSong('Song', 'Artist', undefined, undefined, 'Album')).title).eq('Song');
    });

    it('does not retry when album matched or was not given', async function () {
        const stub = sinon.stub(RockskyClient.prototype, 'matchSong').resolves({matches: []});
        await client().matchSong('Song', 'Artist');
        stub.resolves({matches: [{title: 'Song'}]});
        await client().matchSong('Song', 'Artist', undefined, undefined, 'Album');
        expect(stub.callCount).eq(2);
    });
});
