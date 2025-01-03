import { after, before, describe, it } from 'mocha';
import { loggerTest, loggerDebug } from "@foxxmd/logging";
import chai, { assert, expect } from 'chai';
import asPromised from 'chai-as-promised';
import clone from "clone";
import YTMusicSource, { ytiHistoryResponseFromShelfToPlays, ytiHistoryResponseToListItems } from "../../sources/YTMusicSource.js";
import ytHistoryRes from './ytres.json' assert {type: 'json'};
import EventEmitter from "events";
import { generatePlay, generatePlays, normalizePlays } from '../utils/PlayTestUtils.js';
import { YTMusicSourceConfig } from '../../common/infrastructure/config/source/ytmusic.js';
import { sleep } from '../../utils.js';
import dayjs from 'dayjs';

chai.use(asPromised);

const createYtSource = (opts?: {
    config?: YTMusicSourceConfig
    emitter?: EventEmitter
}) => {
    const {
        config = {
            options: {
                logDiff: true
            }
        },
        emitter = new EventEmitter
    } = opts || {};
    const source = new YTMusicSource('test', config, { localUrl: new URL('https://example.com'), configDir: 'fake', logger: loggerTest, version: 'test' }, emitter);
    source.buildTransformRules();
    return source;
}

describe('Parses History', function () {

    it(`Parses a history response to tracks`, async function () {
        const items = ytiHistoryResponseToListItems(ytHistoryRes);
        expect(items).length(10);
    });

    it(`Parses a history response plays with shelf name`, async function () {
        const items = ytiHistoryResponseFromShelfToPlays(ytHistoryRes);
        expect(items[0]?.meta?.comment).to.eq('March 2023');
    });
});

describe('Handles temporal inconsistency in history', function () {

    it(`Adds new, prepended track`, async function () {

        const source = createYtSource();

        const plays = [...generatePlays(10, {playDate: dayjs().subtract(10, 'minutes')}, { comment: 'Today' }), ...generatePlays(10, {playDate: dayjs().subtract(10, 'minutes')}, { comment: 'Yesterday' })];

        // emulating init, get history to use as base truth without discovering tracks
        expect(source.parseRecentAgainstResponse(plays).plays).length(20);

        source.polling = true;

        // first true poll emulating no new tracks played (should not add new tracks from base truth)
        expect(source.parseRecentAgainstResponse(plays).plays).length(0);

        // add new track played
        const prependedPlays = [generatePlay({}, { comment: 'Today' }), ...plays];
        const prependResult = source.parseRecentAgainstResponse(prependedPlays);
        expect(prependResult.plays).length(1);
        expect(prependResult).to.deep.include({consistent: true, diffType: 'added'});
        expect(prependResult.diffResults[2]).eq('prepend');

        expect(source.parseRecentAgainstResponse(prependedPlays).plays).length(0);
    });

    it(`Adds bumped, prepended track`, async function () {

        const source = createYtSource();

        const plays = [...generatePlays(10, {playDate: dayjs().subtract(10, 'minutes')}, { comment: 'Today' }), ...generatePlays(10, {playDate: dayjs().subtract(10, 'minutes')}, { comment: 'Yesterday' })];

        // emulating init, get history to use as base truth without discovering tracks
        expect(source.parseRecentAgainstResponse(plays).plays).length(20);

        source.polling = true;

        // first true poll emulating no new tracks played (should not add new tracks from base truth)
        expect(source.parseRecentAgainstResponse(plays).plays).length(0);

        // add new track played that was seen in base truth (YT *bumps* track from earlier position to top of list)
        const bumpedList = [...plays.map(x => clone(x))];
        const bumped = bumpedList[6];
        bumpedList.splice(6, 1);
        bumpedList.unshift(bumped);

        const bumpedResults = source.parseRecentAgainstResponse(bumpedList);
        expect(bumpedResults.plays).length(1);
        expect(bumpedResults).to.deep.include({consistent: true, diffType: 'bump'});
        expect(bumpedResults.diffResults[2]).eq('prepend');
    });

    it(`Does not add appended track`, async function () {

        const source = createYtSource();

        const plays = [...generatePlays(10, {playDate: dayjs().subtract(10, 'minutes')}, { comment: 'Today' }), ...generatePlays(10, {playDate: dayjs().subtract(10, 'minutes')}, { comment: 'Yesterday' })];

        // emulating init, get history to use as base truth without discovering tracks
        expect(source.parseRecentAgainstResponse(plays).plays).length(20);

        source.polling = true;

        // first true poll emulating no new tracks played (should not add new tracks from base truth)
        expect(source.parseRecentAgainstResponse(plays).plays).length(0);

        // track is erroneously added to end of history ("new" track played in the past, not temporally consistent)
        const appendPlays = [...plays.slice(1), generatePlay({}, { comment: 'Yesterday' })];
        const appenedResult =source.parseRecentAgainstResponse(appendPlays);
        expect(appenedResult.plays).length(0);
        expect(appenedResult).to.deep.include({consistent: false, diffType: 'added'});
        expect(appenedResult.diffResults[2]).eq('append');
    });

    it(`Detects outdated recent history when order was previously seen`, async function () {

        this.timeout(3700);

        const source = createYtSource();

        const plays = [...generatePlays(10, {playDate: dayjs().subtract(10, 'minutes')}, { comment: 'Today' }), ...generatePlays(10, {playDate: dayjs().subtract(10, 'minutes')}, { comment: 'Yesterday' })];

        // emulating init, get history to use as base truth without discovering tracks
        expect(source.parseRecentAgainstResponse(plays).plays).length(20);

        source.polling = true;

        // first true poll emulating no new tracks played (should not add new tracks from base truth)
        expect(source.parseRecentAgainstResponse(plays).plays).length(0);

        // add new track played
        const newPlay = generatePlay({}, { comment: 'Today' });
        const prependedPlays = [newPlay, ...plays];
        expect(source.parseRecentAgainstResponse(prependedPlays).plays).length(1);

        await sleep(1000);

        // YT returns outdated history
        // should be detected as append since "removed" track in last position from previous history is seen again
        const badAppend = source.parseRecentAgainstResponse(plays);
        expect(badAppend).to.deep.include({consistent: false, diffType: 'added', plays: []});
        expect(badAppend.diffResults[2]).eq('append');

        await sleep(500);

        // contiuned outdated history
        expect(source.parseRecentAgainstResponse(plays)).to.deep.include({consistent: true, plays: []});

        await sleep(500);

        // correct, current history is finally returned correctly
        const recentHistoryResult = source.parseRecentAgainstResponse(prependedPlays);
        expect(recentHistoryResult).to.deep.include({consistent: false, plays: []});
        // should detect that we have seen this history before and not duplicate add already discovered tracks
        expect(recentHistoryResult.reason).includes('(Add Plays Detected) YTM History has exact order as another recent response *where history was changed*')
    });
});

describe('Handles skipped tracks', function () {

    it(`Does not add interim plays`, async function () {

        const source = createYtSource();

        const plays = [...generatePlays(10, {playDate: dayjs().subtract(20, 'seconds')}, { comment: 'Today' }), ...generatePlays(10, {playDate: dayjs().subtract(20, 'seconds')}, { comment: 'Yesterday' })];

        // emulating init from 20 seconds, get history to use as base truth without discovering tracks
        expect(source.parseRecentAgainstResponse(plays).plays).length(20);

        source.polling = true;
        source.discover(plays);

        // first true poll emulating no new tracks played (should not add new tracks from base truth)
        expect(source.parseRecentAgainstResponse(plays).plays).length(0);

        // add new track played
        const firstPlay = generatePlay({duration: 120}, { comment: 'Today' });
        // add skipped tracks
        // both should be ignored since last discovered track was 20 seconds and both of these tracks length is longer than 50% of discovered time
        // but it should not ignore most recent track as that is the one that is playing
        const interimPlays = [generatePlay({duration: 120}, { comment: 'Today' }), generatePlay({duration: 200}, { comment: 'Today' })]
        const prependedPlays = [firstPlay, ...interimPlays, ...plays];
        const prependResult = source.parseRecentAgainstResponse(prependedPlays);
        expect(prependResult.plays).length(1);
        expect(prependResult.plays[0].data.track).eq(firstPlay.data.track)
    });
});