import { loggerTest } from "@foxxmd/logging";
import { assert, expect } from 'chai';
import EventEmitter from "events";
import { describe, it } from 'mocha';
import { JsonPlayObject } from "../../../core/Atomic.js";

import JellyfinSource from "../../sources/JellyfinSource.js";
import JellyfinApiSource from "../../sources/JellyfinApiSource.js";
import samplePayload from './playbackProgressSample.json';
import { JellyApiData } from "../../common/infrastructure/config/source/jellyfin.js";

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
        });

        it('Should include authenticating user as allowed when no others are set', async function () {
            const jf = createJfApi({...defaultJfApiCreds});
            await jf.buildInitData();

            expect(jf.usersAllow).to.be.eql(['myuser']);
        });

        it('Should set allowed users to empty array (allow all) when usersAllow is true', async function () {
            const jf = createJfApi({...defaultJfApiCreds, usersAllow: true});
            await jf.buildInitData();

            expect(jf.usersAllow).to.be.empty;
        });

        it('Should set allowed users to empty array (allow all) when usersAllow is an array with only one value equal to true', async function () {
            const jf = createJfApi({...defaultJfApiCreds, usersAllow: ['true']});
            await jf.buildInitData();

            expect(jf.usersAllow).to.be.empty;
        });
    });

    describe('Correctly detects activity as valid/invalid', function() {
        it('Show allow activity based on user allow', async function () {
            const jf = createJfApi({...defaultJfApiCreds});
            await jf.buildInitData();

            expect(jf.isActivityValid('1234', 'SomeOtherUser')).to.not.be.true;
            expect(jf.isActivityValid('1234', 'MyUser')).to.be.true;
            expect(jf.isActivityValid('1234', 'myuser')).to.be.true;
        });

        it('Show disallow activity based on user block', async function () {
            const jf = createJfApi({...defaultJfApiCreds, usersAllow: true, usersBlock: ['BadUser']});
            await jf.buildInitData();

            expect(jf.isActivityValid('1234', 'BadUser')).to.not.be.true;
            expect(jf.isActivityValid('1234', 'MyUser')).to.be.true;
            expect(jf.isActivityValid('1234', 'myuser')).to.be.true;
        });

        it('Show allow activity based on devices allow', async function () {
            const jf = createJfApi({...defaultJfApiCreds, usersAllow: true, devicesAllow: ['WebPlayer']});
            await jf.buildInitData();

            expect(jf.isActivityValid('1234', 'MyUser')).to.not.be.true;
            expect(jf.isActivityValid('WebPlayer', 'MyUser')).to.be.true;
        });

        it('Show disallow activity based on devices block', async function () {
            const jf = createJfApi({...defaultJfApiCreds, usersAllow: true, devicesBlock: ['WebPlayer']});
            await jf.buildInitData();

            expect(jf.isActivityValid('1234', 'MyUser')).to.be.true;
            expect(jf.isActivityValid('WebPlayer', 'MyUser')).to.not.be.true;
        });
    });
});
