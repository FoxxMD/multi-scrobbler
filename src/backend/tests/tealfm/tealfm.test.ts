import chai, { expect } from 'chai';
import asPromised from 'chai-as-promised';
import { after, before, describe, it } from 'mocha';
import { generateLastfmTrackObject, generateMbid, generatePlay, generateTealPlayRecord } from "../../../core/PlayTestUtils.js";
import { AbstractBlueSkyApiClient, listRecordToPlay } from '../../common/vendor/bluesky/AbstractBlueSkyApiClient.js';
import dayjs from 'dayjs';
import { artistCreditsToNames } from '../../../core/StringUtils.js';
import TealScrobbler from '../../scrobblers/TealfmScrobbler.js';
import { Notifiers } from '../../notifier/Notifiers.js';
import { EventEmitter } from "events";
import { loggerNoop } from '../../common/MaybeLogger.js';
import path from 'node:path';
import { configDir } from '../../common/index.js';
import { loggerDebug, loggerTrace } from '@foxxmd/logging';

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

describe('#tealfmCar', function() {

    before(function () {
        if (process.env.TEAL_CAR_TEST !== 'true') {
            this.skip();
        }
    });

    it('Parses car file', async function() {

        this.timeout(100000);

        const tfm = new TealScrobbler('test', 
            {name: 'test', data: {identifier: 'test', appPassword: 'test'}}, 
            {configDir: 'test', localUrl: new URL('https://example.com'), version: 'test'},
            new Notifiers(new EventEmitter(), new EventEmitter(), new EventEmitter(), loggerNoop),
            new EventEmitter(),
            loggerDebug
        );
        await tfm.buildDatabase();

        await tfm.parseScrobblesFromCar(path.resolve(configDir, 'tealfm-myteal-1778870858.car'), 100);
    });
});