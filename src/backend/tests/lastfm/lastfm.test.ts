import chai, { expect } from 'chai';
import asPromised from 'chai-as-promised';
import { after, before, describe, it } from 'mocha';
import { generateLastfmTrackObject, generateMbid, generatePlay } from "../utils/PlayTestUtils.js";

import LastfmApiClient, { playToClientPayload } from '../../common/vendor/LastfmApiClient.js';
import { TrackObject } from 'lastfm-node-client';

chai.use(asPromised);

describe('#LFM Scrobble Payload Behavior', function () {

        it('Should remove VA from album artist', function() {
            const play = generatePlay({albumArtists: ['VA']});
            expect(playToClientPayload(play).albumArtist).to.be.undefined;

            const okPlay = generatePlay({albumArtists: ['My Dude']});
            expect(playToClientPayload(okPlay).albumArtist).eq('My Dude');
        });
});

describe('#LFM Track to Play', function() {

    it('Sets mbids to undefined when values are empty strings', function() {

        const to = generateLastfmTrackObject();
        const play = LastfmApiClient.formatPlayObj(to);

        expect(play.data.meta?.brainz?.album).to.be.undefined;
        expect(play.data.meta?.brainz?.artist).to.be.undefined;
        expect(play.data.meta?.brainz?.track).to.be.undefined;
    });

    it('Sets brainz if any mbid is not undefined', function() {

        const toAlbum = generateLastfmTrackObject();
        toAlbum.album.mbid = generateMbid();
        expect(LastfmApiClient.formatPlayObj(toAlbum).data.meta?.brainz?.album).to.not.be.undefined;

        const toArtist = generateLastfmTrackObject();
        toArtist.artist.mbid = generateMbid();
        expect(LastfmApiClient.formatPlayObj(toArtist).data.meta?.brainz?.artist).to.not.be.undefined;

        const toTrack = generateLastfmTrackObject();
        toTrack.mbid = generateMbid();
        expect(LastfmApiClient.formatPlayObj(toTrack).data.meta?.brainz?.track).to.not.be.undefined;
    });

        it('Sets artist correctly from #text or name', function() {

        const toArtText = generateLastfmTrackObject();
        delete toArtText.artist.name;
        expect(toArtText.artist['#text']).to.not.be.undefined;
        expect(LastfmApiClient.formatPlayObj(toArtText).data.artists[0]).to.eq(toArtText.artist['#text']);

        const toArtTextEmptyNAme = generateLastfmTrackObject();
        toArtTextEmptyNAme.artist.name = '';
        expect(toArtTextEmptyNAme.artist['#text']).to.not.be.undefined;
        expect(LastfmApiClient.formatPlayObj(toArtTextEmptyNAme).data.artists[0]).to.eq(toArtTextEmptyNAme.artist['#text']);

        const toArtName = generateLastfmTrackObject();
        delete toArtName.artist['#text'];
        expect(toArtName.artist.name).to.not.be.undefined;
        expect(LastfmApiClient.formatPlayObj(toArtName).data.artists[0]).to.eq(toArtName.artist.name);
    });

});