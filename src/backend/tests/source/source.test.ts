import { loggerTest, loggerDebug } from "@foxxmd/logging";
import chai, { assert, expect } from 'chai';
import asPromised from 'chai-as-promised';
import EventEmitter from "events";
import { after, before, describe, it } from 'mocha';
import pEvent from "p-event";
import clone from 'clone';
import { PlayObject } from "../../../core/Atomic.js";
import { generatePlay, generatePlayerStateData, generatePlays, normalizePlays } from "../utils/PlayTestUtils.js";
import { TestMemoryPositionalSource, TestMemorySource, TestSource } from "./TestSource.js";
import spotifyPayload from '../plays/spotifyCurrentPlaybackState.json';
import SpotifySource from "../../sources/SpotifySource.js";
import MockDate from 'mockdate';
import dayjs, { Dayjs } from "dayjs";
import { REPORTED_PLAYER_STATUSES } from "../../common/infrastructure/Atomic.js";
import { SourceConfig } from "../../common/infrastructure/config/source/sources.js";
import MemorySource from "../../sources/MemorySource.js";
import { timePassesScrobbleThreshold } from "../../utils/TimeUtils.js";
import { DEFAULT_SCROBBLE_DURATION_THRESHOLD, DEFAULT_SCROBBLE_PERCENT_THRESHOLD } from "../../common/infrastructure/Atomic.js";
import { RT_TICK_DEFAULT, setRtTick } from "../../sources/PlayerState/RealtimePlayer.js";
import { sleep } from "../../utils.js";
import DeezerInternalSource from "../../sources/DeezerInternalSource.js";
import { DeezerInternalSourceOptions } from "../../common/infrastructure/config/source/deezer.js";

chai.use(asPromised);


const emitter = new EventEmitter();
const generateSource = () => {
    return new TestSource('spotify', 'test', {}, {localUrl: new URL('https://example.com'), configDir: 'fake', logger: loggerTest, version: 'test'},  emitter);
}
let source: TestSource = generateSource();

const generateMemorySource = (config: SourceConfig = {}) => {
    const s = new TestMemorySource('spotify', 'test', config, {localUrl: new URL('https://example.com'), configDir: 'fake', logger: loggerTest, version: 'test'},  emitter);
    s.buildTransformRules();
    s.scheduler.stop();
    return s;
}

const generateMemoryPositionalSource = (config: SourceConfig = {}) => {
    const s = new TestMemoryPositionalSource('spotify', 'test', config, {localUrl: new URL('https://example.com'), configDir: 'fake', logger: loggerTest, version: 'test'},  emitter);
    s.buildTransformRules();
    s.scheduler.stop();
    return s;
}

describe('Sources use transform plays correctly', function () {

    beforeEach(function() {
        source = generateSource();
    });

    it('Transforms play on preCompare', function() {
        source.config.options = {
            playTransform: {
                preCompare: {
                    title: [
                        {
                            search: 'cool',
                            replace: 'fun'
                        }
                    ]
                }
            }
        };
        source.buildTransformRules();
        const newScrobble = generatePlay({
            track: 'my cool track'
        });
        const discovered = source.discover([newScrobble])
        expect(discovered.length).eq(1);
        expect(discovered[0].data.track).is.eq('my fun track');
    });

    it('Transforms play on postCompare', async function() {
        source.config.options = {
            playTransform: {
                postCompare: {
                    title: [
                        {
                            search: 'cool',
                            replace: 'fun'
                        }
                    ]
                }
            }
        };
        source.buildTransformRules();
        const newScrobble = generatePlay({
            track: 'my cool track'
        });
        const discovered = source.discover([newScrobble])
        expect(discovered.length).eq(1);
        expect(discovered[0].data.track).is.eq('my cool track');

        const pAwaiter =  pEvent(source.emitter, 'discoveredToScrobble') as Promise<{data: [PlayObject] }>;
        source.handle(discovered);
        const e = await pAwaiter;
        expect(e.data.length).is.eq(1);
        expect(e.data[0].data.track).is.eq('my fun track');
    });

    it('Transforms play existing comparison', function() {
        source.config.options = {
            playTransform: {
                compare: {
                    existing: {
                        title: [
                            {
                                search: 'hugely cool and very different track',
                                replace: 'fun'
                            }
                        ]
                    }
                }
            }
        };
        source.buildTransformRules();
        const newScrobble = generatePlay({
            track: 'my hugely cool and very different track title',
        });
        const discovered = source.discover([newScrobble])
        expect(discovered.length).eq(1);
        expect(discovered[0].data.track).is.eq('my hugely cool and very different track title');

        expect(source.discover([newScrobble]).length).is.eq(1);
    });

    it('Transforms play candidate comparison', function() {
        source.config.options = {
            playTransform: {
                compare: {
                    candidate: {
                        title: [
                            {
                                search: 'hugely cool and very different track',
                                replace: 'fun'
                            }
                        ]
                    }
                }
            }
        };
        source.buildTransformRules();
        const newScrobble = generatePlay({
            track: 'my hugely cool and very different track title',
        });
        const discovered = source.discover([newScrobble])
        expect(discovered.length).eq(1);
        expect(discovered[0].data.track).is.eq('my hugely cool and very different track title');

        expect(source.discover([newScrobble]).length).is.eq(1);
    });
})


describe('Sources correctly parse incoming payloads', function () {

    it('Spotify parses payload with no album artists correctly', function() {
        const noAAPayload = clone(spotifyPayload)
        noAAPayload.item.album.artists = [];
        const play = SpotifySource.formatPlayObj(noAAPayload as SpotifyApi.CurrentPlaybackResponse);
        expect(play.data.track).eq('The Sandpits Of Zonhoven');
        expect(play.data.album).eq('Bloodbags And Downtube Shifters');
        expect(play.data.artists).eql(['Dubmood', 'MASTER BOOT RECORD']);
        expect(play.data.albumArtists).to.be.empty;
    });

    it('Spotify parses payload with different album artists correctly', function() {
        const play = SpotifySource.formatPlayObj(spotifyPayload as SpotifyApi.CurrentPlaybackResponse);
        expect(play.data.track).eq('The Sandpits Of Zonhoven');
        expect(play.data.album).eq('Bloodbags And Downtube Shifters');
        expect(play.data.artists).eql(['Dubmood', 'MASTER BOOT RECORD']);
        expect(play.data.albumArtists).eql(['Dubmood']);
    });

    it('Spotify parses payload with identical album artists correctly', function() {
        const identicalArtistsPayload = clone(spotifyPayload)
        identicalArtistsPayload.item.album.artists = identicalArtistsPayload.item.artists;
        const identicalArtistsPlay = SpotifySource.formatPlayObj(identicalArtistsPayload as SpotifyApi.CurrentPlaybackResponse);
        expect(identicalArtistsPlay.data.track).eq('The Sandpits Of Zonhoven');
        expect(identicalArtistsPlay.data.album).eq('Bloodbags And Downtube Shifters');
        expect(identicalArtistsPlay.data.artists).eql(['Dubmood', 'MASTER BOOT RECORD']);
        expect(identicalArtistsPlay.data.albumArtists).to.be.empty;
    });
});

describe('Player Cleanup', function () {

    this.afterEach(() => {
        MockDate.reset();
        setRtTick(RT_TICK_DEFAULT);
    });
    this.beforeEach(() => {
        setRtTick(1);
    });

    const cleanedUpDuration = async (generateSource: (config: SourceConfig) => MemorySource) => {
        const source = generateSource({data: {staleAfter: 21, orphanedAfter: 40}, options: {}});
        const initialDate = dayjs();
        const initialState = generatePlayerStateData({position: 0, playData: {duration: 50}, timestamp: initialDate, status: REPORTED_PLAYER_STATUSES.playing});
        expect(source.processRecentPlays([initialState]).length).to.be.eq(0);

        let position = 0;
        let timeSince = 0;

        // simulate polling playing source for 30 seconds, 10 second interval
        for(let i = 0; i < 3; i++) {
            position += 10;
            timeSince += 10;
            MockDate.set(initialDate.add(position, 'seconds').toDate());
            await sleep(1);
            const advancedState = generatePlayerStateData({play: initialState.play, timestamp: dayjs(), position, status: REPORTED_PLAYER_STATUSES.playing});
            expect(source.processRecentPlays([advancedState]).length).to.be.eq(0);
        }

        // simulate polling another 20 seconds without any updates from the Source
        for(let i = 0; i < 2; i++) {
            timeSince += 10;
            MockDate.set(initialDate.add(timeSince, 'seconds').toDate());
            await sleep(1);
            expect(source.processRecentPlays([]).length).to.be.eq(0);
        }

        MockDate.set(initialDate.add(timeSince + 2, 'seconds').toDate());
        await sleep(1);
        const discoveredPlays = source.processRecentPlays([]);
        // cleanup should discover stale play
        expect(discoveredPlays.length).to.be.eq(1);
        expect(discoveredPlays[0].data.listenedFor).closeTo(30, 2);
    } 

    it('Discovers cleaned up Play with correct duration (Non Positional Source)', async function () {
        await cleanedUpDuration(generateMemorySource);
    });

    it('Discovers cleaned up Play with correct duration (Positional Source)', async function () {
        await cleanedUpDuration(generateMemoryPositionalSource);
    });

    const noScrobbleRediscoveryOnActive = async (generateSource: (config: SourceConfig) => MemorySource) => {

        const source = generateSource({data: {staleAfter: 21, orphanedAfter: 40}, options: {}});
        const initialDate = dayjs();
        const initialState = generatePlayerStateData({position: 0, playData: {duration: 50}, timestamp: initialDate, status: REPORTED_PLAYER_STATUSES.playing});
        expect(source.processRecentPlays([initialState]).length).to.be.eq(0);

        let position = 0;
        let timeSince = 0;

        // simulate polling playing source for 30 seconds, 10 second interval
        for(let i = 0; i < 3; i++) {
            position += 10;
            timeSince += 10;
            MockDate.set(initialDate.add(position, 'seconds').toDate());
            await sleep(1);
            const advancedState = generatePlayerStateData({play: initialState.play, timestamp: dayjs(), position, status: REPORTED_PLAYER_STATUSES.playing});
            expect(source.processRecentPlays([advancedState]).length).to.be.eq(0);
        }

        // simulate polling another 20 seconds without any updates from the Source
        for(let i = 0; i < 2; i++) {
            timeSince += 10;
            MockDate.set(initialDate.add(timeSince, 'seconds').toDate());
            await sleep(1);
            expect(source.processRecentPlays([]).length).to.be.eq(0);
        }

        timeSince += 2;

        MockDate.set(initialDate.add(timeSince, 'seconds').toDate());
        await sleep(1);
        const discoveredPlays = source.processRecentPlays([]);
        // cleanup should discover stale play
        expect(discoveredPlays.length).to.be.eq(1);
        expect(discoveredPlays[0].data.listenedFor).closeTo(30, 2);

        timeSince += 10;

        position -= 9;
        // simulate polling another 20 seconds with active source again
        for(let i = 0; i < 2; i++) {
            timeSince += 10;
            MockDate.set(initialDate.add(timeSince, 'seconds').toDate());
            await sleep(1);
            const advancedState = generatePlayerStateData({play: initialState.play, timestamp: dayjs(), position, status: REPORTED_PLAYER_STATUSES.playing});
            expect(source.processRecentPlays([advancedState]).length).to.be.eq(0);
        }

        timeSince += 10;
        MockDate.set(initialDate.add(timeSince, 'seconds').toDate());
        await sleep(1);
        // new Play
        const advancedState = generatePlayerStateData({timestamp: dayjs(), position: 0, status: REPORTED_PLAYER_STATUSES.playing});
        // should not return play because it has only been played for ~20 seconds, less than 50% of duration
        const plays = source.processRecentPlays([advancedState])
        expect(plays.length).to.be.eq(0);
    }


    it('Does not discover same Play after becoming active again (Non Positional Source)', async function () {
        await noScrobbleRediscoveryOnActive(generateMemorySource);
    });

    it('Does not discover same Play after becoming active again (Positional Source)', async function () {
        await noScrobbleRediscoveryOnActive(generateMemoryPositionalSource);
    });

    const noScrobbleStale = async (generateSource: (config: SourceConfig) => MemorySource) => {

        const source = generateSource({data: {staleAfter: 21, orphanedAfter: 40}, options: {}});
        const initialDate = dayjs();

        // if player incorrectly counted stale time then 30s of actual play + 20s of stale time > scrobble threshold of 50% of 90s
        const initialState = generatePlayerStateData({position: 0, playData: {duration: 90}, timestamp: initialDate, status: REPORTED_PLAYER_STATUSES.playing});
        expect(source.processRecentPlays([initialState]).length).to.be.eq(0);

        let position = 0;
        let timeSince = 0;

        // simulate polling playing source for 30 seconds, 10 second interval
        for(let i = 0; i < 3; i++) {
            position += 10;
            timeSince += 10;
            MockDate.set(initialDate.add(position, 'seconds').toDate());
            await sleep(1);
            const advancedState = generatePlayerStateData({play: initialState.play, timestamp: initialDate, position, status: REPORTED_PLAYER_STATUSES.playing});
            expect(source.processRecentPlays([advancedState]).length).to.be.eq(0);
        }

        // simulate polling another 20 seconds without any updates from the Source
        for(let i = 0; i < 2; i++) {
            timeSince += 10;
            MockDate.set(initialDate.add(timeSince, 'seconds').toDate());
            await sleep(1);
            expect(source.processRecentPlays([]).length).to.be.eq(0);
        }

        MockDate.set(initialDate.add(timeSince + 2, 'seconds').toDate());
        const discoveredPlays = source.processRecentPlays([]);
        // cleanup should not discover stale play
        expect(discoveredPlays.length).to.be.eq(0);

    }

    it('Does not discover cleaned up Play that did not meet threshold (Non Positional Source)', async function () {
        await noScrobbleStale(generateMemorySource);
    });

    it('Does not discover cleaned up Play that did not meet threshold (Positional Source)', async function () {
        await noScrobbleStale(generateMemoryPositionalSource);
    });

    const scrobbleRediscoveryOnActive = async (generateSource: (config: SourceConfig) => MemorySource) => {

        const source = generateSource({data: {staleAfter: 21, orphanedAfter: 40}, options: {}});
        const initialDate = dayjs();

        // if player incorrectly counted stale time then 30s of actual play + 20s of stale time > scrobble threshold of 50% of 90s
        const initialState = generatePlayerStateData({position: 0, playData: {duration: 90}, timestamp: initialDate, status: REPORTED_PLAYER_STATUSES.playing});
        expect(source.processRecentPlays([initialState]).length).to.be.eq(0);

        let position = 0;
        let timeSince = 0;

        // simulate polling playing source for 30 seconds, 10 second interval
        for(let i = 0; i < 3; i++) {
            position += 10;
            timeSince += 10;
            MockDate.set(initialDate.add(position, 'seconds').toDate());
            await sleep(1);
            const advancedState = generatePlayerStateData({play: initialState.play, timestamp: dayjs(), position, status: REPORTED_PLAYER_STATUSES.playing});
            expect(source.processRecentPlays([advancedState]).length).to.be.eq(0);
        }

        // simulate polling another 20 seconds without any updates from the Source
        for(let i = 0; i < 2; i++) {
            timeSince += 10;
            MockDate.set(initialDate.add(timeSince, 'seconds').toDate());
            await sleep(1);
            expect(source.processRecentPlays([]).length).to.be.eq(0);
        }

        timeSince += 2;

        MockDate.set(initialDate.add(timeSince, 'seconds').toDate());
        await sleep(1);
        const discoveredPlays = source.processRecentPlays([]);
        // cleanup should not discover stale play
        expect(discoveredPlays.length).to.be.eq(0);

        // so that loop starts 1 second after "paused" position
        position -= 9;

        // simulate ~50 seconds of listening (enough for scrobble)
        MockDate.set(initialDate.add(timeSince, 'seconds').toDate());
        for(let i = 0; i < 5; i++) {
            position += 10;
            timeSince += 10;
            MockDate.set(initialDate.add(position, 'seconds').toDate());
            await sleep(1);
            const advancedState = generatePlayerStateData({play: initialState.play, timestamp: dayjs(), position, status: REPORTED_PLAYER_STATUSES.playing});
            expect(source.processRecentPlays([advancedState]).length).to.be.eq(0);
        }

        timeSince += 10;
        MockDate.set(initialDate.add(position, 'seconds').toDate());
        await sleep(1);
        // new Play
        const advancedState = generatePlayerStateData({timestamp: dayjs(), position: 0, status: REPORTED_PLAYER_STATUSES.playing});
        // should return discovered play with ~90 seconds of duration
        const plays = source.processRecentPlays([advancedState])
        expect(plays.length).to.be.eq(1);
        expect(plays[0].data.duration).to.be.closeTo(90, 2);

    }

    it('Does discover Play after becoming active again (Non Positional Source)', async function () {
        await scrobbleRediscoveryOnActive(generateMemorySource);
    });

    it('Does discover Play after becoming active again (Positional Source)', async function () {
        await scrobbleRediscoveryOnActive(generateMemoryPositionalSource);
    });
});

describe('Scrobble Threshold Checks', function() {

    it('uses defaults when no user-configured thresholds are passed', function() {
        const results = timePassesScrobbleThreshold({}, 1, 1);
        expect(results.duration.threshold).to.eq(DEFAULT_SCROBBLE_DURATION_THRESHOLD);
        expect(results.percent.threshold).to.eq(DEFAULT_SCROBBLE_PERCENT_THRESHOLD);
    });

    it('uses user-configured thresholds when passed', function() {
        const results = timePassesScrobbleThreshold({
            duration: 20,
            percent: 15
        }, 1, 1);
        expect(results.duration.threshold).to.eq(20);
        expect(results.percent.threshold).to.eq(15);
    });

    it('passes when duration is above threshold', function() {
        const results = timePassesScrobbleThreshold({}, DEFAULT_SCROBBLE_DURATION_THRESHOLD + 1);
        expect(results.duration.passes).is.true;
        expect(results.passes).is.true;
    });

    it('passes when percent is above threshold', function() {
        const results = timePassesScrobbleThreshold({}, 30, 50);
        expect(results.percent.passes).is.true;
        expect(results.passes).is.true;
    });

    it('handles zero duration', function() {
        const results = timePassesScrobbleThreshold({}, DEFAULT_SCROBBLE_DURATION_THRESHOLD + 1, 0);
        expect(results.duration.passes).is.true;
        expect(results.passes).is.true;
    });
});

const generateDeezerSource = (options: DeezerInternalSourceOptions = {}) => {
    return new DeezerInternalSource('test', {data: {arl: 'test'}, options}, {localUrl: new URL('https://example.com'), configDir: 'fake', logger: loggerTest, version: 'test'},  emitter);
}
const firstPlayDate = dayjs().subtract(1, 'hour');
const normalizedPlays = normalizePlays(generatePlays(6), {initialDate: firstPlayDate});
const lastPlay = normalizedPlays[normalizePlays.length - 1];

describe('Deezer Internal Source', function() {

    describe('When fuzzyDiscoveryIgnore is not defined or false', function () {

        it('discovers fuzzy play', function() {
            const interimPlay = generatePlay({playDate: lastPlay.data.playDate.add(15, 's'), duration: 80});
            const targetPlay = normalizedPlays[normalizedPlays.length - 2]
            const fuzzyPlay = clone(targetPlay);
            fuzzyPlay.data.playDate = targetPlay.data.playDate.add(targetPlay.data.duration, 's');

            const source = generateDeezerSource();
            source.discover([...normalizedPlays, interimPlay]);

            const discovered = source.discover([fuzzyPlay]);

            expect(discovered.length).to.eq(1);
        });
    });

    describe('When fuzzyDiscoveryIgnore is true', function () {

        it('does not discover fuzzy play with interim plays', function() {
            const interimPlay = generatePlay({playDate: lastPlay.data.playDate.add(15, 's'), duration: 80});
            const targetPlay = normalizedPlays[normalizedPlays.length - 2]
            const fuzzyPlay = clone(targetPlay);
            fuzzyPlay.data.playDate = targetPlay.data.playDate.add(targetPlay.data.duration, 's');

            const source = generateDeezerSource({fuzzyDiscoveryIgnore: true});
            source.discover([...normalizedPlays, interimPlay]);

            const discovered = source.discover([fuzzyPlay]);

            expect(discovered.length).to.eq(0);
        });

        it('discovers fuzzy play when it is the last play ', function() {
            const targetPlay = normalizedPlays[normalizedPlays.length - 1]
            const fuzzyPlay = clone(targetPlay);
            fuzzyPlay.data.playDate = targetPlay.data.playDate.add(targetPlay.data.duration, 's');

            const source = generateDeezerSource({fuzzyDiscoveryIgnore: true});
            source.discover(normalizedPlays);

            const discovered = source.discover([fuzzyPlay]);

            expect(discovered.length).to.eq(1);
        });

        it('discovers fuzzy play when it is played consecutively', function() {
            const targetPlay = normalizedPlays[normalizedPlays.length - 1]
            const fuzzyPlay = clone(targetPlay);
            fuzzyPlay.data.playDate = targetPlay.data.playDate.add(targetPlay.data.duration, 's');
            const morePlays = normalizePlays([...normalizedPlays, fuzzyPlay, ...generatePlays(2)], {initialDate: firstPlayDate});

            const source = generateDeezerSource({fuzzyDiscoveryIgnore: true});
            const discovered = source.discover(morePlays);

            expect(discovered.length).to.eq(morePlays.length);
        });
    });

        describe('When fuzzyDiscoveryIgnore is aggressive', function () {

            it('does not discover fuzzy play with interim plays', function() {
                const interimPlay = generatePlay({playDate: lastPlay.data.playDate.add(15, 's'), duration: 80});
                const targetPlay = normalizedPlays[normalizedPlays.length - 2]
                const fuzzyPlay = clone(targetPlay);
                fuzzyPlay.data.playDate = targetPlay.data.playDate.add(targetPlay.data.duration, 's');

                const source = generateDeezerSource({fuzzyDiscoveryIgnore: 'aggressive'});
                source.discover([...normalizedPlays, interimPlay]);

                const discovered = source.discover([fuzzyPlay]);

                expect(discovered.length).to.eq(0);
            });

            it('does not discover fuzzy play with delay of up to 40 seconds', function() {
                const interimPlay = generatePlay({playDate: lastPlay.data.playDate.add(15, 's'), duration: 80});
                const targetPlay = normalizedPlays[normalizedPlays.length - 2]
                const fuzzyPlay = clone(targetPlay);
                fuzzyPlay.data.playDate = targetPlay.data.playDate.add(targetPlay.data.duration + 39, 's');

                const source = generateDeezerSource({fuzzyDiscoveryIgnore: 'aggressive'});
                source.discover([...normalizedPlays, interimPlay]);

                const discovered = source.discover([fuzzyPlay]);

                expect(discovered.length).to.eq(0);
            });

            it('it does not discover fuzzy play when it is the last play ', function() {
                const targetPlay = normalizedPlays[normalizedPlays.length - 1]
                const fuzzyPlay = clone(targetPlay);
                fuzzyPlay.data.playDate = targetPlay.data.playDate.add(targetPlay.data.duration, 's');

                const source = generateDeezerSource({fuzzyDiscoveryIgnore: 'aggressive'});
                source.discover(normalizedPlays);

                const discovered = source.discover([fuzzyPlay]);

                expect(discovered.length).to.eq(0);
            });

            it('does not discover fuzzy play when it is played consecutively', function() {
                const targetPlay = normalizedPlays[normalizedPlays.length - 1]
                const fuzzyPlay = clone(targetPlay);
                fuzzyPlay.data.playDate = targetPlay.data.playDate.add(targetPlay.data.duration, 's');
                const morePlays = normalizePlays([...normalizedPlays, fuzzyPlay, ...generatePlays(2)], {initialDate: firstPlayDate});

                const source = generateDeezerSource({fuzzyDiscoveryIgnore: 'aggressive'});
                const discovered = source.discover(morePlays);

                expect(discovered.length).to.eq(morePlays.length - 1);
            });

        });
});