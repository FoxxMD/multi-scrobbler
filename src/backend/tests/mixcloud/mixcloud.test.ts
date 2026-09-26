import { loggerTest } from "@foxxmd/logging";
import { assert, expect } from 'chai';
import EventEmitter from "events";
import { describe, it } from 'mocha';
import { http, HttpResponse } from "msw";
import { PARSED_FROM } from "../../../core/Atomic.ts";
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

const createSource = (data: MixcloudData = { username: 'TestUser' }): MixcloudSource => new MixcloudSource('Test', {
    id: `test-${Date.now()}`,
    data,
    options: {}
}, { localUrl: new URL('http://test'), configDir: 'test', logger: loggerTest, version: 'test' }, new EventEmitter());

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
    });
});
