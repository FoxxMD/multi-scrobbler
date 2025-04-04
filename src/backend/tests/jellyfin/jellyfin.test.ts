import { loggerTest } from "@foxxmd/logging";
import { assert, expect } from 'chai';
import EventEmitter from "events";
import { describe, it } from 'mocha';
import { JsonPlayObject, PlayMeta, PlayObject } from "../../../core/Atomic.ts";

import JellyfinSource from "../../sources/JellyfinSource.ts";
import JellyfinApiSource from "../../sources/JellyfinApiSource.ts";
import samplePayload from './playbackProgressSample.json';
import validSession from './validSession.json';
import { JellyApiData } from "../../common/infrastructure/config/source/jellyfin.ts";
import { generatePlay } from "../utils/PlayTestUtils.ts";
import { fakerJA } from "@faker-js/faker";
import {
    // @ts-expect-error weird typings?
    SessionInfo,
} from "@jellyfin/sdk/lib/generated-client/index.ts";
import { PlayerStateDataMaybePlay } from "../../common/infrastructure/Atomic.ts";

const dataAsFixture = (data: any): TestFixture => {
    return data as TestFixture;
}

interface TestFixture {
    data: any
    expected: JsonPlayObject
}

const createJfApi = (data: JellyApiData): JellyfinApiSource => {
    const jf = new JellyfinApiSource('Test', {
        data,
        options: {}
    }, { localUrl: new URL('http://test'), configDir: 'test', logger: loggerTest, version: 'test' }, new EventEmitter());
    jf.libraries = [{name: 'music', paths: ['/data/allmusic'], collectionType: 'music'}];
    return jf;
}

const defaultJfApiCreds = {url: 'http://example.com', user: 'MyUser', apiKey: '1234'};

const validPlayerState: PlayerStateDataMaybePlay = {
    platformId: ['1234', 'MyUser'],
    play: generatePlay({}, {mediaType: 'Audio', user: 'MyUser', deviceId: '1234'})
}
const playWithMeta = (meta: PlayMeta): PlayerStateDataMaybePlay => {
    const {user, deviceId} = meta;
    const platformId = validPlayerState.platformId;
    return {
    ...validPlayerState,
    platformId: [deviceId ?? platformId[0], user ?? platformId[1]],
    play: {
        ...validPlayerState.play,
        meta: {
            ...validPlayerState.play?.meta,
            ...meta
        }
    }
}}// ({...validPlayerState, meta: {...validPlayerState.meta, ...meta}});

const nowPlayingSession = (data: object): SessionInfo => ({...validSession, NowPlayingItem: {...validSession.NowPlayingItem, ...data}});

describe('Jellyfin Legacy Source', function() {
    describe('Jellyfin Payload Parsing', function () {

        it('Should parse PlayProgress payload as PlayObject', async function () {
            const fixture = dataAsFixture(samplePayload[0]);
            const play = JellyfinSource.formatPlayObj(fixture.data);
    
            assert.equal(play.data.track, fixture.expected.data.track);
            assert.equal(play.meta.mediaType, 'Audio');
        });
    });

    describe('Correctly detects events as valid/invalid', function () {
        const jfSource = new JellyfinSource('Test', {data: {}}, {localUrl: new URL('http://test'), configDir: 'test', logger: loggerTest, version: 'test'}, new EventEmitter());
        it('Should parse PlayProgress with Audio ItemType as valid event', async function () {
            const fixture = dataAsFixture(samplePayload[0]);
            const play = JellyfinSource.formatPlayObj(fixture.data);

            assert.isTrue(jfSource.isValidEvent(play))
            await jfSource.destroy();
        });
    });
});

describe("Jellyfin API Source", function() {
    describe('Parses config allow/block correctly', function () {
    
        it('Should parse users, devices, and libraries, and library types as lowercase from config', async function () {
            const jf = createJfApi({
                usersAllow: ['MyUser', 'AnotherUser'],
                usersBlock: ['SomeUser'],
                devicesAllow: ['Web Player'],
                devicesBlock: ['Bad Player'],
                librariesAllow: ['MuSiCoNe'],
                librariesBlock: ['MuSiCbAd'],
                additionalAllowedLibraryTypes: ['TVShowS'],
                ...defaultJfApiCreds});
            await jf.buildInitData();

            expect(jf.usersAllow).to.be.eql(['myuser', 'anotheruser']);
            expect(jf.usersBlock).to.be.eql(['someuser']);
            expect(jf.devicesAllow).to.be.eql(['web player']);
            expect(jf.devicesBlock).to.be.eql(['bad player']);
            expect(jf.librariesAllow).to.be.eql(['musicone']);
            expect(jf.librariesBlock).to.be.eql(['musicbad']);
            expect(jf.allowedLibraryTypes).to.be.eql(['music','tvshows']);
            await jf.destroy();
        });

        it('Should include authenticating user as allowed when no others are set', async function () {
            const jf = createJfApi({...defaultJfApiCreds});
            await jf.buildInitData();

            expect(jf.usersAllow).to.be.eql(['myuser']);
            await jf.destroy();
        });

        it('Should set allowed users to empty array (allow all) when usersAllow is true', async function () {
            const jf = createJfApi({...defaultJfApiCreds, usersAllow: true});
            await jf.buildInitData();

            expect(jf.usersAllow).to.be.empty;
            await jf.destroy();
        });

        it('Should set allowed users to empty array (allow all) when usersAllow is an array with only one value equal to true', async function () {
            const jf = createJfApi({...defaultJfApiCreds, usersAllow: ['true']});
            await jf.buildInitData();

            expect(jf.usersAllow).to.be.empty;
            await jf.destroy();
        });
    });

    describe('Correctly detects activity as valid/invalid', function() {

        describe('Filters from Configuration', function() {

            it('Should allow activity based on user allow', async function () {
                const jf = createJfApi({...defaultJfApiCreds});
                await jf.buildInitData();
    
                expect(jf.isActivityValid(playWithMeta({user: 'SomeOtherUser'}), validSession)).to.not.be.true;
                expect(jf.isActivityValid(validPlayerState, validSession)).to.be.true;
                expect(jf.isActivityValid(playWithMeta({user: 'myuser'}), validSession)).to.be.true;
                await jf.destroy();
            });
    
            it('Should disallow activity based on user block', async function () {
                const jf = createJfApi({...defaultJfApiCreds, usersBlock: ['BadUser']});
                await jf.buildInitData();
    
                expect(jf.isActivityValid(playWithMeta({user: 'BadUser'}), validSession)).to.not.be.true;
                expect(jf.isActivityValid(validPlayerState, validSession)).to.be.true;
                expect(jf.isActivityValid(playWithMeta({user: 'myuser'}), validSession)).to.be.true;
                await jf.destroy();
            });
    
            it('Should allow activity based on devices allow', async function () {
                const jf = createJfApi({...defaultJfApiCreds, devicesAllow: ['WebPlayer']});
                await jf.buildInitData();
    
                expect(jf.isActivityValid(validPlayerState, validSession)).to.not.be.true;
                expect(jf.isActivityValid(playWithMeta({deviceId: 'WebPlayer'}), validSession)).to.be.true;
                await jf.destroy();
            });
    
            it('Should disallow activity based on devices block', async function () {
                const jf = createJfApi({...defaultJfApiCreds, devicesBlock: ['WebPlayer']});
                await jf.buildInitData();
    
                expect(jf.isActivityValid(validPlayerState, validSession)).to.be.true;
                expect(jf.isActivityValid(playWithMeta({deviceId: 'WebPlayer'}), validSession)).to.not.be.true;
                await jf.destroy();
            });

            it('Should allow activity based on additional libraries typed allowed', async function () {
                const jf = createJfApi({...defaultJfApiCreds, additionalAllowedLibraryTypes: ['musicvideos']});
                await jf.buildInitData();
                jf.libraries.push({name: 'CoolVideos', paths: ['/data/someOtherFolder'], collectionType: 'musicvideos'});
    
                expect(jf.isActivityValid(validPlayerState, nowPlayingSession({Path: '/data/someOtherFolder/myMusic.mp3'}))).to.be.true;
                await jf.destroy();
            });

            it('Should allow activity based on libraries allow', async function () {
                const jf = createJfApi({...defaultJfApiCreds, librariesAllow: ['music']});
                await jf.buildInitData();
    
                expect(jf.isActivityValid(validPlayerState, validSession)).to.be.true;
                expect(jf.isActivityValid(validPlayerState, nowPlayingSession({Path: '/data/someOtherFolder/myMusic.mp3'}))).to.not.be.true;
                await jf.destroy();
            });

            it('Should allow activity based on libraries allow and override library type restriction', async function () {
                const jf = createJfApi({...defaultJfApiCreds, librariesAllow: ['CoolVideos','music']});
                await jf.buildInitData();
                jf.libraries.push({name: 'CoolVideos', paths: ['/data/someOtherFolder'], collectionType: 'musicvideos'});
    
                expect(jf.isActivityValid(validPlayerState, validSession)).to.be.true;
                expect(jf.isActivityValid(validPlayerState, nowPlayingSession({Path: '/data/someOtherFolder/myMusic.mp3'}))).to.be.true;
                await jf.destroy();
            });
    
            it('Should disallow activity based on libraries block', async function () {
                const jf = createJfApi({...defaultJfApiCreds, librariesBlock: ['music']});
                await jf.buildInitData();
                jf.libraries.push({name: 'CoolMusic', paths: ['/data/someOtherFolder'], collectionType: 'music'});
    
                expect(jf.isActivityValid(validPlayerState, validSession)).to.not.be.true;
                expect(jf.isActivityValid(validPlayerState, nowPlayingSession({Path: '/data/someOtherFolder/myMusic.mp3'}))).to.be.true;
                await jf.destroy();
            });

        });

        describe('Detection by Session/Media/Library Type', function() {

            it('Should allow activity with valid MediaType and valid Library', async function () {
                const jf = createJfApi({...defaultJfApiCreds});
                await jf.buildInitData();
    
                expect(jf.isActivityValid(validPlayerState, validSession)).to.be.true;
                await jf.destroy();
            });

            it('Should disallow activity with invalid library type', async function () {
                const jf = createJfApi({...defaultJfApiCreds});
                await jf.buildInitData();
                jf.libraries.push({name: 'CoolVideos', paths: ['/data/someOtherFolder'], collectionType: 'musicvideos'});
    
                expect(jf.isActivityValid(validPlayerState, nowPlayingSession({Path: '/data/someOtherFolder/myMusic.mp3'}))).to.not.be.true;
                await jf.destroy();
            });

            it('Should disallow NowPlayingItem that is not valid Type', async function () {
                const jf = createJfApi({...defaultJfApiCreds});
                await jf.buildInitData();
    
                expect(jf.isActivityValid(validPlayerState, nowPlayingSession({Type: 'Book'}))).to.not.be.true;
                await jf.destroy();
            });
    
            it('Should disallow Play that is not valid MediaType', async function () {
                const jf = createJfApi({...defaultJfApiCreds});
                await jf.buildInitData();
    
                expect(jf.isActivityValid(playWithMeta({mediaType: 'Video'}), validSession)).to.not.be.true;
                expect(jf.isActivityValid(playWithMeta({mediaType: 'Unknown'}), validSession)).to.not.be.true;
                await jf.destroy();
            });
    
            it('Should allow Play with unknown mediaType if specified in options', async function () {
                const jf = createJfApi({...defaultJfApiCreds});
                jf.config.data.allowUnknown = true;
                await jf.buildInitData();
    
                expect(jf.isActivityValid(playWithMeta({mediaType: 'Unknown'}), validSession)).to.be.true;
                await jf.destroy();
            });
    
            it('Should disallow NowPlayingItem that is a theme song (ExtraType)', async function () {
                const jf = createJfApi({...defaultJfApiCreds});
                await jf.buildInitData();
    
                expect(jf.isActivityValid(validPlayerState, nowPlayingSession({ExtraType: 'ThemeSong'}))).to.not.be.true;
                await jf.destroy();
            });

        });
    });
});
