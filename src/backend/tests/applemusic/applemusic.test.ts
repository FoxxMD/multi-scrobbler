import { describe, it } from 'mocha';
import { loggerTest } from "@foxxmd/logging";
import chai, { expect } from 'chai';
import asPromised from 'chai-as-promised';
import clone from "clone";
import AppleMusicSource from "../../sources/AppleMusicSource.ts";
import EventEmitter from "events";
import { generatePlay, generatePlays } from '../../../core/tests/utils/PlayTestUtils.ts';
import type { AppleMusicSourceConfig } from '../../common/infrastructure/config/source/applemusic.ts';
import { sleep } from '../../utils.ts';
import dayjs from 'dayjs';

chai.use(asPromised);

const createAppleMusicSource = async (opts?: {
    config?: any
    emitter?: EventEmitter
}) => {
    const {
        config = {
            data: {
                token: 'mock-token',
                mediaUserToken: 'mock-media',
            },
            options: {
                logDiff: true
            }
        },
        emitter = new EventEmitter
    } = opts || {};
    
    const source = new AppleMusicSource('test', config as AppleMusicSourceConfig, { localUrl: new URL('https://example.com'), configDir: 'fake', logger: loggerTest, version: 'test' }, emitter);
    
    await source.buildDatabase();
    source.buildTransformRules();
    
    return source;
}

describe('Apple Music - History Consistency & Deduplication', function () {

    it(`Adds new, prepended track`, async function () {
        const source = await createAppleMusicSource();
        const plays = generatePlays(20, {playDate: dayjs().subtract(10, 'minutes')}, { comment: 'Initial' });

        // emulating init, get history to use as base truth without discovering tracks
        expect(source.parseRecentAgainstResponse(plays).plays).length(20);

        source.polling = true;

        // first true poll emulating no new tracks played (should not add new tracks from base truth)
        expect(source.parseRecentAgainstResponse(plays).plays).length(0);

        // add new track played
        const prependedPlays = [generatePlay({}, { comment: 'New Track' }), ...plays.slice(0, 19)];
        const prependResult = source.parseRecentAgainstResponse(prependedPlays);
        
        expect(prependResult.plays).length(1);
        expect(prependResult).to.deep.include({consistent: true, diffType: 'added'});
        expect(prependResult.diffResults![2]).eq('prepend');
    });

    it(`Recovers top-rebound duplicate play (interrupted loop)`, async function () {
        const source = await createAppleMusicSource();

        // E.g., [Song A, Song C, Song X...]
        const plays = generatePlays(20, {duration: 180});

        expect(source.parseRecentAgainstResponse(plays).plays).length(20);
        source.polling = true;

        // User plays Song B (interim track), then plays Song A again. 
        // Apple Music deduplicates Song A by bumping it to the top.
        // Expected Apple Music API output: [Song A, Song B, Song C, Song X...]
        const interimPlay = generatePlay({duration: 200}, { comment: 'Interim Song B' });
        const topReboundPlays = [plays[0], interimPlay, ...plays.slice(1, 19)];

        const reboundResult = source.parseRecentAgainstResponse(topReboundPlays);

        expect(reboundResult.consistent).to.be.true;
        expect(reboundResult.diffType).to.equal('top-rebound');
        
        // It should recover BOTH the interim track and the re-listen of the top track
        expect(reboundResult.plays).to.have.length(2);
        
        // Oldest first, newest last
        expect(reboundResult.plays[0].data.track).to.equal(interimPlay.data.track);
        expect(reboundResult.plays[1].data.track).to.equal(plays[0].data.track);
    });

    it(`Ignores top-rebound when recoverUnchangedTopHistory is false`, async function () {
        // Pass the disabled config option into the constructor
        const source = await createAppleMusicSource({
            config: {
                data: {
                    token: 'mock-token',
                    mediaUserToken: 'mock-media',
                },
                options: {
                    logDiff: true,
                    recoverUnchangedTopHistory: false // <--- Key difference
                }
            }
        });
        
        const plays = generatePlays(20);

        source.parseRecentAgainstResponse(plays);
        source.polling = true;

        // Simulate top-rebound deduplication
        const interimPlay = generatePlay({}, { comment: 'Interim Song B' });
        const topReboundPlays = [plays[0], interimPlay, ...plays.slice(1, 19)];

        const result = source.parseRecentAgainstResponse(topReboundPlays);

        // Because the flag is disabled, it should fail temporal consistency and reset the list
        expect(result.consistent).to.be.false;
        expect(result.plays).to.have.length(0);
        expect(result.reason).includes('temporally inconsistent order');
    });

    it(`Adds bumped, prepended track (Standard bump without top-rebound)`, async function () {
        const source = await createAppleMusicSource();
        const plays = generatePlays(20);

        source.parseRecentAgainstResponse(plays);
        source.polling = true;

        // Move a track from index 6 to index 0 (Apple Music bumped it)
        const bumpedList = [...plays.map(x => clone(x))];
        const bumped = bumpedList[6];
        bumpedList.splice(6, 1);
        bumpedList.unshift(bumped);
        
        // Slice to 20 to mimic API limit
        const limitedBumpedList = bumpedList.slice(0, 20); 

        const bumpedResults = source.parseRecentAgainstResponse(limitedBumpedList);
        
        expect(bumpedResults.plays).length(1);
        expect(bumpedResults).to.deep.include({consistent: true, diffType: 'bump'});
        expect(bumpedResults.diffResults![2]).eq('prepend');
    });

    it(`Does not add appended track`, async function () {
        const source = await createAppleMusicSource();
        const plays = generatePlays(20);

        // Initialize
        source.parseRecentAgainstResponse(plays);
        source.polling = true;

        // Track is erroneously added to end of history (temporally inconsistent)
        const appendPlays = [...plays.slice(1), generatePlay({}, { comment: 'Appended Track' })];
        const appendedResult = source.parseRecentAgainstResponse(appendPlays);
        
        expect(appendedResult.plays).length(0);
        expect(appendedResult).to.deep.include({consistent: false, diffType: 'added'});
        expect(appendedResult.diffResults![2]).eq('append');
        
        // Assert that it threw the specific error reason for an append instead of a prepend
        expect(appendedResult.reason).to.include('New tracks were added to Apple Music history in an unexpected way (append)');
    });

    it(`Detects outdated recent history when order was previously seen`, async function () {
        this.timeout(3700);
        const source = await createAppleMusicSource();
        const plays = generatePlays(20);

        source.parseRecentAgainstResponse(plays);
        source.polling = true;

        // Add new track played
        const newPlay = generatePlay({}, { comment: 'New Track' });
        const prependedPlays = [newPlay, ...plays.slice(0, 19)];
        expect(source.parseRecentAgainstResponse(prependedPlays).plays).length(1);

        await sleep(50);

        // Apple Music returns outdated history (the original list)
        // Should be detected as append since the last track reappears
        const badAppend = source.parseRecentAgainstResponse(plays);
        expect(badAppend).to.deep.include({consistent: false, diffType: 'added', plays: []});
        expect(badAppend.diffResults![2]).eq('append');

        await sleep(10);

        // Continued outdated history
        expect(source.parseRecentAgainstResponse(plays)).to.deep.include({consistent: true, plays: []});

        await sleep(10);

        // Correct, current history is finally returned correctly again
        const recentHistoryResult = source.parseRecentAgainstResponse(prependedPlays);
        expect(recentHistoryResult).to.deep.include({consistent: false, plays: []});
        
        // Should detect that we have seen this exact history state recently and NOT add the tracks again
        expect(recentHistoryResult.reason).includes('Apple Music History has exact order as another recent response');
    });
});

describe('Apple Music - Timestamp Estimation', function () {
    
    it(`Applies calculated timestamps based on track durations`, async function () {
        const source = await createAppleMusicSource();
        
        // 1. Setup a base history (polling = false triggers initialization bypass)
        const initialPlays = [generatePlay({duration: 100})];
        source.parseRecentAgainstResponse(initialPlays);
        
        // 2. Turn on polling to trigger standard new track discovery
        source.polling = true;

        // Tracks played while polling:
        const oldest = generatePlay({duration: 100});
        const middle = generatePlay({duration: 200});
        const newest = generatePlay({duration: 300});

        // Apple Music API returns newest first, so we prepend them
        const newHistory = [newest, middle, oldest, ...initialPlays];
        
        // 3. Process the new history
        const results = source.parseRecentAgainstResponse(newHistory);

        // Resulting plays array is returned oldest-to-newest
        expect(results.plays.length).to.equal(3);

        const oldestPlayTime = results.plays[0].data.playDate;
        const middlePlayTime = results.plays[1].data.playDate;
        const newestPlayTime = results.plays[2].data.playDate;

        // Since it calculates backward:
        // Newest play should be ~now
        // Middle should be (now - newest.duration) = (now - 300s)
        // Oldest should be (now - newest.duration - middle.duration) = (now - 500s)
        
        expect(newestPlayTime!.isAfter(middlePlayTime!)).to.be.true;
        expect(middlePlayTime!.isAfter(oldestPlayTime!)).to.be.true;

        // Verify the gaps match the track durations
        const diffNewToMiddle = newestPlayTime!.diff(middlePlayTime!, 'seconds');
        expect(diffNewToMiddle).to.be.closeTo(300, 1);
        
        const diffMiddleToOldest = middlePlayTime!.diff(oldestPlayTime!, 'seconds');
        expect(diffMiddleToOldest).to.be.closeTo(200, 1);
    });
});

describe('Apple Music - Format Play Object', function () {
    
    it(`Strips " - EP" and " - Single" suffixes from album names`, function () {
        // Mock Apple Music API Song objects
        const trackEP = {
            id: '1',
            type: 'songs',
            name: 'SONG A',
            artistName: 'ARIST A',
            albumName: 'ALBUM A - EP',
            durationInMillis: 200000
        } as any; // Cast as any to bypass TS complaining about missing API fields (artworks, etc.)

        const trackSingle = {
            id: '2',
            type: 'songs',
            name: 'SONG B',
            artistName: 'ARIST B',
            albumName: 'ALBUM B - Single',
            durationInMillis: 200000
        } as any;

        const trackNormal = {
            id: '3',
            type: 'songs',
            name: 'SONG C',
            artistName: 'ARIST C',
            albumName: 'ALBUM C - The 2nd Album',
            durationInMillis: 200000
        } as any;

        const trackLowercase = {
            id: '4',
            type: 'songs',
            name: 'song d',
            artistName: 'artist d',
            albumName: 'album d - ep',
            durationInMillis: 200000
        } as any;

        const formatOptions = {normalizeAlbum: true};

        // Run them through the formatter
        const playEP = AppleMusicSource.formatPlayObj(trackEP, formatOptions);
        const playSingle = AppleMusicSource.formatPlayObj(trackSingle, formatOptions);
        const playNormal = AppleMusicSource.formatPlayObj(trackNormal, formatOptions);
        const playLowercase = AppleMusicSource.formatPlayObj(trackLowercase, formatOptions);

        // Assert the suffixes are removed
        expect(playEP.data.album).to.equal('ALBUM A');
        expect(playSingle.data.album).to.equal('ALBUM B');
        expect(playLowercase.data.album).to.equal('album d');

        // Assert normal album names are untouched
        expect(playNormal.data.album).to.equal(trackNormal.albumName);
    });
});