import { loggerTest } from "@foxxmd/logging";
import { assert, expect } from 'chai';
import EventEmitter from "events";
import { describe, it } from 'mocha';
import { JsonPlayObject, PlayMeta, PlayObject } from "../../../core/Atomic.js";

import validSessionResponse from './validSession.json';
import { generatePlay } from "../utils/PlayTestUtils.js";
import { PlayerStateDataMaybePlay } from "../../common/infrastructure/Atomic.js";
import { PlexApiData } from "../../common/infrastructure/config/source/plex.js";
import PlexApiSource from "../../sources/PlexApiSource.js";
import { GetSessionsMetadata } from "@lukehagar/plexjs/sdk/models/operations/getsessions.js";
import { MarkOptional } from "ts-essentials";
import { defaultLifecycle } from "../../utils/PlayTransformUtils.js";

const validSession = validSessionResponse.object.mediaContainer.metadata[0];

const createSource = async (data: PlexApiData, authedUser: string | false = 'MyUser'): Promise<PlexApiSource> => {
    const source = new PlexApiSource('Test', {
        data,
        options: {}
    }, { localUrl: new URL('http://test'), configDir: 'test', logger: loggerTest, version: 'test' }, new EventEmitter());
    source.libraries = [{name: 'Music', collectionType: 'artist', uuid: 'dfsdf'}];
    source.plexUser = 'MyUser';
    await source.buildInitData();
    if(authedUser !== false && source.usersAllow.length === 0 && data.usersAllow !== true) {
        source.usersAllow.push(authedUser.toLocaleLowerCase());
    }
    return source;
}

const defaultCreds = {url: 'http://example.com', token: '1234'};

const validPlayerState: PlayerStateDataMaybePlay = {
    platformId: ['1234', 'MyUser'],
    play: generatePlay({}, {mediaType: 'track', user: 'MyUser', deviceId: '1234', library: 'Music'})
}
const playWithMeta = (meta: MarkOptional<PlayMeta, 'lifecycle'>): PlayerStateDataMaybePlay => {
    const {user, deviceId} = meta;
    const platformId = validPlayerState.platformId;
    return {
    ...validPlayerState,
    platformId: [deviceId ?? platformId[0], user ?? platformId[1]],
    play: {
        ...validPlayerState.play,
        meta: {
            lifecycle: defaultLifecycle(),
            ...validPlayerState.play?.meta,
            ...meta
        }
    }
}}// ({...validPlayerState, meta: {...validPlayerState.meta, ...meta}});

const nowPlayingSession = (data: object = {}): GetSessionsMetadata => ({...validSession, ...data});

describe("Plex API Source", function() {
    describe('Parses config allow/block correctly', function () {
    
        it('Should parse users, devices, and libraries, and library types as lowercase from config', async function () {
            const s = await createSource({
                usersAllow: ['MyUser', 'AnotherUser'],
                usersBlock: ['SomeUser'],
                devicesAllow: ['Web Player'],
                devicesBlock: ['Bad Player'],
                librariesAllow: ['MuSiCoNe'],
                librariesBlock: ['MuSiCbAd'],
                ...defaultCreds});

            expect(s.usersAllow).to.be.eql(['myuser', 'anotheruser']);
            expect(s.usersBlock).to.be.eql(['someuser']);
            expect(s.devicesAllow).to.be.eql(['web player']);
            expect(s.devicesBlock).to.be.eql(['bad player']);
            expect(s.librariesAllow).to.be.eql(['musicone']);
            expect(s.librariesBlock).to.be.eql(['musicbad']);
            await s.destroy();
        });

        it('Should include authenticating user as allowed when no others are set', async function () {
            const s = await createSource({...defaultCreds});

            expect(s.usersAllow).to.be.eql(['myuser']);
            await s.destroy();
        });

        it('Should set allowed users to empty array (allow all) when usersAllow is true', async function () {
            const s = await createSource({...defaultCreds, usersAllow: true}, false);

            expect(s.usersAllow).to.be.empty;
            await s.destroy();
        });

        it('Should set allowed users to empty array (allow all) when usersAllow is an array with only one value equal to true', async function () {
            const s = await createSource({...defaultCreds, usersAllow: ['true']}, false);

            expect(s.usersAllow).to.be.empty;
            await s.destroy();
        });
    });

    describe('Correctly detects activity as valid/invalid', function() {

        describe('Filters from Configuration', function() {

            it('Should allow activity based on user allow', async function () {
                const s = await createSource({...defaultCreds});
    
                expect(s.isActivityValid(playWithMeta({user: 'SomeOtherUser'}), validSession)).to.not.be.true;
                expect(s.isActivityValid(validPlayerState, validSession)).to.be.true;
                expect(s.isActivityValid(playWithMeta({user: 'myuser'}), validSession)).to.be.true;
                await s.destroy();
            });
    
            it('Should disallow activity based on user block', async function () {
                const s = await createSource({...defaultCreds, usersBlock: ['BadUser']});
    
                expect(s.isActivityValid(playWithMeta({user: 'BadUser'}), validSession)).to.not.be.true;
                expect(s.isActivityValid(validPlayerState, validSession)).to.be.true;
                expect(s.isActivityValid(playWithMeta({user: 'myuser'}), validSession)).to.be.true;
                await s.destroy();
            });
    
            it('Should allow activity based on devices allow', async function () {
                const s =  await createSource({...defaultCreds, devicesAllow: ['WebPlayer']});
    
                expect(s.isActivityValid(validPlayerState, validSession)).to.not.be.true;
                expect(s.isActivityValid(playWithMeta({deviceId: 'WebPlayer'}), validSession)).to.be.true;
                await s.destroy();
            });
    
            it('Should disallow activity based on devices block', async function () {
                const s = await createSource({...defaultCreds, devicesBlock: ['WebPlayer']});
    
                expect(s.isActivityValid(validPlayerState, validSession)).to.be.true;
                expect(s.isActivityValid(playWithMeta({deviceId: 'WebPlayer'}), validSession)).to.not.be.true;
                await s.destroy();
            });

            it('Should allow activity based on libraries allow', async function () {
                const s = await createSource({...defaultCreds, librariesAllow: ['music']});
                s.libraries.push({name: 'SomeOtherLibrary', collectionType: 'artist', uuid: '43543'});
                s.libraries.push({name: 'Study Music', collectionType: 'artist', uuid: '435437'});
                s.libraries.push({name: 'Music', collectionType: 'artist', uuid: '4354378'});
    
                expect(s.isActivityValid(validPlayerState, validSession)).to.be.true;
                expect(s.isActivityValid(playWithMeta({library: 'SomeOtherLibrary'}), nowPlayingSession({librarySectionTitle: 'SomeOtherLibrary'}))).to.not.be.true;
                expect(s.isActivityValid(playWithMeta({library: 'Study Music'}), nowPlayingSession({librarySectionTitle: 'Study Music'}))).to.not.be.true;
                expect(s.isActivityValid(playWithMeta({library: 'Music'}), nowPlayingSession({librarySectionTitle: 'Music'}))).to.be.true;
                await s.destroy();
            });
    
            it('Should disallow activity based on libraries block', async function () {
                const s = await createSource({...defaultCreds, librariesBlock: ['music']});
                s.libraries.push({name: 'CoolVideos', collectionType: 'artist', uuid: '43543'});
                s.libraries.push({name: 'Study Music', collectionType: 'artist', uuid: '435437'});
                s.libraries.push({name: 'Music', collectionType: 'artist', uuid: '4354378'});
    
                expect(s.isActivityValid(validPlayerState, validSession)).to.not.be.true;
                expect(s.isActivityValid(playWithMeta({library: 'CoolVideos'}), nowPlayingSession({librarySectionTitle: 'CoolVideos'}))).to.be.true;
                expect(s.isActivityValid(playWithMeta({library: 'Study Music'}), nowPlayingSession({librarySectionTitle: 'Study Music'}))).to.be.true;
                expect(s.isActivityValid(playWithMeta({library: 'Music'}), nowPlayingSession({librarySectionTitle: 'Music'}))).to.not.be.true;
                await s.destroy();
            });

        });

        describe('Detection by Session/Media/Library Type', function() {

            it('Should allow activity with valid MediaType and valid Library', async function () {
                const s = await createSource({...defaultCreds});
    
                expect(s.isActivityValid(validPlayerState, validSession)).to.be.true;
                await s.destroy();
            });

            it('Should disallow activity with invalid library type', async function () {
                const s = await createSource({...defaultCreds});
                s.libraries.push({name: 'CoolVideos', uuid: '64564', collectionType: 'shows'});
    
                expect(s.isActivityValid(playWithMeta({library: 'CoolVideos'}), nowPlayingSession({librarySectionTitle: 'CoolVideos'}))).to.not.be.true;
                await s.destroy();
            });
    
            it('Should disallow Play that is not valid MediaType', async function () {
                const s = await createSource({...defaultCreds});
    
                expect(s.isActivityValid(playWithMeta({mediaType: 'book'}), validSession)).to.not.be.true;
                await s.destroy();
            });

        });
    });
});
