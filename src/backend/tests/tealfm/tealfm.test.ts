import chai, { expect } from 'chai';
import asPromised from 'chai-as-promised';
import { after, before, describe, it } from 'mocha';
import { generateLastfmTrackObject, generateMbid, generatePlay, generateTealPlayRecord } from "../utils/PlayTestUtils.js";
import { AbstractBlueSkyApiClient, listRecordToPlay } from '../../common/vendor/bluesky/AbstractBlueSkyApiClient.js';
import dayjs from 'dayjs';

chai.use(asPromised);


describe('#tealfm Record to Play', function() {

    it('Parses basic record data', function() {

        const [rec, {tid, did}] = generateTealPlayRecord();
        const play = listRecordToPlay(rec);

        expect(play.data.track).eq(rec.value.trackName);
        expect(play.data.album).eq(rec.value.releaseName);
        expect(play.data.playDate.unix()).eq(dayjs(rec.value.playedTime).unix());
        expect(play.data.duration).eq(rec.value.duration);
        expect(play.data.artists).eql(rec.value.artists.map(x => x.artistName));
        expect(play.meta.user).eq(`did:plc:${did}`);
        expect(play.meta.playId).eq(tid);
    });

    it('Parses mbids and isrc', function() {

        const [rec, {tid, did}] = generateTealPlayRecord();
        const play = listRecordToPlay(rec);

        expect(play.data.meta.brainz).to.not.be.undefined;
        expect(play.data.meta.brainz.album).eq(rec.value.releaseMbId);
        expect(play.data.meta.brainz.track).eq(rec.value.recordingMbId);
        expect(play.data.meta.brainz.artist).eql(rec.value.artists.map(x => x.artistMbId));
        expect(play.data.isrc).eq(rec.value.isrc);
    });

    it('Removes brainz if no mbids', function() {

        const [rec, {tid, did}] = generateTealPlayRecord({ withMbids : false});
        const play = listRecordToPlay(rec);

        expect(play.data.meta?.brainz).to.be.undefined;
    });

    it('Leaves brainz artists undefined if no artist mbids', function() {

        const [rec, {tid, did}] = generateTealPlayRecord();
        rec.value.artists = rec.value.artists.map(x => ({artistName: x.artistName}));
        const play = listRecordToPlay(rec);

        expect(play.data.meta?.brainz).to.not.be.undefined;
        expect(play.data.meta?.brainz.artist).to.be.undefined;
    });

});