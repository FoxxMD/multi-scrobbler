import { loggerTest } from "@foxxmd/logging";
import { assert, expect } from 'chai';
import EventEmitter from "events";
import { describe, it } from 'mocha';
import { JsonPlayObject, PlayMeta, PlayObject } from "../../../core/Atomic.js";

import JellyfinSource from "../../sources/JellyfinSource.js";
import JellyfinApiSource from "../../sources/JellyfinApiSource.js";
import samplePayload from './playbackProgressSample.json';
import validSession from './validSession.json';
import { JellyApiData } from "../../common/infrastructure/config/source/jellyfin.js";
import { generatePlay } from "../utils/PlayTestUtils.js";
import { fakerJA } from "@faker-js/faker";
import {
    // @ts-expect-error weird typings?
    SessionInfo,
} from "@jellyfin/sdk/lib/generated-client/index.js";

const dataAsFixture = (data: any): TestFixture => {
    return data as TestFixture;
}

interface TestFixture {
    data: any
    expected: JsonPlayObject
}

const createJfApi = (data: JellyApiData): JellyfinApiSource => {
    return new JellyfinApiSource('Test', {
        data,
        options: {}
    }, { localUrl: new URL('http://test'), configDir: 'test', logger: loggerTest, version: 'test' }, new EventEmitter());
}

const defaultJfApiCreds = {url: 'http://example.com', user: 'MyUser', apiKey: '1234'};

const validPlay = generatePlay({}, {mediaType: 'Audio', user: 'MyUser', deviceId: '1234'});
const playWithMeta = (meta: PlayMeta): PlayObject => ({...validPlay, meta: {...validPlay.meta, ...meta}});

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
    
        it('Should parse users and devices as lowercase from config', async function () {
            const jf = createJfApi({
                usersAllow: ['MyUser', 'AnotherUser'],
                usersBlock: ['SomeUser'],
                devicesAllow: ['Web Player'],
                devicesBlock: ['Bad Player'],
                ...defaultJfApiCreds});
            await jf.buildInitData();

            expect(jf.usersAllow).to.be.eql(['myuser', 'anotheruser']);
            expect(jf.usersBlock).to.be.eql(['someuser']);
            expect(jf.devicesAllow).to.be.eql(['web player']);
            expect(jf.devicesBlock).to.be.eql(['bad player']);
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
        it('Should allow activity based on user allow', async function () {
            const jf = createJfApi({...defaultJfApiCreds});
            await jf.buildInitData();

            expect(jf.isActivityValid(playWithMeta({user: 'SomeOtherUser'}), validSession)).to.not.be.true;
            expect(jf.isActivityValid(validPlay, validSession)).to.be.true;
            expect(jf.isActivityValid(playWithMeta({user: 'myuser'}), validSession)).to.be.true;
            await jf.destroy();
        });

        it('Should disallow activity based on user block', async function () {
            const jf = createJfApi({...defaultJfApiCreds, usersAllow: true, usersBlock: ['BadUser']});
            await jf.buildInitData();

            expect(jf.isActivityValid(playWithMeta({user: 'BadUser'}), validSession)).to.not.be.true;
            expect(jf.isActivityValid(validPlay, validSession)).to.be.true;
            expect(jf.isActivityValid(playWithMeta({user: 'myuser'}), validSession)).to.be.true;
            await jf.destroy();
        });

        it('Should allow activity based on devices allow', async function () {
            const jf = createJfApi({...defaultJfApiCreds, usersAllow: true, devicesAllow: ['WebPlayer']});
            await jf.buildInitData();

            expect(jf.isActivityValid(validPlay, validSession)).to.not.be.true;
            expect(jf.isActivityValid(playWithMeta({deviceId: 'WebPlayer'}), validSession)).to.be.true;
            await jf.destroy();
        });

        it('Should disallow activity based on devices block', async function () {
            const jf = createJfApi({...defaultJfApiCreds, usersAllow: true, devicesBlock: ['WebPlayer']});
            await jf.buildInitData();

            expect(jf.isActivityValid(validPlay, validSession)).to.be.true;
            expect(jf.isActivityValid(playWithMeta({deviceId: 'WebPlayer'}), validSession)).to.not.be.true;
            await jf.destroy();
        });

        it('Should disallow NowPlayingItem that is not valid Type', async function () {
            const jf = createJfApi({...defaultJfApiCreds});
            await jf.buildInitData();

            expect(jf.isActivityValid(validPlay, nowPlayingSession({Type: 'Book'}))).to.not.be.true;
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

            expect(jf.isActivityValid(validPlay, nowPlayingSession({ExtraType: 'ThemeSong'}))).to.not.be.true;
            await jf.destroy();
        });
    });
});
