import { loggerTest, loggerDebug } from "@foxxmd/logging";
import chai, { assert, expect } from 'chai';
import asPromised from 'chai-as-promised';
import EventEmitter from "events";
import { after, before, describe, it } from 'mocha';
import pEvent from "p-event";
import clone from 'clone';
import { PlayObject } from "../../../core/Atomic.js";
import { generatePlay, generatePlayerStateData } from "../utils/PlayTestUtils.js";
import { TestMemoryPositionalSource, TestMemorySource, TestSource } from "./TestSource.js";
import spotifyPayload from '../plays/spotifyCurrentPlaybackState.json';
import SpotifySource from "../../sources/SpotifySource.js";
import MockDate from 'mockdate';
import dayjs, { Dayjs } from "dayjs";
import { REPORTED_PLAYER_STATUSES } from "../../common/infrastructure/Atomic.js";
import { SourceConfig } from "../../common/infrastructure/config/source/sources.js";
import MemorySource from "../../sources/MemorySource.js";

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
    });

    const cleanedUpDuration = (generateSource: (config: SourceConfig) => MemorySource) => {
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
            const advancedState = generatePlayerStateData({play: initialState.play, timestamp: dayjs(), position, status: REPORTED_PLAYER_STATUSES.playing});
            expect(source.processRecentPlays([advancedState]).length).to.be.eq(0);
        }

        // simulate polling another 20 seconds without any updates from the Source
        for(let i = 0; i < 2; i++) {
            timeSince += 10;
            MockDate.set(initialDate.add(timeSince, 'seconds').toDate());
            expect(source.processRecentPlays([]).length).to.be.eq(0);
        }

        MockDate.set(initialDate.add(timeSince + 2, 'seconds').toDate());
        const discoveredPlays = source.processRecentPlays([]);
        // cleanup should discover stale play
        expect(discoveredPlays.length).to.be.eq(1);
        expect(discoveredPlays[0].data.listenedFor).closeTo(30, 2);
    } 

    it('Discovers cleaned up Play with correct duration (Non Positional Source)', function () {
        cleanedUpDuration(generateMemorySource);
    });

    it('Discovers cleaned up Play with correct duration (Positional Source)', function () {
        cleanedUpDuration(generateMemoryPositionalSource);
    });

    const noScrobbleRediscoveryOnActive = (generateSource: (config: SourceConfig) => MemorySource) => {

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
            const advancedState = generatePlayerStateData({play: initialState.play, timestamp: dayjs(), position, status: REPORTED_PLAYER_STATUSES.playing});
            expect(source.processRecentPlays([advancedState]).length).to.be.eq(0);
        }

        // simulate polling another 20 seconds without any updates from the Source
        for(let i = 0; i < 2; i++) {
            timeSince += 10;
            MockDate.set(initialDate.add(timeSince, 'seconds').toDate());
            expect(source.processRecentPlays([]).length).to.be.eq(0);
        }

        timeSince += 2;

        MockDate.set(initialDate.add(timeSince, 'seconds').toDate());
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
            const advancedState = generatePlayerStateData({play: initialState.play, timestamp: dayjs(), position, status: REPORTED_PLAYER_STATUSES.playing});
            expect(source.processRecentPlays([advancedState]).length).to.be.eq(0);
        }

        timeSince += 10;
        MockDate.set(initialDate.add(timeSince, 'seconds').toDate());
        // new Play
        const advancedState = generatePlayerStateData({timestamp: dayjs(), position: 0, status: REPORTED_PLAYER_STATUSES.playing});
        // should not return play because it has only been played for ~20 seconds, less than 50% of duration
        const plays = source.processRecentPlays([advancedState])
        expect(plays.length).to.be.eq(0);
    }


    it('Does not discover same Play after becoming active again (Non Positional Source)', function () {
        noScrobbleRediscoveryOnActive(generateMemorySource);
    });

    it('Does not discover same Play after becoming active again (Positional Source)', function () {
        noScrobbleRediscoveryOnActive(generateMemoryPositionalSource);
    });

    const noScrobbleStale = (generateSource: (config: SourceConfig) => MemorySource) => {

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
            const advancedState = generatePlayerStateData({play: initialState.play, timestamp: initialDate, position, status: REPORTED_PLAYER_STATUSES.playing});
            expect(source.processRecentPlays([advancedState]).length).to.be.eq(0);
        }

        // simulate polling another 20 seconds without any updates from the Source
        for(let i = 0; i < 2; i++) {
            timeSince += 10;
            MockDate.set(initialDate.add(timeSince, 'seconds').toDate());
            expect(source.processRecentPlays([]).length).to.be.eq(0);
        }

        MockDate.set(initialDate.add(timeSince + 2, 'seconds').toDate());
        const discoveredPlays = source.processRecentPlays([]);
        // cleanup should not discover stale play
        expect(discoveredPlays.length).to.be.eq(0);

    }

    it('Does not discover cleaned up Play that did not meet threshold (Non Positional Source)', function () {
        noScrobbleStale(generateMemorySource);
    });

    it('Does not discover cleaned up Play that did not meet threshold (Positional Source)', function () {
        noScrobbleStale(generateMemoryPositionalSource);
    });

    const scrobbleRediscoveryOnActive = (generateSource: (config: SourceConfig) => MemorySource) => {

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
            const advancedState = generatePlayerStateData({play: initialState.play, timestamp: dayjs(), position, status: REPORTED_PLAYER_STATUSES.playing});
            expect(source.processRecentPlays([advancedState]).length).to.be.eq(0);
        }

        // simulate polling another 20 seconds without any updates from the Source
        for(let i = 0; i < 2; i++) {
            timeSince += 10;
            MockDate.set(initialDate.add(timeSince, 'seconds').toDate());
            expect(source.processRecentPlays([]).length).to.be.eq(0);
        }

        timeSince += 2;

        MockDate.set(initialDate.add(timeSince, 'seconds').toDate());
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
            const advancedState = generatePlayerStateData({play: initialState.play, timestamp: dayjs(), position, status: REPORTED_PLAYER_STATUSES.playing});
            expect(source.processRecentPlays([advancedState]).length).to.be.eq(0);
        }

        timeSince += 10;
        MockDate.set(initialDate.add(position, 'seconds').toDate());
        // new Play
        const advancedState = generatePlayerStateData({timestamp: dayjs(), position: 0, status: REPORTED_PLAYER_STATUSES.playing});
        // should return discovered play with ~90 seconds of duration
        const plays = source.processRecentPlays([advancedState])
        expect(plays.length).to.be.eq(1);
        expect(plays[0].data.duration).to.be.closeTo(90, 2);

    }

    it('Does discover Play after becoming active again (Non Positional Source)', function () {
        scrobbleRediscoveryOnActive(generateMemorySource);
    });

    it('Does discover Play after becoming active again (Positional Source)', function () {
        scrobbleRediscoveryOnActive(generateMemoryPositionalSource);
    });
});