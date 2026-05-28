import chai, { expect } from 'chai';
import asPromised from 'chai-as-promised';
import { after, before, describe, it } from 'mocha';
import { generateArtistCredits, generatePlay, generateTealPlayRecord, withBrainz } from "../../../core/PlayTestUtils.js";
import { listRecordToPlay, playToRecord } from '../../common/vendor/bluesky/AbstractBlueSkyApiClient.js';
import dayjs from 'dayjs';
import { artistCreditsToNames } from '../../../core/StringUtils.js';

chai.use(asPromised);


describe('#tealfm Record to Play', function() {

    it('Parses basic record data', function() {

        const [rec, {tid, did}] = generateTealPlayRecord();
        const play = listRecordToPlay(rec);

        expect(play.data.track).eq(rec.value.trackName);
        expect(play.data.album).eq(rec.value.releaseName);
        expect(play.data.playDate.unix()).eq(dayjs(rec.value.playedTime).unix());
        expect(play.data.duration).eq(rec.value.duration);
        expect(artistCreditsToNames(play.data.artists)).eql(rec.value.artists.map(x => x.artistName));
        expect(play.meta.user).eq(`did:plc:${did}`);
        expect(play.meta.playId).eq(tid);
    });

    it('Parses mbids and isrc', function() {

        const [rec, {tid, did}] = generateTealPlayRecord();
        const play = listRecordToPlay(rec);

        expect(play.data.meta.brainz).to.not.be.undefined;
        expect(play.data.meta.brainz.album).eq(rec.value.releaseMbId);
        expect(play.data.meta.brainz.recording).eq(rec.value.recordingMbId);
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

describe('#tealfm Play To Record', function () {

    it('Adds mbids with uri format', function () {

        const play = withBrainz(generatePlay({artists: generateArtistCredits(2)}), {include: ['recording']});
        const record = playToRecord(play);

        expect(record.recordingMbId).to.eq(`mbid:${play.data.meta.brainz.recording}`);
        expect(record.releaseMbId).is.undefined;
        expect(record.artists).length(2);
        expect(record.artists[0].artistName).eq(play.data.artists[0].name);
        expect(record.artists[0].artistMbId).eq(`mbid:${play.data.artists[0].mbid}`);
    });

});