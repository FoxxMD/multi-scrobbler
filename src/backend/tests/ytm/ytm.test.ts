import { after, before, describe, it } from 'mocha';
import { loggerTest, loggerDebug } from "@foxxmd/logging";
import chai, { assert, expect } from 'chai';
import asPromised from 'chai-as-promised';
import clone from "clone";
import YTMusicSource, { ytiHistoryResponseFromShelfToPlays, ytiHistoryResponseToListItems } from "../../sources/YTMusicSource.js";
import ytHistoryRes from './ytres.json' assert {type: 'json'};
import EventEmitter from "events";
import { generatePlay, generatePlays } from '../utils/PlayTestUtils.js';
import { YTMusicSourceConfig } from '../../common/infrastructure/config/source/ytmusic.js';
import { sleep } from '../../utils.js';

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
    return new YTMusicSource('test', config, { localUrl: new URL('https://example.com'), configDir: 'fake', logger: loggerTest, version: 'test' }, emitter);
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

        const plays = [...generatePlays(10, {}, { comment: 'Today' }), ...generatePlays(10, {}, { comment: 'Yesterday' })];

        expect(source.parseRecentAgainstResponse(plays)).length(20);

        source.polling = true;

        expect(source.parseRecentAgainstResponse(plays)).length(0);

        const prependedPlays = [generatePlay({}, { comment: 'Today' }), ...plays];

        expect(source.parseRecentAgainstResponse(prependedPlays)).length(1);

        expect(source.parseRecentAgainstResponse(prependedPlays)).length(0);
    });

    it(`Adds bumped, prepended track`, async function () {

        const source = createYtSource();

        const plays = [...generatePlays(10, {}, { comment: 'Today' }), ...generatePlays(10, {}, { comment: 'Yesterday' })];

        expect(source.parseRecentAgainstResponse(plays)).length(20);

        source.polling = true;

        expect(source.parseRecentAgainstResponse(plays)).length(0);

        const bumpedList = [...plays.map(x => clone(x))];
        const bumped = bumpedList[6];
        bumpedList.splice(6, 1);
        bumpedList.unshift(bumped);

        expect(source.parseRecentAgainstResponse(bumpedList)).length(1);
    });

    it(`Does not add appended track`, async function () {

        const source = createYtSource();

        const plays = [...generatePlays(10, {}, { comment: 'Today' }), ...generatePlays(10, {}, { comment: 'Yesterday' })];

        expect(source.parseRecentAgainstResponse(plays)).length(20);

        source.polling = true;

        expect(source.parseRecentAgainstResponse(plays)).length(0);

        const appendPlays = [...plays.slice(1), generatePlay({}, { comment: 'Yesterday' })];

        expect(source.parseRecentAgainstResponse(appendPlays)).length(0);
    });

    it(`Detects outdated recent history when order was previously seen`, async function () {

        this.timeout(3700);

        const source = createYtSource();

        const plays = [...generatePlays(10, {}, { comment: 'Today' }), ...generatePlays(10, {}, { comment: 'Yesterday' })];

        expect(source.parseRecentAgainstResponse(plays)).length(20);

        source.polling = true;

        expect(source.parseRecentAgainstResponse(plays)).length(0);

        const newPlay = generatePlay({}, { comment: 'Today' });

        const prependedPlays = [newPlay, ...plays];

        expect(source.parseRecentAgainstResponse(prependedPlays)).length(1);

        await sleep(1000);

        expect(source.parseRecentAgainstResponse(plays)).length(0);

        await sleep(500);

        expect(source.parseRecentAgainstResponse(plays)).length(0);

        await sleep(500);

        expect(source.parseRecentAgainstResponse(prependedPlays)).length(0);
    });
});