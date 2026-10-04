import { loggerTest } from "@foxxmd/logging";
import { assert, expect } from 'chai';
import EventEmitter from "events";
import { mkdtempSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { describe, it } from 'mocha';
import { http, HttpResponse } from "msw";
import { COMPONENT_AUTH_TYPE, PARSED_FROM } from "../../../core/Atomic.ts";
import { artistCreditsToNames } from "../../../core/StringUtils.ts";
import type { MixcloudData, MixcloudListen } from "../../common/infrastructure/config/source/mixcloud.ts";
import MixcloudSource from "../../sources/MixcloudSource.ts";
import { withRequestInterception } from "../utils/networking.ts";
import listensResponse from './listens.json' with { type: "json" };

// Mixcloud serves JSON with a text/javascript content-type
const mixcloudJson = (body: object, init: ResponseInit = {}) => new HttpResponse(JSON.stringify(body), {
    ...init,
    headers: { 'Content-Type': 'text/javascript; charset=utf-8' }
});

const listens = listensResponse.data as MixcloudListen[];

const appData: MixcloudData = { clientId: 'cid', clientSecret: 'secret' };

const createSource = (data: MixcloudData = { username: 'TestUser' }, name: string = 'Test'): MixcloudSource => new MixcloudSource(name, {
    id: `test-${Date.now()}`,
    data,
    options: {}
}, { localUrl: new URL('http://test'), configDir: 'test', logger: loggerTest, version: 'test' }, new EventEmitter());

/** A source with app credentials whose credentials file lives in a temp dir */
const createAuthSource = (): { source: MixcloudSource, cleanup: () => void } => {
    const configDir = mkdtempSync(join(tmpdir(), 'ms-mixcloud-test-'));
    const source = new MixcloudSource('Test', {
        id: `test-${Date.now()}`,
        data: appData,
        options: {}
    }, { localUrl: new URL('http://test'), configDir, logger: loggerTest, version: 'test' }, new EventEmitter());
    return { source, cleanup: () => rmSync(configDir, { recursive: true, force: true }) };
};

describe('Mixcloud Source', function () {

    describe('Play Parsing', function () {

        it('Parses a listen as a single play for the entire mix', function () {
            const play = MixcloudSource.formatPlayObj(listens[0]);

            assert.equal(play.data.track, 'Late Night Session #12');
            assert.equal(play.data.duration, 7198);
            assert.isUndefined(play.data.album);
            assert.equal(play.data.playDate!.toISOString(), '2026-06-15T13:38:24.000Z');
            assert.equal(play.meta.trackId, '/SomeRadio/late-night-session-12/');
            assert.equal(play.meta.url!.web, 'https://www.mixcloud.com/SomeRadio/late-night-session-12/');
            assert.equal(play.meta.art!.track, 'https://thumbnailer.mixcloud.com/unsafe/300x300/extaudio/a/b/c');
        });

        it('Uses credited hosts as artists', function () {
            const play = MixcloudSource.formatPlayObj(listens[0]);
            assert.sameOrderedMembers(artistCreditsToNames(play.data.artists!), ['DJ One', 'DJ Two']);
        });

        it('Falls back to the uploader as artist when there are no hosts', function () {
            const play = MixcloudSource.formatPlayObj(listens[1]);
            assert.sameOrderedMembers(artistCreditsToNames(play.data.artists!), ['Solo DJ']);
            assert.equal(play.meta.art!.track, 'https://thumbnailer.mixcloud.com/unsafe/100x100/extaudio/d/e/f');
        });
    });

    describe('Startup', function () {

        it('Fails init when username is empty', async function () {
            const source = createSource({ username: ' ' });
            try {
                await source.buildInitData();
                assert.fail('Expected init to throw');
            } catch (e) {
                expect(source.buildOK).to.be.false;
            }
        });

        it('Does not require auth with only a username', async function () {
            const source = createSource();
            await source.buildInitData();
            expect(source.authType).to.equal(COMPONENT_AUTH_TYPE.none);
            expect(source.requiresAuth).to.be.false;
        });

        it('Fails init when neither username nor app credentials are defined', async function () {
            const source = createSource({});
            try {
                await source.buildInitData();
                assert.fail('Expected init to throw');
            } catch (e) {
                expect(source.buildOK).to.be.false;
                expect(((e as Error).cause as Error).message).to.include('username must be defined');
            }
        });

        it('Fails init when clientId is defined without clientSecret', async function () {
            const source = createSource({ clientId: 'cid' });
            try {
                await source.buildInitData();
                assert.fail('Expected init to throw');
            } catch (e) {
                expect(source.buildOK).to.be.false;
                expect(((e as Error).cause as Error).message).to.include('clientId and clientSecret must both be defined');
            }
        });

        it('Connection check succeeds when user exists', withRequestInterception(
            [
                http.get('https://api.mixcloud.com/TestUser/', () => mixcloudJson({
                    key: '/testuser/',
                    name: 'TestUser',
                    username: 'testuser'
                }))
            ],
            async function () {
                const source = createSource();
                await source.buildInitData();
                await source.checkConnection();
                expect(source.connectionOK).to.be.true;
            }
        ));

        it('Connection check fails with Mixcloud error when user does not exist', withRequestInterception(
            [
                http.get('https://api.mixcloud.com/TestUser/', () => mixcloudJson({
                    error: {
                        type: 'ResourceNotFoundException',
                        message: 'User does not exist.'
                    }
                }, { status: 404 }))
            ],
            async function () {
                const source = createSource();
                await source.buildInitData();
                try {
                    await source.checkConnection();
                    assert.fail('Expected connection check to throw');
                } catch (e) {
                    expect(source.connectionOK).to.be.false;
                    expect((e as Error).cause).to.be.instanceOf(Error);
                    expect(((e as Error).cause as Error).message).to.include('User does not exist.');
                }
            }
        ));
    });

    describe('Authentication', function () {

        it('Requires interactive auth when app credentials are defined', function () {
            const { source, cleanup } = createAuthSource();
            try {
                expect(source.authType).to.equal(COMPONENT_AUTH_TYPE.interactive);
                expect(source.requiresAuth).to.be.true;
                expect(source.requiresAuthInteraction).to.be.true;
            } finally {
                cleanup();
            }
        });

        it('Builds an authorize url with client id and redirect uri', function () {
            const { source, cleanup } = createAuthSource();
            try {
                const url = new URL(source.createAuthUrl()!);
                expect(url.origin + url.pathname).to.equal('https://www.mixcloud.com/oauth/authorize');
                expect(url.searchParams.get('client_id')).to.equal('cid');
                expect(url.searchParams.get('redirect_uri')).to.equal('http://test/api/mixcloud/callback?name=Test');
            } finally {
                cleanup();
            }
        });

        it('Authentication fails when no access token has been received', async function () {
            const { source, cleanup } = createAuthSource();
            try {
                await source.buildInitData();
                try {
                    await source.testAuth(true);
                    assert.fail('Expected auth to throw');
                } catch (e) {
                    expect(((e as Error).cause as Error).message).to.include('access token');
                }
            } finally {
                cleanup();
            }
        });

        it('Exchanges an oauth code for a token, persists it, and resolves the user', withRequestInterception(
            [
                http.get('https://www.mixcloud.com/oauth/access_token', ({ request }) => {
                    const url = new URL(request.url);
                    const expected = {
                        client_id: 'cid',
                        client_secret: 'secret',
                        redirect_uri: 'http://test/api/mixcloud/callback?name=Test',
                        code: 'thecode'
                    };
                    for (const [key, value] of Object.entries(expected)) {
                        if (url.searchParams.get(key) !== value) {
                            return HttpResponse.json({ error: `unexpected ${key}` }, { status: 400 });
                        }
                    }
                    return HttpResponse.json({ access_token: 'tok123' });
                }),
                http.get('https://api.mixcloud.com/me/', ({ request }) => {
                    const url = new URL(request.url);
                    if (url.searchParams.get('access_token') !== 'tok123') {
                        return mixcloudJson({ error: { type: 'Test', message: 'unexpected access token' } }, { status: 400 });
                    }
                    return mixcloudJson({ username: 'ProUser', name: 'Pro User' });
                })
            ],
            async function () {
                const { source, cleanup } = createAuthSource();
                try {
                    await source.buildInitData();
                    const result = await source.handleAuthCodeCallback({ code: 'thecode' });
                    expect(result).to.be.true;
                    expect(source.accessToken).to.equal('tok123');
                    expect(source.authUsername).to.equal('ProUser');
                    const persisted = JSON.parse(readFileSync(source.workingCredsPath!, 'utf8'));
                    expect(persisted).to.deep.equal({ token: 'tok123' });
                } finally {
                    cleanup();
                }
            }
        ));

        it('Returns the oauth error when the user denies access', async function () {
            const { source, cleanup } = createAuthSource();
            try {
                const result = await source.handleAuthCodeCallback({ error: 'access_denied' });
                expect(result).to.equal('access_denied');
            } finally {
                cleanup();
            }
        });
    });

    describe('Recently Played', function () {

        it('Returns listens as history plays sorted oldest first', withRequestInterception(
            [
                http.get('https://api.mixcloud.com/TestUser/listens/', ({ request }) => {
                    const url = new URL(request.url);
                    if (url.searchParams.get('limit') !== '20') {
                        return mixcloudJson({ error: { type: 'Test', message: 'unexpected limit' } }, { status: 400 });
                    }
                    return mixcloudJson(listensResponse);
                })
            ],
            async function () {
                const source = createSource();
                await source.buildInitData();
                const plays = await source.getRecentlyPlayed();

                expect(plays).to.have.length(2);
                assert.equal(plays[0].data.track, 'Deep House Mix 2026');
                assert.equal(plays[1].data.track, 'Late Night Session #12');
                for (const play of plays) {
                    assert.equal(play.meta.parsedFrom, PARSED_FROM.history);
                }
            }
        ));

        it('Returns no plays when listening history is empty', withRequestInterception(
            [
                http.get('https://api.mixcloud.com/TestUser/listens/', () => mixcloudJson({ data: [], paging: {} }))
            ],
            async function () {
                const source = createSource();
                await source.buildInitData();
                const plays = await source.getRecentlyPlayed();
                expect(plays).to.have.length(0);
            }
        ));

        it('Reads listens from the authorized user with an access token', withRequestInterception(
            [
                http.get('https://api.mixcloud.com/me/listens/', ({ request }) => {
                    const url = new URL(request.url);
                    if (url.searchParams.get('access_token') !== 'tok123') {
                        return mixcloudJson({ error: { type: 'Test', message: 'unexpected access token' } }, { status: 400 });
                    }
                    if (url.searchParams.get('limit') !== '20') {
                        return mixcloudJson({ error: { type: 'Test', message: 'unexpected limit' } }, { status: 400 });
                    }
                    return mixcloudJson(listensResponse);
                })
            ],
            async function () {
                const { source, cleanup } = createAuthSource();
                try {
                    await source.buildInitData();
                    source.accessToken = 'tok123';
                    const plays = await source.getRecentlyPlayed();
                    expect(plays).to.have.length(2);
                    assert.equal(plays[0].data.track, 'Deep House Mix 2026');
                } finally {
                    cleanup();
                }
            }
        ));
    });
});
