import chai, { expect } from 'chai';
import asPromised from 'chai-as-promised';
import { after, before, describe, it } from 'mocha';
import { generatePlay } from "../utils/PlayTestUtils.js";

import { playToClientPayload } from '../../common/vendor/LastfmApiClient.js';

chai.use(asPromised);

describe('#LFM Scrobble Payload Behavior', function () {

        it('Should remove VA from album artist', function() {
            const play = generatePlay({albumArtists: ['VA']});
            expect(playToClientPayload(play).albumArtist).to.be.undefined;

            const okPlay = generatePlay({albumArtists: ['My Dude']});
            expect(playToClientPayload(okPlay).albumArtist).eq('My Dude');
        });
});